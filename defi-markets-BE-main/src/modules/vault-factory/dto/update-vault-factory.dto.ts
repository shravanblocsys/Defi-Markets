import { PartialType } from '@nestjs/mapped-types';
import { CreateVaultFactoryDto } from './create-vault-factory.dto';

export class UpdateVaultFactoryDto extends PartialType(CreateVaultFactoryDto) {}
