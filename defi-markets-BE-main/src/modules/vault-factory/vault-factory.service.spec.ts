import { Test, TestingModule } from '@nestjs/testing';
import { VaultFactoryService } from './vault-factory.service';
import { getModelToken } from '@nestjs/mongoose';
import { VaultFactory } from './entities/vault-factory.entity';
import { VaultCreationEventDto } from './dto/vault-creation-event.dto';

describe('VaultFactoryService', () => {
  let service: VaultFactoryService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      new: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultFactoryService,
        {
          provide: getModelToken(VaultFactory.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<VaultFactoryService>(VaultFactoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFromBlockchainEvent', () => {
    it('should create a vault from blockchain event', async () => {
      const mockEvent: VaultCreationEventDto = {
        event_type: 'vault_created',
        program_id: '3nRdknTKDH2sUBQ6zzdhGL6XeYEpfFhYuCPkRuaF9yWC',
        instruction_index: 0,
        transaction_signature: 'test-signature',
        slot: 404991589,
        block_time: 1733159674,
        accounts: {
          factory: 'factory-address',
          vault: 'vault-address',
          creator: 'creator-address',
          etf_vault_program: 'etf-program',
          system_program: 'system-program',
        },
        vault_data: {
          vault_name: 'Test Vault',
          vault_symbol: 'TV',
          management_fee_bps: 150,
          underlying_assets: [
            {
              mint: 'SOL-mint',
              pct_bps: 4000,
              name: 'Solana',
              symbol: 'SOL',
            },
            {
              mint: 'USDC-mint',
              pct_bps: 6000,
              name: 'USDC',
              symbol: 'USDC',
            },
          ],
        },
        metadata: {
          network: 'devnet',
          instruction_name: 'CreateVault',
          compute_units_consumed: 15659,
          fee: 5000,
        },
      };

      const mockVault = {
        _id: 'test-id',
        vaultName: 'Test Vault',
        vaultSymbol: 'TV',
        status: 'active',
        vaultAddress: 'vault-address',
        programId: '3nRdknTKDH2sUBQ6zzdhGL6XeYEpfFhYuCPkRuaF9yWC',
        transactionSignature: 'test-signature',
        slot: 404991589,
        blockTime: 1733159674,
        network: 'devnet',
      };

      mockModel.new.mockReturnValue(mockVault);
      mockModel.save.mockResolvedValue(mockVault);

      const result = await service.createFromBlockchainEvent(mockEvent);

      expect(result).toEqual(mockVault);
      expect(mockModel.new).toHaveBeenCalledWith(expect.objectContaining({
        vaultName: 'Test Vault',
        vaultSymbol: 'TV',
        status: 'active',
        vaultAddress: 'vault-address',
        programId: '3nRdknTKDH2sUBQ6zzdhGL6XeYEpfFhYuCPkRuaF9yWC',
        transactionSignature: 'test-signature',
        slot: 404991589,
        blockTime: 1733159674,
        network: 'devnet',
      }));
    });
  });
});
