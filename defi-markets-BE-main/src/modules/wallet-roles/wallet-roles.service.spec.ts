import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletRolesService } from './wallet-roles.service';
import { WalletRole, WalletRoleDocument } from './entities/wallet-role.entity';
import { CreateWalletRoleDto } from './dto/create-wallet-role.dto';
import { UpdateWalletRoleDto } from './dto/update-wallet-role.dto';

describe('WalletRolesService', () => {
  let service: WalletRolesService;
  let mockWalletRoleModel: Model<WalletRoleDocument>;

  const mockWalletRole = {
    _id: new Types.ObjectId(),
    name: 'Test Role',
    description: 'Test Description',
    isActive: true,
    color: '#000000',
    icon: 'test-icon',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCreateDto: CreateWalletRoleDto = {
    name: 'New Role',
    description: 'New Description',
    isActive: true,
    color: '#FFFFFF',
    icon: 'new-icon',
  };

  const mockUpdateDto: UpdateWalletRoleDto = {
    name: 'Updated Role',
    description: 'Updated Description',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletRolesService,
        {
          provide: getModelToken(WalletRole.name),
          useValue: {
            new: jest.fn(),
            constructor: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            findById: jest.fn(),
            findByIdAndUpdate: jest.fn(),
            countDocuments: jest.fn(),
            save: jest.fn(),
            exec: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WalletRolesService>(WalletRolesService);
    mockWalletRoleModel = module.get<Model<WalletRoleDocument>>(getModelToken(WalletRole.name));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new wallet role successfully', async () => {
      jest.spyOn(mockWalletRoleModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      // Mock the model constructor and save method
      const mockRoleInstance = {
        save: jest.fn().mockResolvedValue(mockWalletRole),
      };
      
      // Mock the model as a constructor function
      const mockModelConstructor = jest.fn().mockReturnValue(mockRoleInstance);
      Object.setPrototypeOf(mockWalletRoleModel, mockModelConstructor);

      const result = await service.create(mockCreateDto);

      expect(mockWalletRoleModel.findOne).toHaveBeenCalledWith({ name: mockCreateDto.name });
      expect(mockModelConstructor).toHaveBeenCalledWith(mockCreateDto);
      expect(mockRoleInstance.save).toHaveBeenCalled();
      expect(result).toEqual(mockWalletRole);
    });

    it('should throw BadRequestException if role name already exists', async () => {
      jest.spyOn(mockWalletRoleModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockWalletRole),
      } as any);

      await expect(service.create(mockCreateDto)).rejects.toThrow(BadRequestException);
      expect(mockWalletRoleModel.findOne).toHaveBeenCalledWith({ name: mockCreateDto.name });
    });
  });

  describe('findAll', () => {
    it('should return all wallet roles sorted by name', async () => {
      const mockFindQuery = {
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockWalletRole]),
        }),
      };

      jest.spyOn(mockWalletRoleModel, 'find').mockReturnValue(mockFindQuery as any);

      const result = await service.findAll();

      expect(mockWalletRoleModel.find).toHaveBeenCalled();
      expect(mockFindQuery.sort).toHaveBeenCalledWith({ name: 1 });
      expect(result).toEqual([mockWalletRole]);
    });
  });

  describe('findActive', () => {
    it('should return only active wallet roles sorted by name', async () => {
      const mockFindQuery = {
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockWalletRole]),
        }),
      };

      jest.spyOn(mockWalletRoleModel, 'find').mockReturnValue(mockFindQuery as any);

      const result = await service.findActive();

      expect(mockWalletRoleModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(mockFindQuery.sort).toHaveBeenCalledWith({ name: 1 });
      expect(result).toEqual([mockWalletRole]);
    });
  });

  describe('findOne', () => {
    it('should return a wallet role by ID', async () => {
      const mockFindByIdQuery = {
        exec: jest.fn().mockResolvedValue(mockWalletRole),
      };

      jest.spyOn(mockWalletRoleModel, 'findById').mockReturnValue(mockFindByIdQuery as any);

      const result = await service.findOne(mockWalletRole._id.toString());

      expect(mockWalletRoleModel.findById).toHaveBeenCalledWith(mockWalletRole._id.toString());
      expect(result).toEqual(mockWalletRole);
    });

    it('should throw BadRequestException for invalid ObjectId', async () => {
      await expect(service.findOne('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if role not found', async () => {
      const mockFindByIdQuery = {
        exec: jest.fn().mockResolvedValue(null),
      };

      jest.spyOn(mockWalletRoleModel, 'findById').mockReturnValue(mockFindByIdQuery as any);

      await expect(service.findOne(mockWalletRole._id.toString())).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByName', () => {
    it('should return a wallet role by name', async () => {
      const mockFindOneQuery = {
        exec: jest.fn().mockResolvedValue(mockWalletRole),
      };

      jest.spyOn(mockWalletRoleModel, 'findOne').mockReturnValue(mockFindOneQuery as any);

      const result = await service.findByName('Test Role');

      expect(mockWalletRoleModel.findOne).toHaveBeenCalledWith({ name: 'Test Role' });
      expect(result).toEqual(mockWalletRole);
    });

    it('should throw NotFoundException if role not found by name', async () => {
      const mockFindOneQuery = {
        exec: jest.fn().mockResolvedValue(null),
      };

      jest.spyOn(mockWalletRoleModel, 'findOne').mockReturnValue(mockFindOneQuery as any);

      await expect(service.findByName('Non-existent Role')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a wallet role successfully', async () => {
      const mockFindByIdAndUpdateQuery = {
        exec: jest.fn().mockResolvedValue(mockWalletRole),
      };

      jest.spyOn(mockWalletRoleModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      jest.spyOn(mockWalletRoleModel, 'findByIdAndUpdate').mockReturnValue(mockFindByIdAndUpdateQuery as any);

      const result = await service.update(mockWalletRole._id.toString(), mockUpdateDto);

      expect(mockWalletRoleModel.findOne).toHaveBeenCalledWith({ 
        name: mockUpdateDto.name, 
        _id: { $ne: mockWalletRole._id.toString() } 
      });
      expect(mockWalletRoleModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockWalletRole._id.toString(), 
        mockUpdateDto, 
        { new: true }
      );
      expect(result).toEqual(mockWalletRole);
    });

    it('should throw BadRequestException for invalid ObjectId', async () => {
      await expect(service.update('invalid-id', mockUpdateDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if updated name conflicts with existing role', async () => {
      jest.spyOn(mockWalletRoleModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockWalletRole),
      } as any);

      await expect(service.update(mockWalletRole._id.toString(), mockUpdateDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if role not found for update', async () => {
      const mockFindByIdAndUpdateQuery = {
        exec: jest.fn().mockResolvedValue(null),
      };

      jest.spyOn(mockWalletRoleModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      jest.spyOn(mockWalletRoleModel, 'findByIdAndUpdate').mockReturnValue(mockFindByIdAndUpdateQuery as any);

      await expect(service.update(mockWalletRole._id.toString(), mockUpdateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete a wallet role by setting isActive to false', async () => {
      const mockFindByIdQuery = {
        exec: jest.fn().mockResolvedValue(mockWalletRole),
      };

      const mockFindByIdAndUpdateQuery = {
        exec: jest.fn().mockResolvedValue(mockWalletRole),
      };

      jest.spyOn(mockWalletRoleModel, 'findById').mockReturnValue(mockFindByIdQuery as any);
      jest.spyOn(mockWalletRoleModel, 'findByIdAndUpdate').mockReturnValue(mockFindByIdAndUpdateQuery as any);

      await service.remove(mockWalletRole._id.toString());

      expect(mockWalletRoleModel.findById).toHaveBeenCalledWith(mockWalletRole._id.toString());
      expect(mockWalletRoleModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockWalletRole._id.toString(), 
        { isActive: false }
      );
    });

    it('should throw BadRequestException for invalid ObjectId', async () => {
      await expect(service.remove('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if role not found for removal', async () => {
      const mockFindByIdQuery = {
        exec: jest.fn().mockResolvedValue(null),
      };

      jest.spyOn(mockWalletRoleModel, 'findById').mockReturnValue(mockFindByIdQuery as any);

      await expect(service.remove(mockWalletRole._id.toString())).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleActive', () => {
    it('should toggle active status from true to false', async () => {
      const activeRole = { ...mockWalletRole, isActive: true };
      const inactiveRole = { ...mockWalletRole, isActive: false };

      const mockFindByIdQuery = {
        exec: jest.fn().mockResolvedValue(activeRole),
      };

      const mockFindByIdAndUpdateQuery = {
        exec: jest.fn().mockResolvedValue(inactiveRole),
      };

      jest.spyOn(mockWalletRoleModel, 'findById').mockReturnValue(mockFindByIdQuery as any);
      jest.spyOn(mockWalletRoleModel, 'findByIdAndUpdate').mockReturnValue(mockFindByIdAndUpdateQuery as any);

      const result = await service.toggleActive(mockWalletRole._id.toString());

      expect(mockWalletRoleModel.findById).toHaveBeenCalledWith(mockWalletRole._id.toString());
      expect(mockWalletRoleModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockWalletRole._id.toString(), 
        { isActive: false }, 
        { new: true }
      );
      expect(result).toEqual(inactiveRole);
    });

    it('should toggle active status from false to true', async () => {
      const inactiveRole = { ...mockWalletRole, isActive: false };
      const activeRole = { ...mockWalletRole, isActive: true };

      const mockFindByIdQuery = {
        exec: jest.fn().mockResolvedValue(inactiveRole),
      };

      const mockFindByIdAndUpdateQuery = {
        exec: jest.fn().mockResolvedValue(activeRole),
      };

      jest.spyOn(mockWalletRoleModel, 'findById').mockReturnValue(mockFindByIdQuery as any);
      jest.spyOn(mockWalletRoleModel, 'findByIdAndUpdate').mockReturnValue(mockFindByIdAndUpdateQuery as any);

      const result = await service.toggleActive(mockWalletRole._id.toString());

      expect(mockWalletRoleModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockWalletRole._id.toString(), 
        { isActive: true }, 
        { new: true }
      );
      expect(result).toEqual(activeRole);
    });

    it('should throw BadRequestException for invalid ObjectId', async () => {
      await expect(service.toggleActive('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if role not found for toggle', async () => {
      const mockFindByIdQuery = {
        exec: jest.fn().mockResolvedValue(null),
      };

      jest.spyOn(mockWalletRoleModel, 'findById').mockReturnValue(mockFindByIdQuery as any);

      await expect(service.toggleActive(mockWalletRole._id.toString())).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRoleStats', () => {
    it('should return correct role statistics', async () => {
      jest.spyOn(mockWalletRoleModel, 'countDocuments').mockResolvedValueOnce(10).mockResolvedValueOnce(7);

      const result = await service.getRoleStats();

      expect(mockWalletRoleModel.countDocuments).toHaveBeenCalledTimes(2);
      expect(mockWalletRoleModel.countDocuments).toHaveBeenNthCalledWith(1);
      expect(mockWalletRoleModel.countDocuments).toHaveBeenNthCalledWith(2, { isActive: true });
      expect(result).toEqual({
        totalRoles: 10,
        activeRoles: 7,
        inactiveRoles: 3,
      });
    });
  });

  describe('seedDefaultRoles', () => {
    it('should create default roles that do not already exist', async () => {
      const defaultRoles = [
        { name: 'Treasury', description: 'Primary treasury wallet for holding main funds', isActive: true, color: '#10B981', icon: 'treasury' },
        { name: 'Admin', description: 'Administrative wallet with full system access', isActive: true, color: '#3B82F6', icon: 'admin' },
      ];

      const mockRoleInstance = {
        save: jest.fn().mockResolvedValue(mockWalletRole),
      };

      // Mock findOne to return null for first role (doesn't exist) and existing role for second
      jest.spyOn(mockWalletRoleModel, 'findOne')
        .mockResolvedValueOnce(null) // Treasury doesn't exist
        .mockResolvedValueOnce(mockWalletRole); // Admin already exists

      // Mock the model constructor and save method for the new role
      const mockNewModelConstructor = jest.fn().mockReturnValue(mockRoleInstance);
      Object.setPrototypeOf(mockWalletRoleModel, mockNewModelConstructor);

      const result = await service.seedDefaultRoles();

      expect(mockWalletRoleModel.findOne).toHaveBeenCalledTimes(2);
      expect(mockNewModelConstructor).toHaveBeenCalledWith(defaultRoles[0]);
      expect(mockRoleInstance.save).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockWalletRole);
    });

    it('should handle errors gracefully when creating default roles', async () => {
      const mockRoleInstance = {
        save: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      jest.spyOn(mockWalletRoleModel, 'findOne').mockResolvedValue(null);
      // Mock the model constructor and save method for the new role
      const mockNewModelConstructor = jest.fn().mockReturnValue(mockRoleInstance);
      Object.setPrototypeOf(mockWalletRoleModel, mockNewModelConstructor);

      const result = await service.seedDefaultRoles();

      expect(result).toHaveLength(0);
    });

    it('should return empty array if all default roles already exist', async () => {
      jest.spyOn(mockWalletRoleModel, 'findOne').mockResolvedValue(mockWalletRole);

      const result = await service.seedDefaultRoles();

      expect(mockWalletRoleModel.findOne).toHaveBeenCalledTimes(4); // 4 default roles
      expect(result).toHaveLength(0);
    });
  });
});
