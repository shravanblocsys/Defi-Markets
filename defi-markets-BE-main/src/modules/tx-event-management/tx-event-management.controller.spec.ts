import { Test, TestingModule } from '@nestjs/testing';
import { TxEventManagementController } from './tx-event-management.controller';

describe('TxEventManagementController', () => {
  let controller: TxEventManagementController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TxEventManagementController],
    }).compile();

    controller = module.get<TxEventManagementController>(TxEventManagementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
