import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SIWXCreateNonceDto {
  @ApiProperty({ description: 'Wallet address' })
  @IsString()
  @IsNotEmpty()
  address: string;
}

export class SIWXMessageDto {
  @ApiProperty({ description: 'Domain of the application' })
  @IsString()
  @IsNotEmpty()
  domain: string;

  @ApiProperty({ description: 'Wallet address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ description: 'Statement to be signed' })
  @IsString()
  @IsNotEmpty()
  statement: string;

  @ApiProperty({ description: 'URI of the application' })
  @IsString()
  @IsNotEmpty()
  uri: string;

  @ApiProperty({ description: 'Version of the SIWX message' })
  @IsString()
  @IsNotEmpty()
  version: string;

  @ApiProperty({ description: 'Chain ID' })
  @IsString()
  @IsNotEmpty()
  chainId: string;

  @ApiProperty({ description: 'Nonce for uniqueness' })
  @IsString()
  @IsNotEmpty()
  nonce: string;

  @ApiProperty({ description: 'Issued at timestamp' })
  @IsString()
  @IsNotEmpty()
  issuedAt: string;

  @ApiProperty({ description: 'Expiration time', required: false })
  @IsOptional()
  @IsString()
  expirationTime?: string;

  @ApiProperty({ description: 'Not before timestamp', required: false })
  @IsOptional()
  @IsString()
  notBefore?: string;

  @ApiProperty({ description: 'Request ID', required: false })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiProperty({ description: 'Resources', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  resources?: string[];
}



export class SIWXSignatureOnlyVerificationDto {
  @ApiProperty({ description: 'Signature of the message' })
  @IsString()
  @IsNotEmpty()
  signature: string;
}

export class SIWXVerificationDto {
  @ApiProperty({ description: 'SIWX message payload' })
  @ValidateNested()
  @Type(() => SIWXMessageDto)
  message: SIWXMessageDto;

  @ApiProperty({ description: 'Signature of the message' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ description: 'CAIP network id, e.g., eip155:1 or solana:mainnet' })
  @IsString()
  @IsNotEmpty()
  chainId: string;
}

export class SIWXSessionQueryDto {
  @ApiProperty({ description: 'Chain ID' })
  @IsString()
  @IsNotEmpty()
  chainId: string;

  @ApiProperty({ description: 'Wallet address' })
  @IsString()
  @IsNotEmpty()
  address: string;
}

export class SIWXRevokeQueryDto {
  @ApiProperty({ description: 'Chain ID' })
  @IsString()
  @IsNotEmpty()
  chainId: string;

  @ApiProperty({ description: 'Wallet address' })
  @IsString()
  @IsNotEmpty()
  address: string;
}
