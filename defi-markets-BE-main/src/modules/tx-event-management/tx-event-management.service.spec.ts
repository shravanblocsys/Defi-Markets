import { Test, TestingModule } from '@nestjs/testing';
import { TxEventManagementService } from './tx-event-management.service';

describe('TxEventManagementService', () => {
  let service: TxEventManagementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TxEventManagementService],
    }).compile();

    service = module.get<TxEventManagementService>(TxEventManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
