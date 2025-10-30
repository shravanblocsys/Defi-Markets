import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateWalletRoleDto } from './dto/create-wallet-role.dto';
import { UpdateWalletRoleDto } from './dto/update-wallet-role.dto';
import { WalletRole, WalletRoleDocument } from './entities/wallet-role.entity';

@Injectable()
export class WalletRolesService {
  private readonly logger = new Logger(WalletRolesService.name);

  constructor(
    @InjectModel(WalletRole.name) private walletRoleModel: Model<WalletRoleDocument>,
  ) {}

  async create(createWalletRoleDto: CreateWalletRoleDto): Promise<WalletRole> {
    this.logger.log('Creating new wallet role');
    
    // Check if role name already exists
    const existingRole = await this.walletRoleModel.findOne({ 
      name: createWalletRoleDto.name 
    });
    if (existingRole) {
      throw new BadRequestException('Role with this name already exists');
    }

    const createdRole = new this.walletRoleModel(createWalletRoleDto);
    const savedRole = await createdRole.save();
    
    this.logger.log(`Wallet role created with ID: ${savedRole._id}`);
    return savedRole;
  }

  async findAll(): Promise<WalletRole[]> {
    this.logger.log('Fetching all wallet roles');
    return this.walletRoleModel
      .find()
      .sort({ name: 1 })
      .exec();
  }

  async findActive(): Promise<WalletRole[]> {
    this.logger.log('Fetching active wallet roles');
    return this.walletRoleModel
      .find({ isActive: true })
      .sort({ name: 1 })
      .exec();
  }

  async findOne(id: string): Promise<WalletRole> {
    this.logger.log(`Fetching wallet role with ID: ${id}`);
    
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid role ID format');
    }

    const role = await this.walletRoleModel.findById(id).exec();

    if (!role) {
      throw new NotFoundException(`Wallet role with ID ${id} not found`);
    }

    return role;
  }

  async findByName(name: string): Promise<WalletRole> {
    this.logger.log(`Fetching wallet role with name: ${name}`);
    
    const role = await this.walletRoleModel.findOne({ name }).exec();

    if (!role) {
      throw new NotFoundException(`Wallet role with name ${name} not found`);
    }

    return role;
  }

  async update(id: string, updateWalletRoleDto: UpdateWalletRoleDto): Promise<WalletRole> {
    this.logger.log(`Updating wallet role with ID: ${id}`);
    
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid role ID format');
    }

    // If name is being updated, check for duplicates
    if (updateWalletRoleDto.name) {
      const existingRole = await this.walletRoleModel.findOne({ 
        name: updateWalletRoleDto.name, 
        _id: { $ne: id } 
      });
      if (existingRole) {
        throw new BadRequestException('Role with this name already exists');
      }
    }

    const updatedRole = await this.walletRoleModel
      .findByIdAndUpdate(id, updateWalletRoleDto, { new: true })
      .exec();

    if (!updatedRole) {
      throw new NotFoundException(`Wallet role with ID ${id} not found`);
    }

    this.logger.log(`Wallet role updated with ID: ${id}`);
    return updatedRole;
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Removing wallet role with ID: ${id}`);
    
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid role ID format');
    }

    const role = await this.walletRoleModel.findById(id);
    if (!role) {
      throw new NotFoundException(`Wallet role with ID ${id} not found`);
    }

    // Check if role is being used by any wallets
    // This would require importing the wallet model, so we'll do a soft delete instead
    await this.walletRoleModel.findByIdAndUpdate(id, { isActive: false });
    this.logger.log(`Wallet role soft deleted with ID: ${id}`);
  }

  async toggleActive(id: string): Promise<WalletRole> {
    this.logger.log(`Toggling active status for wallet role ID: ${id}`);
    
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid role ID format');
    }

    const role = await this.walletRoleModel.findById(id);
    if (!role) {
      throw new NotFoundException(`Wallet role with ID ${id} not found`);
    }

    const updatedRole = await this.walletRoleModel
      .findByIdAndUpdate(
        id, 
        { isActive: !role.isActive }, 
        { new: true }
      )
      .exec();

    this.logger.log(`Wallet role active status toggled for ID: ${id}`);
    return updatedRole;
  }

  async getRoleStats(): Promise<{
    totalRoles: number;
    activeRoles: number;
    inactiveRoles: number;
  }> {
    this.logger.log('Fetching wallet role statistics');
    
    const [totalRoles, activeRoles] = await Promise.all([
      this.walletRoleModel.countDocuments(),
      this.walletRoleModel.countDocuments({ isActive: true }),
    ]);

    return {
      totalRoles,
      activeRoles,
      inactiveRoles: totalRoles - activeRoles,
    };
  }

  async seedDefaultRoles(): Promise<WalletRole[]> {
    this.logger.log('Seeding default wallet roles');
    
    const defaultRoles = [
      {
        name: 'Treasury',
        description: 'Primary treasury wallet for holding main funds',
        isActive: true,
        color: '#10B981', // Green
        icon: 'treasury',
      },
      {
        name: 'Admin',
        description: 'Administrative wallet with full system access',
        isActive: true,
        color: '#3B82F6', // Blue
        icon: 'admin',
      },
      {
        name: 'Operator',
        description: 'Operational wallet for daily transactions',
        isActive: true,
        color: '#F59E0B', // Amber
        icon: 'operator',
      },
      {
        name: 'Auditor',
        description: 'Audit wallet for monitoring and verification',
        isActive: true,
        color: '#8B5CF6', // Purple
        icon: 'auditor',
      },
    ];

    const createdRoles: WalletRole[] = [];
    
    for (const roleData of defaultRoles) {
      try {
        const existingRole = await this.walletRoleModel.findOne({ name: roleData.name });
        if (!existingRole) {
          const role = new this.walletRoleModel(roleData);
          const savedRole = await role.save();
          createdRoles.push(savedRole);
          this.logger.log(`Default role created: ${savedRole.name}`);
        }
      } catch (error) {
        this.logger.error(`Error creating default role ${roleData.name}:`, error);
      }
    }

    this.logger.log(`Seeded ${createdRoles.length} default wallet roles`);
    return createdRoles;
  }
}
