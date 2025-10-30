import { ApiProperty } from '@nestjs/swagger';

export class GavNavDto {
  @ApiProperty({
    description: 'Gross Asset Value of the vault',
    example: 1250000.50,
    type: 'number'
  })
  grossAssetValue: number;

  @ApiProperty({
    description: 'Net Asset Value of the vault',
    example: 1187500.25,
    type: 'number'
  })
  netAssetValue: number;
}
