import { Test, TestingModule } from '@nestjs/testing';
import { VaultInsightsController } from './vault-insights.controller';

describe('VaultInsightsController', () => {
  let controller: VaultInsightsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VaultInsightsController],
    }).compile();

    controller = module.get<VaultInsightsController>(VaultInsightsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
