import { PartialType } from '@nestjs/swagger';
import { CreateWalletRoleDto } from './create-wallet-role.dto';

export class UpdateWalletRoleDto extends PartialType(CreateWalletRoleDto) {}
