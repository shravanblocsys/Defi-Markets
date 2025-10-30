import { Test, TestingModule } from '@nestjs/testing';
import { SolanaTokenService } from './solana-token.service';

describe('SolanaTokenService', () => {
  let service: SolanaTokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SolanaTokenService],
    }).compile();

    service = module.get<SolanaTokenService>(SolanaTokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
