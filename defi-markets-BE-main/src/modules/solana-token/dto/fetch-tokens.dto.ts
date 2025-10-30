import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { NetworkType } from '../../asset-allocation/entities/asset-allocation.entity';

export class FetchTokensDto {
  @ApiProperty({
    description: 'Network type to fetch tokens from',
    enum: NetworkType,
    example: NetworkType.MAINNET,
    required: false,
    default: NetworkType.MAINNET
  })
  @IsOptional()
  @IsEnum(NetworkType)
  network?: NetworkType;
}
