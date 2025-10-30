import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReadTransactionDto {
  @ApiProperty({
    description: 'Solana transaction signature/hash',
    example: '41xUTMn2bLsd2VKDZnkyXerFP8CWSBcEqZGW1eeudbLxxDYquFWcRx7E2UHEa45Rr1dnPi4QLFfNxzsBMEAmm4Tr'
  })
  @IsString()
  @IsNotEmpty()
  transactionSignature: string;

  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
