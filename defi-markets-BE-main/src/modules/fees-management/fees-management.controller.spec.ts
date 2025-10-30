import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/common';
import { FeesManagementController } from './fees-management.controller';
import { FeesManagementService } from './fees-management.service';
import { RedisService } from '../../utils/redis/redis.service';
import { CreateFeesManagementDto } from './dto/create-fees-management.dto';
import { UpdateFeesManagementDto } from './dto/update-fees-management.dto';

describe('FeesManagementController', () => {
  let controller: FeesManagementController;
  let feesManagementService: jest.Mocked<FeesManagementService>;
  let redisService: jest.Mocked<RedisService>;

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
    const mockFeesManagementService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn()
    };

    const mockRedisService = {
      keys: jest.fn(),
      delDirect: jest.fn(),
      reset: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeesManagementController],
      providers: [
        { provide: FeesManagementService, useValue: mockFeesManagementService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn(), reset: jest.fn() } }
      ],
    }).compile();

    controller = module.get<FeesManagementController>(FeesManagementController);
    feesManagementService = module.get(FeesManagementService);
    redisService = module.get(RedisService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a fee management entry and clear cache', async () => {
      feesManagementService.create.mockResolvedValue(mockFee as any);
      redisService.keys.mockResolvedValue(['fees:all']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      const result = await controller.create(mockCreateFeeDto);

      expect(result).toEqual(mockFee);
      expect(feesManagementService.create).toHaveBeenCalledWith(mockCreateFeeDto);
      expect(redisService.keys).toHaveBeenCalledWith('fees:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(1);
      expect(redisService.reset).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all fee management entries', async () => {
      const fees = [mockFee];
      feesManagementService.findAll.mockResolvedValue(fees as any);

      const result = await controller.findAll();

      expect(result).toEqual(fees);
      expect(feesManagementService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a specific fee management entry', async () => {
      feesManagementService.findOne.mockResolvedValue(mockFee as any);

      const result = await controller.findOne('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockFee);
      expect(feesManagementService.findOne).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });
  });

  describe('update', () => {
    it('should update a fee management entry and clear cache', async () => {
      const updatedFee = { ...mockFee, feeRate: 2.5 };
      feesManagementService.update.mockResolvedValue(updatedFee as any);
      redisService.keys.mockResolvedValue(['fees:all', 'fees:id:507f1f77bcf86cd799439011']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      const result = await controller.update('507f1f77bcf86cd799439011', mockUpdateFeeDto);

      expect(result).toEqual(updatedFee);
      expect(feesManagementService.update).toHaveBeenCalledWith('507f1f77bcf86cd799439011', mockUpdateFeeDto);
      expect(redisService.keys).toHaveBeenCalledWith('fees:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(2);
      expect(redisService.reset).toHaveBeenCalled();
    });

    it('should handle single field updates correctly', async () => {
      const singleFieldUpdate = { description: 'Single Field Update' };
      const updatedFee = { ...mockFee, description: 'Single Field Update' };
      feesManagementService.update.mockResolvedValue(updatedFee as any);
      redisService.keys.mockResolvedValue(['fees:all', 'fees:id:507f1f77bcf86cd799439011']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      const result = await controller.update('507f1f77bcf86cd799439011', singleFieldUpdate);

      expect(result).toEqual(updatedFee);
      expect(feesManagementService.update).toHaveBeenCalledWith('507f1f77bcf86cd799439011', singleFieldUpdate);
    });
  });

  describe('remove', () => {
    it('should remove a fee management entry and clear cache', async () => {
      const deleteResponse = { feeId: '507f1f77bcf86cd799439011' };
      feesManagementService.remove.mockResolvedValue(deleteResponse);
      redisService.keys.mockResolvedValue(['fees:all', 'fees:id:507f1f77bcf86cd799439011']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      const result = await controller.remove('507f1f77bcf86cd799439011');

      expect(result).toEqual(deleteResponse);
      expect(result.feeId).toBe('507f1f77bcf86cd799439011');
      expect(feesManagementService.remove).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(redisService.keys).toHaveBeenCalledWith('fees:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(2);
      expect(redisService.reset).toHaveBeenCalled();
    });
  });

  describe('clearFeesCache', () => {
    it('should clear fees cache successfully', async () => {
      redisService.keys.mockResolvedValue(['fees:all', 'fees:id:507f1f77bcf86cd799439011']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      // Access private method through any type
      await (controller as any).clearFeesCache();

      expect(redisService.keys).toHaveBeenCalledWith('fees:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(2);
      expect(redisService.reset).toHaveBeenCalled();
    });

    it('should handle cache clearing errors gracefully', async () => {
      redisService.keys.mockRejectedValue(new Error('Redis error'));

      // Access private method through any type
      await (controller as any).clearFeesCache();

      expect(redisService.keys).toHaveBeenCalledWith('fees:*');
      // Should not throw error, just log it
    });
  });
});
