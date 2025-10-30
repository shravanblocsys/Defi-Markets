import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsNotEmpty, Min, Max } from 'class-validator';

export class UpdateManagementFeeDto {
  @ApiProperty({
    description: 'Management fee in basis points (0-10000)',
    example: 150,
    minimum: 0,
    maximum: 10000
  })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  @Max(10000)
  managementFeeBps: number;
}
