import { IsString, IsNotEmpty, IsArray } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateVaultDepositDto {
  @ApiProperty({
    description:
      "Solana transaction signature/hash containing VaultDeposited event",
    example:
      "41xUTMn2bLsd2VKDZnkyXerFP8CWSBcEqZGW1eeudbLxxDYquFWcRx7E2UHEa45Rr1dnPi4QLFfNxzsBMEAmm4Tr",
  })
  @IsString()
  @IsNotEmpty()
  transactionSignature: string;

  @ApiProperty({
    description: "Array of swap transaction signatures related to this deposit",
    example: ["signature1", "signature2", "signature3"],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  signatureArray?: string[];
}
