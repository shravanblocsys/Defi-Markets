import { Test, TestingModule } from '@nestjs/testing';
import { VaultFactoryController } from './vault-factory.controller';
import { VaultFactoryService } from './vault-factory.service';
import { RedisService } from '../../utils/redis/redis.service';
import { CACHE_MANAGER } from '@nestjs/common';
import { CacheInterceptor } from '../../utils/redis/cache.interceptor';

describe('VaultFactoryController', () => {
  let controller: VaultFactoryController;
  let vaultFactoryService: VaultFactoryService;
  let redisService: RedisService;
  let mockCacheManager: any;

  beforeEach(async () => {
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VaultFactoryController],
      providers: [
        {
          provide: VaultFactoryService,
          useValue: {
            create: jest.fn(),
            createFromBlockchainEvent: jest.fn(),
            findAllPaginated: jest.fn(),
            findOne: jest.fn(),
            findByAddress: jest.fn(),
            findByTransactionSignature: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            setVaultAddress: jest.fn(),
            updateStatus: jest.fn(),
            paginationHelper: {
              createPaginationQuery: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            keys: jest.fn(),
            delDirect: jest.fn(),
            reset: jest.fn(),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    controller = module.get<VaultFactoryController>(VaultFactoryController);
    vaultFactoryService = module.get<VaultFactoryService>(VaultFactoryService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllPaginated', () => {
    it('should fetch paginated vaults with caching', async () => {
      const mockReq = { user: { id: 'user123' } };
      const mockQuery = { vaultName: 'test', status: 'active' as const };
      const mockPaginationQuery = { skip: 0, limit: 10, sort: { createdAt: -1 as const } };
      const mockResult = { 
        data: [], 
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      };

      jest.spyOn(vaultFactoryService['paginationHelper'], 'createPaginationQuery')
        .mockReturnValue(mockPaginationQuery);
      jest.spyOn(vaultFactoryService, 'findAllPaginated')
        .mockResolvedValue(mockResult);

      const result = await controller.findAllPaginated(mockReq, mockQuery);

      expect(result).toEqual(mockResult);
      expect(vaultFactoryService.findAllPaginated).toHaveBeenCalledWith(mockPaginationQuery, mockQuery);
    });
  });

  describe('create', () => {
    it('should create vault and clear cache', async () => {
      const mockDto = {
        vaultName: 'Test Vault',
        vaultSymbol: 'TV',
        underlyingAssets: [{ mint: 'mint123', pct_bps: 1000, symbol: 'SOL', name: 'Solana' }],
        paymentTokens: [{ mint: 'mint456', decimals: 9, symbol: 'USDC', name: 'USD Coin' }],
        feeConfig: { managementFeeBps: 100 },
        params: { minDeposit: 100, maxDeposit: 10000, lockPeriod: 30, rebalanceThreshold: 500, maxSlippage: 100, strategy: 'passive' },
        creator: '507f1f77bcf86cd799439011' as any,
        creatorAddress: 'creator123'
      };
      const mockResult = { 
        id: 'vault123', 
        vaultName: 'Test Vault',
        vaultSymbol: 'TV',
        underlyingAssets: mockDto.underlyingAssets,
        paymentTokens: mockDto.paymentTokens,
        feeConfig: mockDto.feeConfig,
        params: mockDto.params,
        creator: mockDto.creator,
        creatorAddress: mockDto.creatorAddress,
        status: 'pending' as const
      } as any;
      const mockKeys = ['vault-factory:findAllPaginated', 'vault-factory:findOne'];

      jest.spyOn(vaultFactoryService, 'create').mockResolvedValue(mockResult);
      jest.spyOn(redisService, 'keys').mockResolvedValue(mockKeys);
      jest.spyOn(redisService, 'delDirect').mockResolvedValue(1);
      jest.spyOn(redisService, 'reset').mockResolvedValue();

      const result = await controller.create(mockDto);

      expect(result).toEqual(mockResult);
      expect(vaultFactoryService.create).toHaveBeenCalledWith(mockDto);
      expect(redisService.keys).toHaveBeenCalledWith('vault-factory:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(2);
      expect(redisService.reset).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update vault and clear cache', async () => {
      const mockId = 'vault123';
      const mockDto = { vaultName: 'Updated Vault' };
      const mockResult = { 
        id: mockId, 
        vaultName: 'Updated Vault',
        vaultSymbol: 'TV',
        underlyingAssets: [],
        paymentTokens: [],
        feeConfig: { managementFeeBps: 100 },
        params: { minDeposit: 100, maxDeposit: 10000, lockPeriod: 30, rebalanceThreshold: 500, maxSlippage: 100, strategy: 'passive' },
        creator: '507f1f77bcf86cd799439011' as any,
        creatorAddress: 'creator123',
        status: 'pending' as const
      } as any;
      const mockKeys = ['vault-factory:findAllPaginated'];

      jest.spyOn(vaultFactoryService, 'update').mockResolvedValue(mockResult);
      jest.spyOn(redisService, 'keys').mockResolvedValue(mockKeys);
      jest.spyOn(redisService, 'delDirect').mockResolvedValue(1);
      jest.spyOn(redisService, 'reset').mockResolvedValue();

      const result = await controller.update(mockId, mockDto);

      expect(result).toEqual(mockResult);
      expect(vaultFactoryService.update).toHaveBeenCalledWith(mockId, mockDto);
      expect(redisService.keys).toHaveBeenCalledWith('vault-factory:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(1);
      expect(redisService.reset).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove vault and clear cache', async () => {
      const mockId = 'vault123';
      const mockKeys = ['vault-factory:findAllPaginated'];

      jest.spyOn(vaultFactoryService, 'remove').mockResolvedValue();
      jest.spyOn(redisService, 'keys').mockResolvedValue(mockKeys);
      jest.spyOn(redisService, 'delDirect').mockResolvedValue(1);
      jest.spyOn(redisService, 'reset').mockResolvedValue();

      await controller.remove(mockId);

      expect(vaultFactoryService.remove).toHaveBeenCalledWith(mockId);
      expect(redisService.keys).toHaveBeenCalledWith('vault-factory:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(1);
      expect(redisService.reset).toHaveBeenCalled();
    });
  });

  describe('clearVaultCache', () => {
    it('should clear all vault-related cache entries', async () => {
      const mockKeys = ['vault-factory:findAllPaginated', 'vault-factory:findOne'];

      jest.spyOn(redisService, 'keys').mockResolvedValue(mockKeys);
      jest.spyOn(redisService, 'delDirect').mockResolvedValue(1);
      jest.spyOn(redisService, 'reset').mockResolvedValue();

      // Access the private method through the controller instance
      await (controller as any).clearVaultCache();

      expect(redisService.keys).toHaveBeenCalledWith('vault-factory:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(2);
      expect(redisService.reset).toHaveBeenCalled();
    });

    it('should handle errors gracefully when clearing cache', async () => {
      jest.spyOn(redisService, 'keys').mockRejectedValue(new Error('Redis error'));

      // Access the private method through the controller instance
      await expect((controller as any).clearVaultCache()).resolves.not.toThrow();
    });
  });
});
