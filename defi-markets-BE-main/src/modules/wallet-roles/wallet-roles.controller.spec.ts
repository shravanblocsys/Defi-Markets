import { Test, TestingModule } from '@nestjs/testing';
import { WalletRolesController } from './wallet-roles.controller';
import { WalletRolesService } from './wallet-roles.service';

describe('WalletRolesController', () => {
  let controller: WalletRolesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletRolesController],
      providers: [WalletRolesService],
    }).compile();

    controller = module.get<WalletRolesController>(WalletRolesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
