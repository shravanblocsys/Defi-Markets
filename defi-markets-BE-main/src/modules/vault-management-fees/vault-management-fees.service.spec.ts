import { Test, TestingModule } from '@nestjs/testing';
import { VaultManagementFeesService } from './vault-management-fees.service';

describe('VaultManagementFeesService', () => {
  let service: VaultManagementFeesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VaultManagementFeesService],
    }).compile();

    service = module.get<VaultManagementFeesService>(VaultManagementFeesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
