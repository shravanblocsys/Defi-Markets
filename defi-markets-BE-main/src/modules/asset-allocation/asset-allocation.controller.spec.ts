import { Test, TestingModule } from '@nestjs/testing';
import { AssetAllocationController } from './asset-allocation.controller';
import { AssetAllocationService } from './asset-allocation.service';

describe('AssetAllocationController', () => {
  let controller: AssetAllocationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetAllocationController],
      providers: [AssetAllocationService],
    }).compile();

    controller = module.get<AssetAllocationController>(AssetAllocationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
