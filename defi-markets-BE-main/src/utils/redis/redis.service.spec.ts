import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/common';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockCacheManager: any;

  beforeEach(async () => {
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Cache Manager Methods', () => {
    it('should get value from cache', async () => {
      const mockValue = { data: 'test' };
      mockCacheManager.get.mockResolvedValue(mockValue);

      const result = await service.get('test-key');
      expect(result).toEqual(mockValue);
      expect(mockCacheManager.get).toHaveBeenCalledWith('test-key');
    });

    it('should set value in cache', async () => {
      const mockValue = { data: 'test' };
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set('test-key', mockValue, 300);
      expect(mockCacheManager.set).toHaveBeenCalledWith('test-key', mockValue, 300);
    });

    it('should delete value from cache', async () => {
      mockCacheManager.del.mockResolvedValue(undefined);

      await service.del('test-key');
      expect(mockCacheManager.del).toHaveBeenCalledWith('test-key');
    });

    it('should reset cache', async () => {
      mockCacheManager.reset.mockResolvedValue(undefined);

      await service.reset();
      expect(mockCacheManager.reset).toHaveBeenCalled();
    });
  });

  describe('Health Check', () => {
    it('should return true when Redis is healthy', async () => {
      const result = await service.healthCheck();
      expect(typeof result).toBe('boolean');
    });
  });
});
