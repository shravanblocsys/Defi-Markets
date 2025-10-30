import { Test, TestingModule } from '@nestjs/testing';
import { AssetAllocationService } from './asset-allocation.service';

describe('AssetAllocationService', () => {
  let service: AssetAllocationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AssetAllocationService],
    }).compile();

    service = module.get<AssetAllocationService>(AssetAllocationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
