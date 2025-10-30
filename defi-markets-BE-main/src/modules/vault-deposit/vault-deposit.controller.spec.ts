import { Test, TestingModule } from '@nestjs/testing';
import { VaultDepositController } from './vault-deposit.controller';
import { VaultDepositService } from './vault-deposit.service';

describe('VaultDepositController', () => {
  let controller: VaultDepositController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VaultDepositController],
      providers: [VaultDepositService],
    }).compile();

    controller = module.get<VaultDepositController>(VaultDepositController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
