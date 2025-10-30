import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Logger,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { WalletRolesService } from './wallet-roles.service';
import { CreateWalletRoleDto } from './dto/create-wallet-role.dto';
import { UpdateWalletRoleDto } from './dto/update-wallet-role.dto';
import { WalletRole } from './entities/wallet-role.entity';

@Controller('api/v1/wallet-roles')
export class WalletRolesController {
  private readonly logger = new Logger(WalletRolesController.name);

  constructor(private readonly walletRolesService: WalletRolesService) {}
}
