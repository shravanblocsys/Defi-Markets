import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { Wallet, WalletDocument } from './entities/wallet.entity';
import { WalletRole, WalletRoleDocument } from '../wallet-roles/entities/wallet-role.entity';
import { HistoryService } from '../history/history.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(WalletRole.name) private walletRoleModel: Model<WalletRoleDocument>,
    private readonly historyService: HistoryService,
  ) {}

  async create(createWalletDto: CreateWalletDto, performedBy: string): Promise<Wallet> {
    this.logger.log('Creating new wallet');
    
    // Validate that all role IDs exist
    await this.validateRoleIds(createWalletDto.roles);
    
    // Check if wallet address already exists
    const existingWallet = await this.walletModel.findOne({ address: createWalletDto.address });
    if (existingWallet) {
      throw new BadRequestException('Wallet with this address already exists');
    }

    const createdWallet = new this.walletModel(createWalletDto);
    const savedWallet = await createdWallet.save();
    
    this.logger.log("performed by", performedBy)
    // Create history entry for wallet creation if performedBy is provided
    if (performedBy) {
      await this.historyService.create({
        action: 'wallet_created',
        description: `Wallet ${savedWallet.label} (${savedWallet.address}) created`,
        performedBy: performedBy,
        walletId: savedWallet._id.toString(),
        relatedEntity: 'wallet',
        metadata: {
          address: savedWallet.address,
          label: savedWallet.label,
          roles: savedWallet.roles,
          currency: savedWallet.currency,
          tags: savedWallet.tags,
          description: savedWallet.description
        }
      });
    }
    
    this.logger.log(`Wallet created with ID: ${savedWallet._id}`);
    return this.findOne(savedWallet._id.toString());
  }

  async findAll(): Promise<Wallet[]> {
    this.logger.log('Fetching all wallets from database');
    return this.walletModel
      .find({ isActive: true })
      .populate('roles', 'name description color icon')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Wallet> {
    this.logger.log(`Fetching wallet with ID: ${id} from database`);
    
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid wallet ID format');
    }

    const wallet = await this.walletModel
      .findById(id)
      .populate('roles', 'name description color icon')
      .exec();

    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }

    return wallet;
  }

  async findByAddress(address: string): Promise<Wallet> {
    this.logger.log(`Fetching wallet with address: ${address} from database`);
    
    const wallet = await this.walletModel
      .findOne({ address })
      .populate('roles', 'name description color icon')
      .exec();

    if (!wallet) {
      throw new NotFoundException(`Wallet with address ${address} not found`);
    }

    return wallet;
  }

  async findByRole(roleId: string): Promise<Wallet[]> {
    this.logger.log(`Fetching wallets with role ID: ${roleId} from database`);
    
    if (!Types.ObjectId.isValid(roleId)) {
      throw new BadRequestException('Invalid role ID format');
    }

    return this.walletModel
      .find({ roles: roleId, isActive: true })
      .populate('roles', 'name description color icon')
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(id: string, updateWalletDto: UpdateWalletDto, performedBy: string): Promise<Wallet> {  
    this.logger.log(`Updating wallet with ID: ${id}`);
    
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid wallet ID format');
    }

    // Check if any fields are being updated
    const updateFields = Object.keys(updateWalletDto).filter(key => updateWalletDto[key] !== undefined);
    if (updateFields.length === 0) {
      throw new BadRequestException('No fields provided for update');
    }

    this.logger.log(`Updating fields: ${updateFields.join(', ')} for wallet ID: ${id}`);

    // Get the original wallet for history tracking
    const originalWallet = await this.findOne(id);
    if (!originalWallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }

    // If roles are being updated, validate them
    if (updateWalletDto.roles !== undefined) {
      if (!Array.isArray(updateWalletDto.roles) || updateWalletDto.roles.length === 0) {
        throw new BadRequestException('Roles must be a non-empty array');
      }
      await this.validateRoleIds(updateWalletDto.roles);
      this.logger.log(`Validated ${updateWalletDto.roles.length} roles for wallet ID: ${id}`);
    }

    // If address is being updated, check for duplicates
    if (updateWalletDto.address !== undefined) {
      const existingWallet = await this.walletModel.findOne({ 
        address: updateWalletDto.address, 
        _id: { $ne: id } 
      });
      if (existingWallet) {
        throw new BadRequestException('Wallet with this address already exists');
      }
      this.logger.log(`Address validation passed for wallet ID: ${id}`);
    }

    // If tags are being updated, validate them
    if (updateWalletDto.tags !== undefined) {
      if (!Array.isArray(updateWalletDto.tags)) {
        throw new BadRequestException('Tags must be an array');
      }
      this.logger.log(`Validated ${updateWalletDto.tags.length} tags for wallet ID: ${id}`);
    }

    const updatedWallet = await this.walletModel
      .findByIdAndUpdate(id, updateWalletDto, { new: true })
      .populate('roles', 'name description color icon')
      .exec();

    if (!updatedWallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }

    // Create history entry for wallet update if performedBy is provided
    if (performedBy) {
      await this.historyService.create({
        action: 'wallet_updated',
        description: `Wallet ${updatedWallet.label} (${updatedWallet.address}) updated`,
        performedBy: performedBy,
        walletId: updatedWallet._id.toString(),
        relatedEntity: 'wallet',
        metadata: {
          previousValues: {
            address: originalWallet.address,
            label: originalWallet.label,
            roles: originalWallet.roles,
            currency: originalWallet.currency,
            isActive: originalWallet.isActive,
            tags: originalWallet.tags,
            description: originalWallet.description
          },
          newValues: {
            address: updatedWallet.address,
            label: updatedWallet.label,
            roles: updatedWallet.roles,
            currency: updatedWallet.currency,
            isActive: updatedWallet.isActive,
            tags: updatedWallet.tags,
            description: updatedWallet.description
          },
          updatedFields: updateFields
        }
      });
    }

    this.logger.log(`Wallet updated successfully with ID: ${id}. Updated fields: ${updateFields.join(', ')}`);
    return updatedWallet;
  }

  async remove(id: string, performedBy?: string): Promise<{ walletId: string }> {
    this.logger.log(`Removing wallet with ID: ${id}`);
    
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid wallet ID format');
    }

    const wallet = await this.walletModel.findById(id);
    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }

    // Soft delete by setting isActive to false
    await this.walletModel.findByIdAndUpdate(id, { isActive: false });
    
    // Create history entry for wallet deletion if performedBy is provided
    if (performedBy) {
      await this.historyService.create({
        action: 'wallet_deleted',
        description: `Wallet ${wallet.label} (${wallet.address}) deleted`,
        performedBy: performedBy,
        walletId: wallet._id.toString(),
        relatedEntity: 'wallet',
        metadata: {
          address: wallet.address,
          label: wallet.label,
          roles: wallet.roles,
          currency: wallet.currency,
          tags: wallet.tags,
          description: wallet.description
        }
      });
    }
    
    this.logger.log(`Wallet soft deleted with ID: ${id}`);
    
    return { walletId: id };
  }

  async addRole(id: string, roleId: string): Promise<Wallet> {
    this.logger.log(`Adding role ${roleId} to wallet ${id}`);
    
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(roleId)) {
      throw new BadRequestException('Invalid ID format');
    }

    // Validate that the role exists
    await this.validateRoleIds([roleId]);

    const updatedWallet = await this.walletModel
      .findByIdAndUpdate(
        id,
        { $addToSet: { roles: roleId } },
        { new: true }
      )
      .populate('roles', 'name description color icon')
      .exec();

    if (!updatedWallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }

    this.logger.log(`Role added to wallet ID: ${id}`);
    return updatedWallet;
  }

  async removeRole(id: string, roleId: string): Promise<Wallet> {
    this.logger.log(`Removing role ${roleId} from wallet ${id}`);
    
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(roleId)) {
      throw new BadRequestException('Invalid ID format');
    }

    // Use atomic update with validation to prevent race conditions
    // The $pull operation will only succeed if the role exists and removal won't result in empty array
    const updatedWallet = await this.walletModel
      .findOneAndUpdate(
        {
          _id: id,
          roles: { 
            $in: [roleId], // Ensure the role exists
            $size: { $gt: 1 } // Ensure there's more than one role (prevents removing last role)
          }
        },
        { $pull: { roles: roleId } },
        { 
          new: true,
          runValidators: true
        }
      )
      .populate('roles', 'name description color icon')
      .exec();

    if (!updatedWallet) {
      // Check if wallet exists but validation failed
      const wallet = await this.walletModel.findById(id);
      if (!wallet) {
        throw new NotFoundException(`Wallet with ID ${id} not found`);
      }
      
      // Check if the role exists
      if (!wallet.roles.includes(new Types.ObjectId(roleId))) {
        throw new BadRequestException(`Role ${roleId} is not assigned to wallet ${id}`);
      }
      
      // Check if this would be the last role
      if (wallet.roles.length === 1) {
        throw new BadRequestException('Cannot remove the last role from a wallet. Wallet must have at least one role.');
      }
      
      // If we get here, something unexpected happened
      throw new BadRequestException('Unable to remove role. Please try again.');
    }

    this.logger.log(`Role removed from wallet ID: ${id}`);
    return updatedWallet;
  }

  async getWalletStats(): Promise<{
    totalWallets: number;
    activeWallets: number;
    walletsByCurrency: Record<string, number>;
  }> {
    this.logger.log('Fetching wallet statistics from database');
    
    const [totalWallets, activeWallets, walletsByCurrency] = await Promise.all([
      this.walletModel.countDocuments(),
      this.walletModel.countDocuments({ isActive: true }),
      this.walletModel.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$currency', count: { $sum: 1 } } }
      ])
    ]);

    const currencyMap = walletsByCurrency.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    return {
      totalWallets,
      activeWallets,
      walletsByCurrency: currencyMap,
    };
  }

  private async validateRoleIds(roleIds: string[]): Promise<void> {
    const validRoleIds = roleIds.filter(id => Types.ObjectId.isValid(id));
    if (validRoleIds.length !== roleIds.length) {
      throw new BadRequestException('Invalid role ID format');
    }

    const existingRoles = await this.walletRoleModel.countDocuments({
      _id: { $in: validRoleIds },
      isActive: true
    });

    if (existingRoles !== validRoleIds.length) {
      throw new BadRequestException('One or more role IDs do not exist or are inactive');
    }
  }
}
