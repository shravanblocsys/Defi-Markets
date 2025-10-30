import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SiwxService } from './siwx.service';
import { SiwxVerifierService } from './siwx-verifier.service';
import { SiwxStorageService } from './siwx-storage.service';
import { ConfigService } from '../config/config.service';
import { ProfileService } from '../profile/profile.service';

describe('SiwxService', () => {
  let service: SiwxService;
  let verifierService: SiwxVerifierService;
  let storageService: SiwxStorageService;

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn().mockReturnValue({
      sessionId: 'test-session-id',
      address: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
      chainId: 'eip155:1',
    }),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  const mockProfileService = {
    getByUsername: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ _id: 'test-user-id' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiwxService,
        SiwxVerifierService,
        SiwxStorageService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: ProfileService,
          useValue: mockProfileService,
        },
      ],
    }).compile();

    service = module.get<SiwxService>(SiwxService);
    verifierService = module.get<SiwxVerifierService>(SiwxVerifierService);
    storageService = module.get<SiwxStorageService>(SiwxStorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMessage', () => {
    it('should create a SIWX message', async () => {
      const input = {
        domain: 'test.com',
        address: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        statement: 'Test message',
        uri: 'https://test.com',
        version: '1',
        chainId: 'eip155:1',
        nonce: 'test-nonce',
      };

      const result = await service.createMessage(input);

      expect(result).toBeDefined();
      expect(result.domain).toBe(input.domain);
      expect(result.address).toBe(input.address);
      expect(result.statement).toBe(input.statement);
      expect(result.uri).toBe(input.uri);
      expect(result.version).toBe(input.version);
      expect(result.chainId).toBe(input.chainId);
      expect(result.nonce).toBe(input.nonce);
      expect(result.issuedAt).toBeDefined();
      expect(result.expirationTime).toBeDefined();
    });
  });

  describe('getStorageStats', () => {
    it('should return storage statistics', () => {
      const stats = service.getStorageStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalSessions).toBeDefined();
      expect(stats.totalAddresses).toBeDefined();
      expect(typeof stats.totalSessions).toBe('number');
      expect(typeof stats.totalAddresses).toBe('number');
    });
  });
});
