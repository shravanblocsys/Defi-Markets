import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateFeesManagementDto } from './dto/create-fees-management.dto';
import { UpdateFeesManagementDto } from './dto/update-fees-management.dto';
import { FeesManagement, FeesManagementDocument } from './entities/fees-management.entity';
import { ProfileService } from '../profile/profile.service';
import { HistoryService } from '../history/history.service';
import { CacheUtilsService } from '../../utils/cache/cache-utils.service';

@Injectable()
export class FeesManagementService {
  private readonly logger = new Logger(FeesManagementService.name);

  constructor(
    @InjectModel(FeesManagement.name) private feesManagementModel: Model<FeesManagementDocument>,
    private profileService: ProfileService,
    private historyService: HistoryService,
    private cacheUtilsService: CacheUtilsService
  ) {}

  async create(createFeesManagementDto: CreateFeesManagementDto, vaultId?: string, user?: any): Promise<FeesManagement> {
    
    // Ensure createdBy is set from user if not provided in DTO
    if (!createFeesManagementDto.createdBy && user?._id) {
      createFeesManagementDto.createdBy = user._id;
    }
    
    // Validate that the profile exists
    if (createFeesManagementDto.createdBy) {
      await this.validateProfileId(createFeesManagementDto.createdBy);
    } else {
      throw new BadRequestException('Creator profile ID is required');
    }
    
    // Validate fees array is not empty
    if (!createFeesManagementDto.fees || createFeesManagementDto.fees.length === 0) {
      throw new BadRequestException('At least one fee configuration is required');
    }
    
    // Check for duplicate fee types within the array
    const feeTypes = createFeesManagementDto.fees.map(fee => fee.type);
    const uniqueTypes = new Set(feeTypes);
    if (feeTypes.length !== uniqueTypes.size) {
      throw new BadRequestException('Duplicate fee types are not allowed in the same configuration');
    }

    // Validate fee structure based on type
    for (const fee of createFeesManagementDto.fees) {
      if (fee.type === 'management') {
        // Management type requires minFeeRate and maxFeeRate
        if (fee.minFeeRate === undefined || fee.maxFeeRate === undefined) {
          throw new BadRequestException('Management fee type requires both minFeeRate and maxFeeRate');
        }
        if (fee.minFeeRate < 0 || fee.maxFeeRate < 0) {
          throw new BadRequestException('Management fee rates cannot be negative');
        }
        if (fee.minFeeRate >= fee.maxFeeRate) {
          throw new BadRequestException('Management minFeeRate must be less than maxFeeRate');
        }
        if (fee.feeRate !== undefined) {
          throw new BadRequestException('Management fee type should not have feeRate, use minFeeRate and maxFeeRate instead');
        }
      } else {
        // Other types require feeRate
        if (fee.feeRate === undefined) {
          throw new BadRequestException(`Fee type ${fee.type} requires feeRate`);
        }
        if (fee.feeRate < 0) {
          throw new BadRequestException(`Fee rate cannot be negative for ${fee.type}`);
        }
        if (fee.minFeeRate !== undefined || fee.maxFeeRate !== undefined) {
          throw new BadRequestException(`Fee type ${fee.type} should not have minFeeRate or maxFeeRate, use feeRate instead`);
        }
      }
    }

    const createdFee = new this.feesManagementModel({
      ...createFeesManagementDto,
      isActive: createFeesManagementDto.isActive ?? true
    });
    
    const savedFee = await createdFee.save();
    
    // Create history entry for fee creation
    const feeTypesString = savedFee.fees.map(f => f.type).join(', ');
    await this.historyService.create({
      action: 'fee_created',
      description: `Fee configuration created with ${savedFee.fees.length} fee(s): ${feeTypesString}`,
      performedBy: user?._id,
      feeId: savedFee._id.toString(),
      relatedEntity: 'fee',
      vaultId: vaultId, // Optional vault ID if provided
      metadata: {
        fees: savedFee.fees,
        isActive: savedFee.isActive
      }
    });
    await this.cacheUtilsService.clearFeesCache();
    return this.findOne(savedFee._id.toString());
  }

