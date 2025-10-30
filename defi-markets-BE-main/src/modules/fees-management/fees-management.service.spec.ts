import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { FeesManagementService } from './fees-management.service';
import { CreateFeesManagementDto } from './dto/create-fees-management.dto';
import { UpdateFeesManagementDto } from './dto/update-fees-management.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('FeesManagementService', () => {
  let service: FeesManagementService;
  let feesManagementModel: any;
  let profileModel: any;

  const mockFee = {
    _id: '507f1f77bcf86cd799439011',
    feeRate: 2.0,
    effectiveDate: new Date('2024-01-01'),
    createdBy: '507f1f77bcf86cd799439012',
    createdAt: new Date('2023-12-28T21:00:00Z'),
    isActive: true,
    description: 'Updated management fee rate',
    notes: 'Increased from 1.5% to 2.0%'
  };

  const mockCreateFeeDto: CreateFeesManagementDto = {
    feeRate: 2.0,
    effectiveDate: '2024-01-01',
    createdBy: '507f1f77bcf86cd799439012',
    description: 'Updated management fee rate',
    notes: 'Increased from 1.5% to 2.0%'
  };

  const mockUpdateFeeDto: UpdateFeesManagementDto = {
    feeRate: 2.5,
    description: 'Further increased management fee rate'
  };

  beforeEach(async () => {
    const mockFeesManagementModel = {
      new: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOne: jest.fn(),
      exec: jest.fn()
    };

    const mockProfileModel = {
      findById: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeesManagementService,
        {
          provide: getModelToken('FeesManagement'),
          useValue: mockFeesManagementModel,
        },
        {
          provide: getModelToken('Profile'),
          useValue: mockProfileModel,
        },
      ],
    }).compile();

    service = module.get<FeesManagementService>(FeesManagementService);
    feesManagementModel = module.get(getModelToken('FeesManagement'));
    profileModel = module.get(getModelToken('Profile'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new fee management entry', async () => {
      const mockProfile = { _id: '507f1f77bcf86cd799439012', username: 'admin' };
      const mockNewFee = { ...mockCreateFeeDto, save: jest.fn() };
      
      profileModel.findById.mockResolvedValue(mockProfile);
      feesManagementModel.findOne.mockResolvedValue(null);
      feesManagementModel.new.mockReturnValue(mockNewFee);
      mockNewFee.save.mockResolvedValue(mockFee);
      feesManagementModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockFee)
        })
      });

      const result = await service.create(mockCreateFeeDto);

      expect(result).toEqual(mockFee);
      expect(profileModel.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439012');
      expect(feesManagementModel.findOne).toHaveBeenCalled();
    });

    it('should throw error if profile does not exist', async () => {
      profileModel.findById.mockResolvedValue(null);

      await expect(service.create(mockCreateFeeDto)).rejects.toThrow(
        new BadRequestException('Profile with this ID does not exist')
      );
    });

    it('should throw error if active fee rate exists for effective date', async () => {
      const mockProfile = { _id: '507f1f77bcf86cd799439012', username: 'admin' };
      profileModel.findById.mockResolvedValue(mockProfile);
      feesManagementModel.findOne.mockResolvedValue(mockFee);

      await expect(service.create(mockCreateFeeDto)).rejects.toThrow(
        new BadRequestException('An active fee rate already exists for this effective date')
      );
    });
  });

  describe('findAll', () => {
    it('should return all active fee management entries', async () => {
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([mockFee])
          })
        })
      };

      feesManagementModel.find.mockReturnValue(mockQuery);

      const result = await service.findAll();

      expect(result).toEqual([mockFee]);
      expect(feesManagementModel.find).toHaveBeenCalledWith({ isActive: true });
    });
  });

  describe('findOne', () => {
    it('should return a fee management entry by ID', async () => {
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockFee)
        })
      };

      feesManagementModel.findById.mockReturnValue(mockQuery);

      const result = await service.findOne('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockFee);
      expect(feesManagementModel.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should throw error for invalid ID format', async () => {
      await expect(service.findOne('invalid-id')).rejects.toThrow(
        new BadRequestException('Invalid fee management ID format')
      );
    });

    it('should throw error if fee management entry not found', async () => {
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null)
        })
      };

      feesManagementModel.findById.mockReturnValue(mockQuery);

      await expect(service.findOne('507f1f77bcf86cd799439011')).rejects.toThrow(
        new NotFoundException('Fee management entry with ID 507f1f77bcf86cd799439011 not found')
      );
    });
  });

  describe('update', () => {
    it('should update a fee management entry', async () => {
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ ...mockFee, feeRate: 2.5 })
        })
      };

      feesManagementModel.findByIdAndUpdate.mockReturnValue(mockQuery);

      const result = await service.update('507f1f77bcf86cd799439011', mockUpdateFeeDto);

      expect(result.feeRate).toBe(2.5);
      expect(feesManagementModel.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should throw error if no fields provided for update', async () => {
      await expect(service.update('507f1f77bcf86cd799439011', {})).rejects.toThrow(
        new BadRequestException('No fields provided for update')
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a fee management entry', async () => {
      feesManagementModel.findById.mockResolvedValue(mockFee);
      feesManagementModel.findByIdAndUpdate.mockResolvedValue({ ...mockFee, isActive: false });

      const result = await service.remove('507f1f77bcf86cd799439011');

      expect(result).toEqual({ feeId: '507f1f77bcf86cd799439011' });
      expect(feesManagementModel.findByIdAndUpdate).toHaveBeenCalledWith('507f1f77bcf86cd799439011', { isActive: false });
    });

    it('should throw error if fee management entry not found', async () => {
      feesManagementModel.findById.mockResolvedValue(null);

      await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(
        new NotFoundException('Fee management entry with ID 507f1f77bcf86cd799439011 not found')
      );
    });
  });
});
