import { Test, TestingModule } from '@nestjs/testing';
import { VaultManagementFeesController } from './vault-management-fees.controller';
import { VaultManagementFeesService } from './vault-management-fees.service';

describe('VaultManagementFeesController', () => {
  let controller: VaultManagementFeesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VaultManagementFeesController],
      providers: [VaultManagementFeesService],
    }).compile();

    controller = module.get<VaultManagementFeesController>(VaultManagementFeesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
