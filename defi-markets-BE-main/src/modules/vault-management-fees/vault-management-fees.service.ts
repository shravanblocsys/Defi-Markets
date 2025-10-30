import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateVaultManagementFeeDto } from './dto/create-vault-management-fee.dto';
import { UpdateVaultManagementFeeDto } from './dto/update-vault-management-fee.dto';
import { VaultManagementFee, VaultManagementFeeDocument, FeeStatus } from './entities/vault-management-fee.entity';
import { PaginationHelper, PaginatedResponse } from '../../middlewares/pagination/paginationHelper';

@Injectable()
export class VaultManagementFeesService {
  constructor(
    @InjectModel(VaultManagementFee.name)
    private vaultManagementFeeModel: Model<VaultManagementFeeDocument>,
    private paginationHelper: PaginationHelper,
  ) {}

  async create(createVaultManagementFeeDto: CreateVaultManagementFeeDto): Promise<VaultManagementFee> {
    try {
      const feeData = {
        ...createVaultManagementFeeDto,
        status: createVaultManagementFeeDto.status || FeeStatus.PENDING,
      };

      const createdFee = new this.vaultManagementFeeModel(feeData);
      return await createdFee.save();
    } catch (error) {
      throw new BadRequestException(`Failed to create vault management fee: ${error.message}`);
    }
  }

  async findAll(
    req: any,
    vaultName?: string,
    status?: FeeStatus,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<PaginatedResponse<{
    date: string;
    etf: string;
    nav: number;
    etfCreatorFee: number;
    platformOwnerFee: number;
    todaysAum: number | null;
    status: FeeStatus;
    previouslyAccruedFees: number;
    newlyAccruedFees: number;
    vaultIndex: number;
  }>> {
    try {
      const query: any = {};

      // Apply filters
      if (vaultName) {
        query.vaultName = { $regex: vaultName, $options: 'i' };
      }

      if (status) {
        query.status = status;
      }

      if (dateFrom || dateTo) {
        query.date = {};
        if (dateFrom) {
          query.date.$gte = dateFrom;
        }
        if (dateTo) {
          query.date.$lte = dateTo;
        }
      }

      // Use pagination helper with sort order (latest first)
      const paginationQuery = this.paginationHelper.createPaginationQuery(req);
      // Override sort to use date descending (latest first)
      paginationQuery.sort = { date: -1 };
      
      const result = await this.paginationHelper.paginate(
        this.vaultManagementFeeModel,
        query,
        paginationQuery
      );

      // Transform data to match table structure
      const transformedData = result.data.map(fee => ({
        date: fee.date,
        etf: fee.vaultName,
        nav: fee.nav, // NAV retrieved directly from the entity
        etfCreatorFee: fee.etfCreatorFee,
        platformOwnerFee: fee.platformOwnerFee,
        todaysAum: fee.todaysAum || null,
        status: fee.status,
        previouslyAccruedFees: fee.metadata?.previouslyAccruedFees || 0,
        newlyAccruedFees: fee.metadata?.newlyAccruedFees || 0,
        vaultIndex: fee.vaultIndex,
      }));

      return {
        data: transformedData,
        pagination: result.pagination,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to fetch vault management fees: ${error.message}`);
    }
  }

  async findOne(id: string): Promise<VaultManagementFee> {
    try {
      const fee = await this.vaultManagementFeeModel.findById(id).exec();
      if (!fee) {
        throw new NotFoundException(`Vault management fee with ID ${id} not found`);
      }
      return fee;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to fetch vault management fee: ${error.message}`);
    }
  }

  async findByVaultIndex(vaultIndex: number): Promise<VaultManagementFee[]> {
    try {
      return await this.vaultManagementFeeModel
        .find({ vaultIndex })
        .sort({ date: -1 })
        .exec();
    } catch (error) {
      throw new BadRequestException(`Failed to fetch fees for vault index ${vaultIndex}: ${error.message}`);
    }
  }

  async findByVaultName(vaultName: string): Promise<VaultManagementFee[]> {
    try {
      return await this.vaultManagementFeeModel
        .find({ vaultName: { $regex: vaultName, $options: 'i' } })
        .sort({ date: -1 })
        .exec();
    } catch (error) {
      throw new BadRequestException(`Failed to fetch fees for vault ${vaultName}: ${error.message}`);
    }
  }

  async update(id: string, updateVaultManagementFeeDto: UpdateVaultManagementFeeDto): Promise<VaultManagementFee> {
    try {
      const updateData = { ...updateVaultManagementFeeDto };
      
      // No date conversion needed since entity expects string

      const updatedFee = await this.vaultManagementFeeModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .exec();

      if (!updatedFee) {
        throw new NotFoundException(`Vault management fee with ID ${id} not found`);
      }

      return updatedFee;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update vault management fee: ${error.message}`);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const result = await this.vaultManagementFeeModel.findByIdAndDelete(id).exec();
      if (!result) {
        throw new NotFoundException(`Vault management fee with ID ${id} not found`);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete vault management fee: ${error.message}`);
    }
  }

