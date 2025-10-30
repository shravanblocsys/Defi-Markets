import { IsNumber, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemSwapAdminDto {
  @ApiProperty({ description: 'Vault index (0-based)', example: 12 })
  @IsNumber()
  @IsNotEmpty()
  vaultIndex: number;

  @ApiProperty({ description: 'Vault token amount raw (u64 as string)', example: '1000000' })
  @IsString()
  @IsNotEmpty()
  vaultTokenAmount: string;
}


