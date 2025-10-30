import { Test, TestingModule } from '@nestjs/testing';
import { VaultDepositService } from './vault-deposit.service';

describe('VaultDepositService', () => {
  let service: VaultDepositService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VaultDepositService],
    }).compile();

    service = module.get<VaultDepositService>(VaultDepositService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