  async getFeeStatistics(): Promise<{
    totalFees: number;
    totalEtfCreatorFees: number;
    totalPlatformOwnerFees: number;
    feesByStatus: Record<FeeStatus, number>;
    feesByVault: Array<{ vaultName: string; totalFees: number; count: number }>;
  }> {
    try {
      const [
        totalFees,
        totalEtfCreatorFees,
        totalPlatformOwnerFees,
        feesByStatus,
        feesByVault,
      ] = await Promise.all([
        this.vaultManagementFeeModel.countDocuments().exec(),
        this.vaultManagementFeeModel.aggregate([
          { $group: { _id: null, total: { $sum: '$etfCreatorFee' } } }
        ]).exec(),
        this.vaultManagementFeeModel.aggregate([
          { $group: { _id: null, total: { $sum: '$platformOwnerFee' } } }
        ]).exec(),
        this.vaultManagementFeeModel.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]).exec(),
        this.vaultManagementFeeModel.aggregate([
          {
            $group: {
              _id: '$vaultName',
              totalFees: { $sum: { $add: ['$etfCreatorFee', '$platformOwnerFee'] } },
              count: { $sum: 1 }
            }
          },
          { $sort: { totalFees: -1 } }
        ]).exec(),
      ]);

      const statusMap = feesByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<FeeStatus, number>);

      return {
        totalFees,
        totalEtfCreatorFees: totalEtfCreatorFees[0]?.total || 0,
        totalPlatformOwnerFees: totalPlatformOwnerFees[0]?.total || 0,
        feesByStatus: statusMap,
        feesByVault: feesByVault.map(item => ({
          vaultName: item._id,
          totalFees: item.totalFees,
          count: item.count,
        })),
      };
    } catch (error) {
      throw new BadRequestException(`Failed to fetch fee statistics: ${error.message}`);
    }
  }

  async getVaultSummary(): Promise<{
    date: string;
    vaults: {
      vaultName: string;
      vaultSymbol: string;
      gav: number;
      nav: number;
    }[];
  }[]> {
    try {
      // Get all fee records grouped by date
      const dateWiseData = await this.vaultManagementFeeModel.aggregate([
        {
          $match: {
            gav: { $exists: true, $ne: null },
            nav: { $exists: true, $ne: null }
          }
        },
        {
          $sort: { date: -1, vaultName: 1 }
        },
        {
          $group: {
            _id: '$date',
            vaults: {
              $push: {
                vaultName: '$vaultName',
                vaultSymbol: '$vaultSymbol',
                gav: { $ifNull: ['$gav', 0] },
                nav: { $ifNull: ['$nav', 0] }
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            date: '$_id',
            vaults: 1
          }
        },
        {
          $sort: { date: -1 }
        }
      ]);

      return dateWiseData;
    } catch (error) {
      throw new BadRequestException(`Failed to fetch vault summary: ${error.message}`);
    }
  }
}
