import { Test, TestingModule } from "@nestjs/testing";
import { VaultInsightsService } from "./vault-insights.service";
import { ChartsService } from "../charts/charts.service";

describe("VaultInsightsService", () => {
  let service: VaultInsightsService;
  let chartsService: ChartsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultInsightsService,
        {
          provide: ChartsService,
          useValue: {
            getVaultNavSeries: jest.fn(),
          },
        },
        // Mock other dependencies
        {
          provide: "VaultFactoryModel",
          useValue: {},
        },
        {
          provide: "VaultFactoryService",
          useValue: {},
        },
        {
          provide: "VaultDepositService",
          useValue: {},
        },
        {
          provide: "FeesManagementService",
          useValue: {},
        },
        {
          provide: "HistoryService",
          useValue: {},
        },
        {
          provide: "PaginationHelper",
          useValue: {},
        },
        {
          provide: "HttpService",
          useValue: {},
        },
        {
          provide: "RedisService",
          useValue: {},
        },
        {
          provide: "ConfigService",
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<VaultInsightsService>(VaultInsightsService);
    chartsService = module.get<ChartsService>(ChartsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("calculateVaultAPY", () => {
    it("should calculate APY correctly with valid NAV data", async () => {
      const mockNavSeries = {
        vaultName: "Test Vault",
        series: [
          {
            timestamp: new Date("2023-01-01"),
            nav: 100,
            gav: 100,
          },
          {
            timestamp: new Date("2024-01-01"),
            nav: 110,
            gav: 110,
          },
        ],
      };

      jest
        .spyOn(chartsService, "getVaultNavSeries")
        .mockResolvedValue(mockNavSeries);

      const apy = await (service as any).calculateVaultAPY("test-vault-id");

      // Expected APY: ((110/100)^(1/1) - 1) * 100 = 10%
      expect(apy).toBe(10);
    });

    it("should return null for insufficient NAV data", async () => {
      const mockNavSeries = {
        vaultName: "Test Vault",
        series: [
          {
            timestamp: new Date("2023-01-01"),
            nav: 100,
            gav: 100,
          },
        ],
      };

      jest
        .spyOn(chartsService, "getVaultNavSeries")
        .mockResolvedValue(mockNavSeries);

      const apy = await (service as any).calculateVaultAPY("test-vault-id");

      expect(apy).toBeNull();
    });

    it("should return null for invalid NAV values", async () => {
      const mockNavSeries = {
        vaultName: "Test Vault",
        series: [
          {
            timestamp: new Date("2023-01-01"),
            nav: 0,
            gav: 0,
          },
          {
            timestamp: new Date("2024-01-01"),
            nav: 110,
            gav: 110,
          },
        ],
      };

      jest
        .spyOn(chartsService, "getVaultNavSeries")
        .mockResolvedValue(mockNavSeries);

      const apy = await (service as any).calculateVaultAPY("test-vault-id");

      expect(apy).toBeNull();
    });
  });

  describe("enrichVaultWithTvlAndApy", () => {
    it("should enrich vault data with TVL and APY", async () => {
      const mockDoc = {
        _id: "vault-id",
        vaultName: "Test Vault",
        vaultSymbol: "TEST",
        nav: 1.05,
        totalSupply: 1000000,
        feeConfig: { managementFeeBps: 150 },
        underlyingAssets: [],
        creator: { name: "Test Creator" },
        vaultAddress: "vault-address",
        toObject: () => ({
          _id: "vault-id",
          vaultName: "Test Vault",
          vaultSymbol: "TEST",
          nav: 1.05,
          totalSupply: 1000000,
          feeConfig: { managementFeeBps: 150 },
          underlyingAssets: [],
          creator: { name: "Test Creator" },
          vaultAddress: "vault-address",
        }),
      };

      const mockNavSeries = {
        vaultName: "Test Vault",
        series: [
          { timestamp: new Date("2023-01-01"), nav: 100, gav: 100 },
          { timestamp: new Date("2024-01-01"), nav: 110, gav: 110 },
        ],
      };

      jest
        .spyOn(chartsService, "getVaultNavSeries")
        .mockResolvedValue(mockNavSeries);

      const enrichedVault = await (service as any).enrichVaultWithTvlAndApy(
        mockDoc
      );

      expect(enrichedVault).toHaveProperty("_id", "vault-id");
      expect(enrichedVault).toHaveProperty("vaultName", "Test Vault");
      expect(enrichedVault).toHaveProperty("apy", 10);
      expect(enrichedVault).toHaveProperty("totalValueLocked");
    });
  });
});