  async findAll(): Promise<FeesManagement[]> {
    return this.feesManagementModel
      .find({ isActive: true })
      .populate('createdBy', 'username email name')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<FeesManagement> {
    
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid fee management ID format');
    }

    const fee = await this.feesManagementModel
      .findById(id)
      .populate('createdBy', 'username email name')
      .exec();

    if (!fee) {
      throw new NotFoundException(`Fee management entry with ID ${id} not found`);
    }

    return fee;
  }

  async update(id: string, updateFeesManagementDto: UpdateFeesManagementDto, performedBy: string, vaultId?: string): Promise<FeesManagement> {
    
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid fee management ID format');
    }

    // Get the original fee before update for history tracking
    const originalFee = await this.feesManagementModel.findById(id).exec();
    if (!originalFee) {
      throw new NotFoundException(`Fee management entry with ID ${id} not found`);
    }

    // Check if any fields are being updated
    const updateFields = Object.keys(updateFeesManagementDto).filter(key => updateFeesManagementDto[key] !== undefined);
    if (updateFields.length === 0) {
      throw new BadRequestException('No fields provided for update');
    }

    // If createdBy is being updated, validate the profile
    if (updateFeesManagementDto.createdBy) {
      await this.validateProfileId(updateFeesManagementDto.createdBy);
    }

    let updateData: any = {};
    
    // Handle fees array update (PATCH-like behavior)
    if (updateFeesManagementDto.fees) {
      if (updateFeesManagementDto.fees.length === 0) {
        throw new BadRequestException('At least one fee configuration is required');
      }

      this.logger.log(`Update request: ${updateFeesManagementDto.fees.length} fee(s) provided`);
      this.logger.log(`Incoming fees: ${JSON.stringify(updateFeesManagementDto.fees)}`);
      this.logger.log(`Original fees: ${JSON.stringify(originalFee.fees)}`);

      // PATCH Logic: If only one fee is provided, merge it with existing fees
      if (updateFeesManagementDto.fees.length === 1) {
        const incomingFee = updateFeesManagementDto.fees[0];
        
        // Validate the incoming fee
        await this.validateSingleFee(incomingFee);
        
        // Clone existing fees array (properly handle Mongoose documents)
        const updatedFeesArray = originalFee.fees.map(fee => ({
          feeRate: fee.feeRate,
          minFeeRate: fee.minFeeRate,
          maxFeeRate: fee.maxFeeRate,
          description: fee.description,
          type: fee.type,
          notes: fee.notes
        }));
        
        // Find existing fee with same type
        const existingFeeIndex = updatedFeesArray.findIndex(fee => fee.type === incomingFee.type);
        
        if (existingFeeIndex !== -1) {
          // Update existing fee (PATCH behavior)
          const existingFee = updatedFeesArray[existingFeeIndex];
          updatedFeesArray[existingFeeIndex] = {
            ...existingFee,
            ...Object.fromEntries(
              Object.entries(incomingFee).filter(([_, value]) => value !== undefined)
            ), // Only override defined values
          };
          
          this.logger.log(`PATCH: Updated existing ${incomingFee.type} fee from rate ${existingFee.feeRate} to ${incomingFee.feeRate}`);
        } else {
          // Add new fee type (ensure required fields are present)
          if (!incomingFee.type) {
            throw new BadRequestException('Fee type is required for new fee entries');
          }
          updatedFeesArray.push(incomingFee as any);
          this.logger.log(`PATCH: Added new ${incomingFee.type} fee`);
        }
        
        updateData.fees = updatedFeesArray;
        this.logger.log(`PATCH: Final fees array: ${JSON.stringify(updatedFeesArray)}`);
      } else {
        // Multiple fees: Replace entire array (existing behavior)
        // Validate all fees
        for (const fee of updateFeesManagementDto.fees) {
          await this.validateSingleFee(fee);
        }
        
        // Check for duplicate fee types within the updated array
        const feeTypes = updateFeesManagementDto.fees.map(fee => fee.type).filter(type => type !== undefined);
        const uniqueTypes = new Set(feeTypes);
        if (feeTypes.length !== uniqueTypes.size) {
          throw new BadRequestException('Duplicate fee types are not allowed in the same configuration');
        }
        
        updateData.fees = updateFeesManagementDto.fees;
      }
    }

    // Handle other fields (isActive, createdBy)
    if (updateFeesManagementDto.isActive !== undefined) {
      updateData.isActive = updateFeesManagementDto.isActive;
    }
    
