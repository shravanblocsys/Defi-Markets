import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateVaultRedeemDto {
  @ApiProperty({
    description:
      "Solana transaction signature/hash containing VaultRedeemed event",
    example:
      "5JYQDd2+iHbXyz7rwUnEoUZ40JvWFSNpbs/DnIY+76uqReD3hhqPihDECF12H+BePw9rjANvR19yANjqxmkoAypo7AAAAAKAlJgAAAAAAAC0xAQAAAABgd0M6AAAAANjjy2gAAAAA",
  })
  @IsString()
  @IsNotEmpty()
  transactionSignature: string;

  @ApiProperty({
    description:
      "Optional vault address hint to associate the redeem with a vault",
    required: false,
  })
  @IsOptional()
  @IsString()
  vaultAddress?: string;

  @ApiProperty({
    description: "Optional vault index hint to aid log association",
    required: false,
  })
  @IsOptional()
  @IsInt()
  vaultIndex?: number;

  @ApiProperty({
    description: "Array of swap transaction signatures related to this redeem",
    example: ["signature1", "signature2", "signature3"],
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  signatureArray?: string[];
}
