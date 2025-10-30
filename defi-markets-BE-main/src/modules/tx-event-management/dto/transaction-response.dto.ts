import { ApiProperty } from '@nestjs/swagger';

export class TransactionResponseDto {
  @ApiProperty({
    description: 'Transaction signature',
    example: '41xUTMn2bLsd2VKDZnkyXerFP8CWSBcEqZGW1eeudbLxxDYquFWcRx7E2UHEa45Rr1dnPi4QLFfNxzsBMEAmm4Tr'
  })
  signature: string;

  @ApiProperty({
    description: 'Transaction status',
    example: 'confirmed'
  })
  status: string;

  @ApiProperty({
    description: 'Structured decoded program data with event details',
    example: [{
      eventType: 'VaultCreated',
      vault: '94e6XgPDWSCNENc6BPZHTUbMnziVPbEn8hvmdWog9cre',
      vaultName: 'Vault_1756982611845',
      vaultSymbol: 'VT7GD',
      managementFeePercent: '1.50',
      underlyingAssetsCount: 3
    }]
  })
  programDataStructured: any[];
}