    if (updateFeesManagementDto.createdBy !== undefined) {
      updateData.createdBy = updateFeesManagementDto.createdBy;
    }

    const updatedFee = await this.feesManagementModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('createdBy', 'username email name')
      .exec();

    if (!updatedFee) {
      throw new NotFoundException(`Fee management entry with ID ${id} not found`);
    }

    // Create history entry for fee update with detailed change tracking
    const changeDetails = this.generateChangeDetails(originalFee, updatedFee, updateFeesManagementDto);
    
    await this.historyService.create({
      action: 'fee_updated',
      description: changeDetails.description,
      performedBy: performedBy,
      feeId: updatedFee._id.toString(),
      relatedEntity: 'fee',
      vaultId: vaultId, // Optional vault ID if provided
      metadata: {
        updateType: updateFeesManagementDto.fees && updateFeesManagementDto.fees.length === 1 ? 'patch' : 'full_update',
        changedFields: changeDetails.changedFields,
        changes: changeDetails.changes
      }
    });

    await this.cacheUtilsService.clearFeesCache();
    return updatedFee;
  }

  // Helper method to generate detailed change tracking for history
  private generateChangeDetails(originalFee: any, updatedFee: any, updateDto: UpdateFeesManagementDto): any {
    const changes: any = {};
    const changedFields: string[] = [];
    const descriptions: string[] = [];

    // Track isActive changes
    if (updateDto.isActive !== undefined && originalFee.isActive !== updatedFee.isActive) {
      changes.isActive = {
        from: originalFee.isActive,
        to: updatedFee.isActive
      };
      changedFields.push('isActive');
      descriptions.push(`Status changed from ${originalFee.isActive ? 'active' : 'inactive'} to ${updatedFee.isActive ? 'active' : 'inactive'}`);
    }

    // Track createdBy changes
    if (updateDto.createdBy !== undefined && originalFee.createdBy.toString() !== updatedFee.createdBy.toString()) {
      changes.createdBy = {
        from: originalFee.createdBy.toString(),
        to: updatedFee.createdBy.toString()
      };
      changedFields.push('createdBy');
      descriptions.push(`Creator changed`);
    }

    // Track fees array changes
    if (updateDto.fees) {
      const feeChanges = this.compareFeeArrays(originalFee.fees, updatedFee.fees, updateDto.fees);
      if (feeChanges.hasChanges) {
        changes.fees = feeChanges.changes;
        changedFields.push('fees');
        descriptions.push(...feeChanges.descriptions);
      }
    }

    // Generate overall description
    const description = descriptions.length > 0 
      ? descriptions.join('; ')
      : 'Fee configuration updated';

    return {
      description,
      changedFields,
      changes
    };
  }

  // Helper method to compare fee arrays and identify specific changes
  private compareFeeArrays(originalFees: any[], updatedFees: any[], inputFees: any[]): any {
    const changes: any = {};
    const descriptions: string[] = [];
    let hasChanges = false;

    // If only one fee was provided (PATCH operation)
    if (inputFees.length === 1) {
      const inputFee = inputFees[0];
      const originalFee = originalFees.find(f => f.type === inputFee.type);
      const updatedFee = updatedFees.find(f => f.type === inputFee.type);

      if (originalFee && updatedFee) {
        // Compare specific fields for the updated fee type
        const feeChanges: any = {};
        const feeDescriptions: string[] = [];

        // Check feeRate changes
        if (inputFee.feeRate !== undefined && originalFee.feeRate !== updatedFee.feeRate) {
          feeChanges.feeRate = { from: originalFee.feeRate, to: updatedFee.feeRate };
          feeDescriptions.push(`${inputFee.type} fee rate: ${originalFee.feeRate}% → ${updatedFee.feeRate}%`);
          hasChanges = true;
        }

        // Check minFeeRate changes
        if (inputFee.minFeeRate !== undefined && originalFee.minFeeRate !== updatedFee.minFeeRate) {
          feeChanges.minFeeRate = { from: originalFee.minFeeRate, to: updatedFee.minFeeRate };
          feeDescriptions.push(`${inputFee.type} min fee rate: ${originalFee.minFeeRate}% → ${updatedFee.minFeeRate}%`);
          hasChanges = true;
        }

        // Check maxFeeRate changes
        if (inputFee.maxFeeRate !== undefined && originalFee.maxFeeRate !== updatedFee.maxFeeRate) {
          feeChanges.maxFeeRate = { from: originalFee.maxFeeRate, to: updatedFee.maxFeeRate };
          feeDescriptions.push(`${inputFee.type} max fee rate: ${originalFee.maxFeeRate}% → ${updatedFee.maxFeeRate}%`);
          hasChanges = true;
        }

        // Check description changes
        if (inputFee.description !== undefined && originalFee.description !== updatedFee.description) {
          feeChanges.description = { from: originalFee.description, to: updatedFee.description };
          feeDescriptions.push(`${inputFee.type} description updated`);
          hasChanges = true;
        }

        // Check notes changes
        if (inputFee.notes !== undefined && originalFee.notes !== updatedFee.notes) {
          feeChanges.notes = { from: originalFee.notes, to: updatedFee.notes };
          feeDescriptions.push(`${inputFee.type} notes updated`);
          hasChanges = true;
        }

        if (hasChanges) {
          changes[inputFee.type] = feeChanges;
          descriptions.push(...feeDescriptions);
        }
      } else if (!originalFee && updatedFee) {
        // New fee type added
        changes[inputFee.type] = { action: 'added', fee: updatedFee };
        descriptions.push(`Added new ${inputFee.type} fee`);
        hasChanges = true;
      }
    } else {
      // Multiple fees (full replacement) - track high-level changes
      const originalTypes = originalFees.map(f => f.type).sort();
      const updatedTypes = updatedFees.map(f => f.type).sort();
      
      if (JSON.stringify(originalTypes) !== JSON.stringify(updatedTypes)) {
        changes.structure = {
          from: originalTypes,
          to: updatedTypes,
          action: 'full_replacement'
        };
        descriptions.push(`Fee structure replaced with ${updatedTypes.join(', ')} types`);
        hasChanges = true;
      } else {
        // Same structure, check for all field changes
        for (const updatedFee of updatedFees) {
          const originalFee = originalFees.find(f => f.type === updatedFee.type);
          if (originalFee) {
            const feeChanges: any = {};
            let feeHasChanges = false;

            // Check feeRate changes
            if (originalFee.feeRate !== updatedFee.feeRate) {
              feeChanges.feeRate = { from: originalFee.feeRate, to: updatedFee.feeRate };
              descriptions.push(`${updatedFee.type} fee rate: ${originalFee.feeRate}% → ${updatedFee.feeRate}%`);
              feeHasChanges = true;
            }

            // Check minFeeRate changes
            if (originalFee.minFeeRate !== updatedFee.minFeeRate) {
              feeChanges.minFeeRate = { from: originalFee.minFeeRate, to: updatedFee.minFeeRate };
              descriptions.push(`${updatedFee.type} min fee rate: ${originalFee.minFeeRate}% → ${updatedFee.minFeeRate}%`);
              feeHasChanges = true;
            }

            // Check maxFeeRate changes
            if (originalFee.maxFeeRate !== updatedFee.maxFeeRate) {
              feeChanges.maxFeeRate = { from: originalFee.maxFeeRate, to: updatedFee.maxFeeRate };
              descriptions.push(`${updatedFee.type} max fee rate: ${originalFee.maxFeeRate}% → ${updatedFee.maxFeeRate}%`);
              feeHasChanges = true;
            }

            // Check description changes
            if (originalFee.description !== updatedFee.description) {
              feeChanges.description = { from: originalFee.description, to: updatedFee.description };
              descriptions.push(`${updatedFee.type} description updated`);
              feeHasChanges = true;
            }

            // Check notes changes
            if (originalFee.notes !== updatedFee.notes) {
              feeChanges.notes = { from: originalFee.notes, to: updatedFee.notes };
              descriptions.push(`${updatedFee.type} notes updated`);
              feeHasChanges = true;
            }

            if (feeHasChanges) {
              changes[updatedFee.type] = feeChanges;
              hasChanges = true;
            }
          }
        }
      }
    }

    return {
      hasChanges,
      changes,
      descriptions
    };
  }

  // Helper method to validate a single fee
  private async validateSingleFee(fee: any): Promise<void> {
    if (!fee.type) {
      throw new BadRequestException('Fee type is required');
    }

    if (fee.type === 'management') {
      // Management type validation
      if (fee.minFeeRate !== undefined && fee.minFeeRate < 0) {
        throw new BadRequestException('Management minFeeRate cannot be negative');
      }
      if (fee.maxFeeRate !== undefined && fee.maxFeeRate < 0) {
        throw new BadRequestException('Management maxFeeRate cannot be negative');
      }
      if (fee.minFeeRate !== undefined && fee.maxFeeRate !== undefined && fee.minFeeRate >= fee.maxFeeRate) {
        throw new BadRequestException('Management minFeeRate must be less than maxFeeRate');
      }
      if (fee.feeRate !== undefined) {
        throw new BadRequestException('Management fee type should not have feeRate, use minFeeRate and maxFeeRate instead');
      }
    } else {
      // Other types validation
      if (fee.feeRate !== undefined && fee.feeRate < 0) {
        throw new BadRequestException(`Fee rate cannot be negative for ${fee.type}`);
      }
      if (fee.minFeeRate !== undefined || fee.maxFeeRate !== undefined) {
        throw new BadRequestException(`Fee type ${fee.type} should not have minFeeRate or maxFeeRate, use feeRate instead`);
      }
    }
  }

  async remove(id: string, performedBy: string, vaultId?: string): Promise<{ feeId: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid fee management ID format');
    }

    const fee = await this.feesManagementModel.findById(id);
    if (!fee) {
      throw new NotFoundException(`Fee management entry with ID ${id} not found`);
    }

    // Soft delete by setting isActive to false
    await this.feesManagementModel.findByIdAndUpdate(id, { isActive: false });
    
    // Create history entry for fee deletion
    const deletedFeeTypesString = fee.fees.map(f => f.type).join(', ');
    await this.historyService.create({
      action: 'fee_deleted',
      description: `Fee configuration with ${fee.fees.length} fee(s) was deleted: ${deletedFeeTypesString}`,
      performedBy: performedBy,
      feeId: id,
      relatedEntity: 'fee',
      vaultId: vaultId, // Optional vault ID if provided
      metadata: {
        fees: fee.fees,
        isActive: fee.isActive
      }
    });
    
    return { feeId: id };
  }

  /**
   * Update fees based on FactoryFeesUpdated event data
   * @param {any} eventData - The structured event data from FactoryFeesUpdated
   * @param {string} performedBy - User ID who performed the update
   * @param {string} vaultId - Optional vault ID if provided
   * @returns {Promise<FeesManagement>} updated fee management data
   */
  async updateFeesFromFactoryEvent(eventData: any, performedBy?: string, vaultId?: string): Promise<FeesManagement> {
    this.logger.log(`Processing FactoryFeesUpdated event for factory: ${eventData.factory}`);
    
    // Find the most recent active fee configuration to update
    const existingFee = await this.feesManagementModel
      .findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .exec();

    if (!existingFee) {
      throw new NotFoundException('No active fee configuration found to update');
    }

    // Convert BPS (basis points) to percentage (divide by 100)
    // Convert USDC amounts from micro-USDC to USDC (divide by 1,000,000)
    const updatedFees = existingFee.fees.map(fee => {
      const updatedFee = { ...(fee as any).toObject() };
      
      switch (fee.type) {
        case 'entry_fee':
          if (eventData.newEntryFeeBps !== undefined) {
            updatedFee.feeRate = eventData.newEntryFeeBps / 100; // Convert BPS to percentage
            updatedFee.description = `Entry fee updated from ${eventData.oldEntryFeeBps / 100}% to ${eventData.newEntryFeeBps / 100}%`;
          }
          break;
          
        case 'exit_fee':
          if (eventData.newExitFeeBps !== undefined) {
            updatedFee.feeRate = eventData.newExitFeeBps / 100; // Convert BPS to percentage
            updatedFee.description = `Exit fee updated from ${eventData.oldExitFeeBps / 100}% to ${eventData.newExitFeeBps / 100}%`;
          }
          break;
          
        case 'vault_creation_fee':
          if (eventData.newVaultCreationFeeUsdc !== undefined) {
            // Safely convert BigInt values to numbers for micro-USDC to USDC conversion
            const oldFeeUsdc = this.safeBigIntToNumber(eventData.oldVaultCreationFeeUsdc) / 1000000;
            const newFeeUsdc = this.safeBigIntToNumber(eventData.newVaultCreationFeeUsdc) / 1000000;
            updatedFee.feeRate = newFeeUsdc; // Store as USDC amount
            updatedFee.description = `Vault creation fee updated from ${oldFeeUsdc}% to ${newFeeUsdc}%`;
          }
          break;
          
        case 'management':
          let managementUpdated = false;
          if (eventData.newMinManagementFeeBps !== undefined) {
            updatedFee.minFeeRate = eventData.newMinManagementFeeBps / 100; // Convert BPS to percentage
            managementUpdated = true;
          }
          if (eventData.newMaxManagementFeeBps !== undefined) {
            updatedFee.maxFeeRate = eventData.newMaxManagementFeeBps / 100; // Convert BPS to percentage
            managementUpdated = true;
          }
          if (managementUpdated) {
            const oldMin = eventData.oldMinManagementFeeBps / 100;
            const oldMax = eventData.oldMaxManagementFeeBps / 100;
            const newMin = eventData.newMinManagementFeeBps / 100;
            const newMax = eventData.newMaxManagementFeeBps / 100;
            updatedFee.description = `Management fee range updated from ${oldMin}% to ${newMin}% and ${oldMax}% to ${newMax}%`;
          }
          break;
          
        default:
          // Keep existing fee unchanged
          break;
      }
      
      return updatedFee;
    });

    // Update the fee configuration
    const updateData = {
      fees: updatedFees,
      updatedAt: new Date()
    };

    const updatedFeeConfig = await this.feesManagementModel
      .findByIdAndUpdate(existingFee._id, updateData, { new: true })
      .populate('createdBy', 'username email name')
      .exec();

    if (!updatedFeeConfig) {
      throw new NotFoundException(`Fee management entry with ID ${existingFee._id} not found`);
    }

    // Create history entry for factory event update
    // Handle the performedBy field - if it's a Solana wallet address, try to find the corresponding profile
    let historyPerformedBy = performedBy;
    
    if (!historyPerformedBy || !Types.ObjectId.isValid(historyPerformedBy)) {
      // Try to find a profile with the wallet address from the event
      const walletAddress = eventData.updatedBy;
      if (walletAddress) {
        try {
          const profile = await this.profileService.getByWalletAddress(walletAddress);
          if (profile) {
            historyPerformedBy = profile._id.toString();
            this.logger.log(`Found profile ${profile._id} for wallet address ${walletAddress}`);
          } else {
            this.logger.warn(`No profile found for wallet address ${walletAddress}, skipping history creation`);
            // Skip history creation if we can't find a valid profile
            this.logger.log(`Successfully updated fee configuration ${(updatedFeeConfig as any)._id} from FactoryFeesUpdated event (without history)`);
            return updatedFeeConfig;
          }
        } catch (error) {
          this.logger.warn(`Error finding profile for wallet ${walletAddress}: ${error.message}, skipping history creation`);
          // Skip history creation if we can't find a valid profile
          this.logger.log(`Successfully updated fee configuration ${(updatedFeeConfig as any)._id} from FactoryFeesUpdated event (without history)`);
          return updatedFeeConfig;
        }
      } else {
        this.logger.warn('No valid performedBy or wallet address provided, skipping history creation');
        // Skip history creation if we don't have a valid user
        this.logger.log(`Successfully updated fee configuration ${(updatedFeeConfig as any)._id} from FactoryFeesUpdated event (without history)`);
        return updatedFeeConfig;
      }
    }

    // Only create history if we have a valid MongoDB ObjectId for performedBy
    if (historyPerformedBy && Types.ObjectId.isValid(historyPerformedBy)) {
      await this.historyService.create({
        action: 'fee_updated',
        description: `Fees updated via FactoryFeesUpdated event from factory ${eventData.factory}`,
        performedBy: historyPerformedBy,
        feeId: (updatedFeeConfig as any)._id.toString(),
        relatedEntity: 'fee',
        vaultId: vaultId,
        metadata: {
          eventType: 'FactoryFeesUpdated',
          factory: eventData.factory,
          walletAddress: eventData.updatedBy,
          timestamp: eventData.timestamp,
          updatedAt: eventData.updatedAt,
          changes: {
            entryFee: eventData.oldEntryFeeBps !== eventData.newEntryFeeBps ? {
              from: eventData.oldEntryFeeBps / 100,
              to: eventData.newEntryFeeBps / 100,
              unit: '%'
            } : undefined,
            exitFee: eventData.oldExitFeeBps !== eventData.newExitFeeBps ? {
              from: eventData.oldExitFeeBps / 100,
              to: eventData.newExitFeeBps / 100,
              unit: '%'
            } : undefined,
          vaultCreationFee: eventData.oldVaultCreationFeeUsdc !== eventData.newVaultCreationFeeUsdc ? {
            from: this.safeBigIntToNumber(eventData.oldVaultCreationFeeUsdc) / 1000000,
            to: this.safeBigIntToNumber(eventData.newVaultCreationFeeUsdc) / 1000000,
            unit: '%'
          } : undefined,
            managementFeeMin: eventData.oldMinManagementFeeBps !== eventData.newMinManagementFeeBps ? {
              from: eventData.oldMinManagementFeeBps / 100,
              to: eventData.newMinManagementFeeBps / 100,
              unit: '%'
            } : undefined,
            managementFeeMax: eventData.oldMaxManagementFeeBps !== eventData.newMaxManagementFeeBps ? {
              from: eventData.oldMaxManagementFeeBps / 100,
              to: eventData.newMaxManagementFeeBps / 100,
              unit: '%'
            } : undefined
          }
        }
      });
    }

    this.logger.log(`Successfully updated fee configuration ${(updatedFeeConfig as any)._id} from FactoryFeesUpdated event`);
    await this.cacheUtilsService.clearFeesCache(); //or transaction updates
    return updatedFeeConfig;
  }

  /**
   * Find fee configuration by factory address
   * Note: Currently, the FeesManagement schema doesn't have a factory field.
   * This method returns the most recent active fee configuration as factory-level
   * fee updates affect the global fee configuration.
   * @param {string} factoryAddress - The factory address (for logging/tracking purposes)
   * @returns {Promise<FeesManagement | null>} most recent active fee configuration
   */
  async findByFactory(factoryAddress: string): Promise<FeesManagement | null> {
    this.logger.log(`Retrieving fee configuration for factory: ${factoryAddress}`);
    
    // Since factory-level fee updates affect the global configuration,
    // return the most recent active fee configuration
    return this.feesManagementModel
      .findOne({ isActive: true })
      .populate('createdBy', 'username email name')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Get the current active fee configuration
   * @returns {Promise<FeesManagement>} current active fee configuration
   */
  async getCurrentActiveFeeConfig(): Promise<FeesManagement> {
    const activeFee = await this.feesManagementModel
      .findOne({ isActive: true })
      .populate('createdBy', 'username email name')
      .sort({ createdAt: -1 })
      .exec();

    if (!activeFee) {
      throw new NotFoundException('No active fee configuration found');
    }

    return activeFee;
  }

  /**
   * Safely convert BigInt or string to number, handling precision loss
   * @param value - BigInt, string, or number value
   * @returns number - Converted value
   */
  private safeBigIntToNumber(value: any): number {
    if (typeof value === 'bigint') {
      // Check if the BigInt is within safe integer range
      if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
        return Number(value);
      } else {
        this.logger.warn(`BigInt value ${value} exceeds safe integer range, potential precision loss`);
        return Number(value); // Still convert but log warning
      }
    } else if (typeof value === 'string') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        this.logger.warn(`Cannot convert string "${value}" to number, returning 0`);
        return 0;
      }
      return numValue;
    } else if (typeof value === 'number') {
      return value;
    } else {
      this.logger.warn(`Unexpected value type for conversion: ${typeof value}, returning 0`);
      return 0;
    }
  }

  private async validateProfileId(profileId: string): Promise<void> {
    if (!Types.ObjectId.isValid(profileId)) {
      throw new BadRequestException('Invalid profile ID format');
    }

    try {
      await this.profileService.get(profileId);
    } catch (error) {
      throw new BadRequestException('Profile with this ID does not exist');
    }
  }


}
