import { Test, TestingModule } from '@nestjs/testing';
import { SolanaTokenController } from './solana-token.controller';

describe('SolanaTokenController', () => {
  let controller: SolanaTokenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SolanaTokenController],
    }).compile();

    controller = module.get<SolanaTokenController>(SolanaTokenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
