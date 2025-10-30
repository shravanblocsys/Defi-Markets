import { ApiProperty } from '@nestjs/swagger';

export class VaultInsightsDto {
  @ApiProperty({
    description: 'Total count of underlying assets in the vault',
    example: 5
  })
  totalUnderlyingAssetsCount: number;

  @ApiProperty({
    description: 'Total count of unique users who have deposited into the vault',
    example: 150
  })
  totalUsersCount: number;

  @ApiProperty({
    description: 'Vault symbol',
    example: 'SC-ETF'
  })
  vaultSymbol: string;
}
