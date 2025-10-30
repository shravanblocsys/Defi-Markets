import { PartialType } from '@nestjs/swagger';
import { CreateVaultManagementFeeDto } from './create-vault-management-fee.dto';

export class UpdateVaultManagementFeeDto extends PartialType(CreateVaultManagementFeeDto) {}
