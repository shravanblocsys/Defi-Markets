import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { VaultFactoryService } from '../vault-factory/vault-factory.service';
import { VaultDepositService } from '../vault-deposit/vault-deposit.service';
import { VaultStatisticsDto } from './dto/vault-statistics.dto';

describe('DashboardService', () => {
  let service: DashboardService;
  let vaultFactoryService: jest.Mocked<VaultFactoryService>;
  let vaultDepositService: jest.Mocked<VaultDepositService>;

  beforeEach(async () => {
    const mockVaultFactoryService = {
      count: jest.fn(),
      countByStatus: jest.fn(),
    };

    const mockVaultDepositService = {
      countCompletedDeposits: jest.fn(),
      countCompletedRedeems: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: VaultFactoryService,
          useValue: mockVaultFactoryService,
        },
        {
          provide: VaultDepositService,
          useValue: mockVaultDepositService,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    vaultFactoryService = module.get(VaultFactoryService);
    vaultDepositService = module.get(VaultDepositService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getVaultStatistics', () => {
    it('should return vault statistics including deposits and redeems', async () => {
      const mockStats = {
        totalVaults: 100,
        activeVaults: 80,
        pausedVaults: 15,
        pendingVaults: 5,
        closedVaults: 0,
        totalDeposits: 250,
        totalRedeems: 75,
      };

      vaultFactoryService.count.mockResolvedValue(100);
      vaultFactoryService.countByStatus.mockResolvedValueOnce(80); // active
      vaultFactoryService.countByStatus.mockResolvedValueOnce(15); // paused
      vaultFactoryService.countByStatus.mockResolvedValueOnce(5);  // pending
      vaultFactoryService.countByStatus.mockResolvedValueOnce(0);  // closed
      vaultDepositService.countCompletedDeposits.mockResolvedValue(250);
      vaultDepositService.countCompletedRedeems.mockResolvedValue(75);

      const result = await service.getVaultStatistics();

      expect(result).toEqual(mockStats);
      expect(vaultFactoryService.count).toHaveBeenCalled();
      expect(vaultFactoryService.countByStatus).toHaveBeenCalledWith('active');
      expect(vaultFactoryService.countByStatus).toHaveBeenCalledWith('paused');
      expect(vaultFactoryService.countByStatus).toHaveBeenCalledWith('pending');
      expect(vaultFactoryService.countByStatus).toHaveBeenCalledWith('closed');
      expect(vaultDepositService.countCompletedDeposits).toHaveBeenCalled();
      expect(vaultDepositService.countCompletedRedeems).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database connection failed');
      vaultFactoryService.count.mockRejectedValue(error);

      await expect(service.getVaultStatistics()).rejects.toThrow('Database connection failed');
    });
  });
});
