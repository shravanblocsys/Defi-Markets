import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateFeesDto {
  @ApiProperty({
    description: 'Solana transaction signature/hash containing FactoryFeesUpdated event',
    example: '41xUTMn2bLsd2VKDZnkyXerFP8CWSBcEqZGW1eeudbLxxDYquFWcRx7E2UHEa45Rr1dnPi4QLFfNxzsBMEAmm4Tr'
  })
  @IsString()
  @IsNotEmpty()
  transactionSignature: string;
}
