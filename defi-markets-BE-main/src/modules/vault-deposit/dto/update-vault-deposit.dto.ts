import { PartialType } from '@nestjs/mapped-types';
import { CreateVaultDepositDto } from './create-vault-deposit.dto';

export class UpdateVaultDepositDto extends PartialType(CreateVaultDepositDto) {}