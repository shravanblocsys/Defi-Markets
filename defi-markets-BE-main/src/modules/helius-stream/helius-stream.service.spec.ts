import { Test, TestingModule } from '@nestjs/testing';
import { HeliusStreamService } from './helius-stream.service';
import { ConfigService } from '../config/config.service';
import * as crypto from 'crypto';

describe('HeliusStreamService', () => {
  let service: HeliusStreamService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeliusStreamService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
      ],
    }).compile();

    service = module.get<HeliusStreamService>(HeliusStreamService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processWebhookData', () => {
    it('should process vault_created events', async () => {
      const vaultEvent = {
        type: 'vault_created',
        description: 'Vault creation event',
        signature: 'test-signature',
        slot: 404991589,
        timestamp: 1733159674,
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
          ],
        },
        accounts: {
          factory: 'factory-address',
          vault: 'vault-address',
          creator: 'creator-address',
          etf_vault_program: 'etf-program',
          system_program: 'system-program',
        },
        metadata: {
          network: 'devnet',
          instruction_name: 'CreateVault',
          compute_units_consumed: 15659,
          fee: 5000,
        },
      };

      const result = await service.processWebhookData(vaultEvent);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('vault_created');
      expect(result.message).toBe('Vault creation event processed successfully');
      expect(result.data).toBeDefined();
    });

    it('should skip non-vault events', async () => {
      const nonVaultEvent = {
        type: 'NFT_SALE',
        description: 'NFT sale event',
        signature: 'test-signature',
      };

      const result = await service.processWebhookData(nonVaultEvent);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('NFT_SALE');
      expect(result.message).toBe('Event type not vault-related, skipping');
    });

    it('should handle errors gracefully', async () => {
      const invalidEvent = {
        type: 'vault_created',
        // Missing required fields to cause an error
      };

      const result = await service.processWebhookData(invalidEvent);

      expect(result.success).toBe(false);
      expect(result.eventType).toBe('vault_created');
      expect(result.error).toBeDefined();
    });
  });

  describe('verifyWebhookSignature', () => {
    const testBody = { test: 'data', timestamp: 1234567890 };
    const testSecret = 'test-secret';

    beforeEach(() => {
      jest.spyOn(configService, 'get').mockReturnValue(testSecret);
    });

    describe('Direct Secret Match', () => {
      it('should verify webhook signature successfully with direct secret match', () => {
        const authHeader = testSecret;

        const result = service.verifyWebhookSignature(testBody, authHeader);

        expect(result).toBe(true);
      });

      it('should fail with incorrect direct secret', () => {
        const authHeader = 'wrong-secret';

        expect(() => {
          service.verifyWebhookSignature(testBody, authHeader);
        }).toThrow('Invalid authentication header');
      });
    });

    describe('HMAC SHA256 Verification', () => {
      it('should verify webhook signature successfully with HMAC SHA256', () => {
        const bodyString = JSON.stringify(testBody);
        const expectedSignature = crypto
          .createHmac('sha256', testSecret)
          .update(bodyString)
          .digest('hex');
        
        const authHeader = expectedSignature;

        const result = service.verifyWebhookSignature(testBody, authHeader);

        expect(result).toBe(true);
      });

      it('should fail with incorrect HMAC SHA256 signature', () => {
        const bodyString = JSON.stringify(testBody);
        const wrongSignature = crypto
          .createHmac('sha256', 'wrong-secret')
          .update(bodyString)
          .digest('hex');
        
        const authHeader = wrongSignature;

        expect(() => {
          service.verifyWebhookSignature(testBody, authHeader);
        }).toThrow('Invalid authentication header');
      });

      it('should fail with malformed HMAC signature', () => {
        const authHeader = 'invalid-hex-string';

        expect(() => {
          service.verifyWebhookSignature(testBody, authHeader);
        }).toThrow('Invalid authentication header');
      });

      it('should handle empty body with HMAC verification', () => {
        const emptyBody = {};
        const bodyString = JSON.stringify(emptyBody);
        const expectedSignature = crypto
          .createHmac('sha256', testSecret)
          .update(bodyString)
          .digest('hex');
        
        const authHeader = expectedSignature;

        const result = service.verifyWebhookSignature(emptyBody, authHeader);

        expect(result).toBe(true);
      });

      it('should handle complex nested body with HMAC verification', () => {
        const complexBody = {
          nested: {
            data: [1, 2, 3],
            metadata: {
              timestamp: Date.now(),
              version: '1.0.0'
            }
          },
          array: ['a', 'b', 'c']
        };
        const bodyString = JSON.stringify(complexBody);
        const expectedSignature = crypto
          .createHmac('sha256', testSecret)
          .update(bodyString)
          .digest('hex');
        
        const authHeader = expectedSignature;

        const result = service.verifyWebhookSignature(complexBody, authHeader);

        expect(result).toBe(true);
      });
    });

    describe('MD5 Verification', () => {
      it('should verify webhook signature successfully with MD5 hash', () => {
        const bodyString = JSON.stringify(testBody);
        const expectedMd5 = crypto
          .createHash('md5')
          .update(bodyString + testSecret)
          .digest('hex');
        
        const authHeader = expectedMd5;

        const result = service.verifyWebhookSignature(testBody, authHeader);

        expect(result).toBe(true);
      });

      it('should fail with incorrect MD5 hash', () => {
        const bodyString = JSON.stringify(testBody);
        const wrongMd5 = crypto
          .createHash('md5')
          .update(bodyString + 'wrong-secret')
          .digest('hex');
        
        const authHeader = wrongMd5;

        expect(() => {
          service.verifyWebhookSignature(testBody, authHeader);
        }).toThrow('Invalid authentication header');
      });

      it('should fail with malformed MD5 hash', () => {
        const authHeader = 'invalid-md5-hash';

        expect(() => {
          service.verifyWebhookSignature(testBody, authHeader);
        }).toThrow('Invalid authentication header');
      });

      it('should handle empty body with MD5 verification', () => {
        const emptyBody = {};
        const bodyString = JSON.stringify(emptyBody);
        const expectedMd5 = crypto
          .createHash('md5')
          .update(bodyString + testSecret)
          .digest('hex');
        
        const authHeader = expectedMd5;

        const result = service.verifyWebhookSignature(emptyBody, authHeader);

        expect(result).toBe(true);
      });
    });

    describe('Security Edge Cases', () => {
      it('should handle timing attacks by not revealing which method failed', () => {
        const wrongSecret = 'wrong-secret';
        const bodyString = JSON.stringify(testBody);
        
        // Try HMAC with wrong secret
        const wrongHmac = crypto
          .createHmac('sha256', wrongSecret)
          .update(bodyString)
          .digest('hex');
        
        // Try MD5 with wrong secret  
        const wrongMd5 = crypto
          .createHash('md5')
          .update(bodyString + wrongSecret)
          .digest('hex');

        // Both should fail with the same error message
        expect(() => {
          service.verifyWebhookSignature(testBody, wrongHmac);
        }).toThrow('Invalid authentication header');

        expect(() => {
          service.verifyWebhookSignature(testBody, wrongMd5);
        }).toThrow('Invalid authentication header');
      });

      it('should handle very long body content', () => {
        const longBody = {
          data: 'x'.repeat(10000), // 10KB string
          timestamp: Date.now()
        };
        const bodyString = JSON.stringify(longBody);
        const expectedSignature = crypto
          .createHmac('sha256', testSecret)
          .update(bodyString)
          .digest('hex');
        
        const authHeader = expectedSignature;

        const result = service.verifyWebhookSignature(longBody, authHeader);

        expect(result).toBe(true);
      });

      it('should handle special characters in body content', () => {
        const specialBody = {
          data: 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?',
          unicode: 'Unicode: 🚀💰🎯',
          quotes: 'Single: \' Double: " Backtick: `',
          newlines: 'Line1\nLine2\r\nLine3'
        };
        const bodyString = JSON.stringify(specialBody);
        const expectedSignature = crypto
          .createHmac('sha256', testSecret)
          .update(bodyString)
          .digest('hex');
        
        const authHeader = expectedSignature;

        const result = service.verifyWebhookSignature(specialBody, authHeader);

        expect(result).toBe(true);
      });
    });

    describe('Error Handling', () => {
      it('should throw error for missing secret', () => {
        jest.spyOn(configService, 'get').mockReturnValue(undefined as any);

        expect(() => {
          service.verifyWebhookSignature(testBody, 'test-header');
        }).toThrow('Webhook secret not configured');
      });

      it('should throw error for missing auth header', () => {
        expect(() => {
          service.verifyWebhookSignature(testBody, '');
        }).toThrow('Authentication header not provided');
      });

      it('should throw error for null auth header', () => {
        expect(() => {
          service.verifyWebhookSignature(testBody, null as any);
        }).toThrow('Authentication header not provided');
      });

      it('should throw error for undefined auth header', () => {
        expect(() => {
          service.verifyWebhookSignature(testBody, undefined as any);
        }).toThrow('Authentication header not provided');
      });

      it('should throw error when all verification methods fail', () => {
        const invalidHeader = 'completely-invalid-header';

        expect(() => {
          service.verifyWebhookSignature(testBody, invalidHeader);
        }).toThrow('Invalid authentication header');
      });
    });

    describe('Verification Priority', () => {
      it('should prioritize direct secret match over HMAC verification', () => {
        const bodyString = JSON.stringify(testBody);
        const hmacSignature = crypto
          .createHmac('sha256', testSecret)
          .update(bodyString)
          .digest('hex');
        
        // Even if HMAC signature is valid, direct secret should take precedence
        const authHeader = testSecret; // Direct secret

        const result = service.verifyWebhookSignature(testBody, authHeader);

        expect(result).toBe(true);
      });

      it('should try HMAC verification if direct secret fails', () => {
        const bodyString = JSON.stringify(testBody);
        const hmacSignature = crypto
          .createHmac('sha256', testSecret)
          .update(bodyString)
          .digest('hex');
        
        const authHeader = hmacSignature; // HMAC signature

        const result = service.verifyWebhookSignature(testBody, authHeader);

        expect(result).toBe(true);
      });

      it('should try MD5 verification if both direct secret and HMAC fail', () => {
        const bodyString = JSON.stringify(testBody);
        const md5Hash = crypto
          .createHash('md5')
          .update(bodyString + testSecret)
          .digest('hex');
        
        const authHeader = md5Hash; // MD5 hash

        const result = service.verifyWebhookSignature(testBody, authHeader);

        expect(result).toBe(true);
      });
    });
  });
});
