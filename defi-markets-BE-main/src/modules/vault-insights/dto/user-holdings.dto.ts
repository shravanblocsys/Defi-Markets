import { ApiProperty } from '@nestjs/swagger';

export class UserHoldingDto {
  @ApiProperty({
    description: 'User wallet address',
    example: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Total holding amount in the vault',
    example: 1250.75
  })
  totalHolding: number;

  @ApiProperty({
    description: 'Number of shares held',
    example: 100.5
  })
  sharesHeld: number;

  @ApiProperty({
    description: 'User profile information',
    example: {
      username: 'john_doe',
      name: 'John Doe',
      avatar: 'https://example.com/avatar.jpg'
    }
  })
  userProfile?: {
    username?: string;
    name?: string;
    avatar?: string;
  };
}

export class UserHoldingsResponseDto {
  @ApiProperty({
    description: 'Total number of users with holdings',
    example: 150
  })
  totalUsers: number;

  @ApiProperty({
    description: 'Array of user holdings',
    type: [UserHoldingDto]
  })
  holdings: UserHoldingDto[];
}
