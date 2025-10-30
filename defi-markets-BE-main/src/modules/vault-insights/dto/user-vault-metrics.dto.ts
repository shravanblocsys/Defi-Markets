import { ApiProperty } from '@nestjs/swagger';

export class UserVaultMetricsDto {
  @ApiProperty({
    description: 'Total amount deposited by the user into the vault',
    example: 1500.75
  })
  totalDeposited: number;

  @ApiProperty({
    description: 'Total amount redeemed by the user from the vault',
    example: 500.25
  })
  totalRedeemed: number;

  @ApiProperty({
    description: 'Current value of user holdings in the vault',
    example: 1200.50
  })
  currentValue: number;

  @ApiProperty({
    description: 'Total returns (profit/loss) for the user',
    example: 200.00
  })
  totalReturns: number;

  @ApiProperty({
    description: 'Vault symbol',
    example: 'SOL-VAULT'
  })
  vaultSymbol: string;

  @ApiProperty({
    description: 'User wallet address',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
  })
  userAddress: string;
}
