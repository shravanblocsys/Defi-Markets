import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { RedisService } from '../../utils/redis/redis.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';

describe('WalletController', () => {
  let controller: WalletController;
  let walletService: jest.Mocked<WalletService>;
  let redisService: jest.Mocked<RedisService>;

  const mockWallet = {
    _id: '507f1f77bcf86cd799439011',
    address: '0x742d35Cc6634C0532925a3b8D4C9db96C8C8E',
    label: 'Treasury Main',
    roles: ['507f1f77bcf86cd799439012'],
    currency: 'ETH',
    isActive: true,
    description: 'Primary treasury wallet',
    tags: ['treasury', 'main'],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockCreateWalletDto: CreateWalletDto = {
    address: '0x742d35Cc6634C0532925a3b8D4C9db96C8C8E',
    label: 'Treasury Main',
    roles: ['507f1f77bcf86cd799439012'],
    currency: 'ETH',
    description: 'Primary treasury wallet',
    tags: ['treasury', 'main'],
    isActive: true
  };

  const mockUpdateWalletDto: UpdateWalletDto = {
    label: 'Updated Treasury Main',
    description: 'Updated description'
  };

  beforeEach(async () => {
    const mockWalletService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      findByAddress: jest.fn(),
      findByRole: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      addRole: jest.fn(),
      removeRole: jest.fn(),
      getWalletStats: jest.fn()
    };

    const mockRedisService = {
      keys: jest.fn(),
      delDirect: jest.fn(),
      reset: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        { provide: WalletService, useValue: mockWalletService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn(), reset: jest.fn() } }
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
    walletService = module.get(WalletService);
    redisService = module.get(RedisService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a wallet and clear cache', async () => {
      walletService.create.mockResolvedValue(mockWallet as any);
      redisService.keys.mockResolvedValue(['wallets:all', 'wallets:stats', 'wallets:id:507f1f77bcf86cd799439011']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      const result = await controller.create(mockCreateWalletDto);

      expect(result).toEqual(mockWallet);
      expect(walletService.create).toHaveBeenCalledWith(mockCreateWalletDto);
      expect(redisService.keys).toHaveBeenCalledWith('wallets:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(3);
      expect(redisService.reset).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all wallets', async () => {
      const wallets = [mockWallet];
      walletService.findAll.mockResolvedValue(wallets as any);

      const result = await controller.findAll();

      expect(result).toEqual(wallets);
      expect(walletService.findAll).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a wallet and clear cache', async () => {
      const updatedWallet = { ...mockWallet, label: 'Updated Treasury Main' };
      walletService.update.mockResolvedValue(updatedWallet as any);
      redisService.keys.mockResolvedValue(['wallets:all', 'wallets:stats', 'wallets:id:507f1f77bcf86cd799439011']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      const result = await controller.update('507f1f77bcf86cd799439011', mockUpdateWalletDto);

      expect(result).toEqual(updatedWallet);
      expect(walletService.update).toHaveBeenCalledWith('507f1f77bcf86cd799439011', mockUpdateWalletDto);
      expect(redisService.keys).toHaveBeenCalledWith('wallets:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(3);
      expect(redisService.reset).toHaveBeenCalled();
    });

    it('should handle single field updates correctly', async () => {
      const singleFieldUpdate = { label: 'Single Field Update' };
      const updatedWallet = { ...mockWallet, label: 'Single Field Update' };
      walletService.update.mockResolvedValue(updatedWallet as any);
      redisService.keys.mockResolvedValue(['wallets:all', 'wallets:stats', 'wallets:id:507f1f77bcf86cd799439011']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      const result = await controller.update('507f1f77bcf86cd799439011', singleFieldUpdate);

      expect(result).toEqual(updatedWallet);
      expect(walletService.update).toHaveBeenCalledWith('507f1f77bcf86cd799439011', singleFieldUpdate);
    });
  });

  describe('remove', () => {
    it('should remove a wallet and clear cache', async () => {
      const deleteResponse = { message: 'Wallet deleted successfully', walletId: '507f1f77bcf86cd799439011' };
      walletService.remove.mockResolvedValue(deleteResponse);
      redisService.keys.mockResolvedValue(['wallets:all', 'wallets:stats', 'wallets:id:507f1f77bcf86cd799439011']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      const result = await controller.remove('507f1f77bcf86cd799439011');

      expect(result).toEqual(deleteResponse);
      expect(result.walletId).toBe('507f1f77bcf86cd799439011');
      expect(walletService.remove).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(redisService.keys).toHaveBeenCalledWith('wallets:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(3);
      expect(redisService.reset).toHaveBeenCalled();
    });
  });

  describe('clearWalletCache', () => {
    it('should clear wallet cache successfully', async () => {
      redisService.keys.mockResolvedValue(['wallets:all', 'wallets:stats', 'wallets:id:507f1f77bcf86cd799439011']);
      redisService.delDirect.mockResolvedValue(1);
      redisService.reset.mockResolvedValue();

      // Access private method through any type
      await (controller as any).clearWalletCache();

      expect(redisService.keys).toHaveBeenCalledWith('wallets:*');
      expect(redisService.delDirect).toHaveBeenCalledTimes(3);
      expect(redisService.reset).toHaveBeenCalled();
    });

    it('should handle cache clearing errors gracefully', async () => {
      redisService.keys.mockRejectedValue(new Error('Redis error'));

      // Access private method through any type
      await (controller as any).clearWalletCache();

      expect(redisService.keys).toHaveBeenCalledWith('wallets:*');
      // Should not throw error, just log it
    });
  });
});
