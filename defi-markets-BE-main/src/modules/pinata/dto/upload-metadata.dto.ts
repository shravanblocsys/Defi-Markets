import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  ValidateNested,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UnderlyingAssetDto {
  @ApiProperty({
    description: "Token mint address",
    example: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  })
  @IsString()
  mintAddress: string;

  @ApiProperty({
    description: "Allocation in basis points (e.g., 3333 = 33.33%)",
    example: 3333,
  })
  @IsNumber()
  @Min(0)
  mintBps: number;
}

export class UploadMetadataDto {
  @ApiProperty({
    description: "Vault name",
    example: "Solana Ecosystem Index",
  })
  @IsString()
  vaultName: string;

  @ApiProperty({
    description: "Vault symbol",
    example: "SEI-ETF",
  })
  @IsString()
  vaultSymbol: string;

  @ApiProperty({
    description: "Logo URL (gateway URL from image upload)",
    example: "https://red-late-constrictor-193.mypinata.cloud/ipfs/Qm...",
  })
  @IsString()
  logoUrl: string;

  @ApiProperty({
    description: "Management fees in basis points (e.g., 200 = 2%)",
    example: 200,
  })
  @IsNumber()
  @Min(0)
  managementFees: number;

  @ApiProperty({
    description: "Array of underlying assets",
    type: [UnderlyingAssetDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnderlyingAssetDto)
  underlyingAssets: UnderlyingAssetDto[];

  @ApiPropertyOptional({
    description: "Vault mint address (optional, for complete metadata)",
    example: "AqpkHvXSaNhKjTZRFfakeAQHUbvm1wWW7VitZkYswabY",
  })
  @IsOptional()
  @IsString()
  vaultMintAddress?: string;
}
