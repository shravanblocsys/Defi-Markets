import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsString, Min } from "class-validator";

export class SwapDto {
  @ApiProperty({ description: "Vault index (u32)", example: 0 })
  @IsInt()
  @Min(0)
  vaultIndex: number;

  @ApiProperty({ description: "Amount in raw units (u64 as string)", example: "1000000" })
  @IsString()
  @IsNotEmpty()
  amountInRaw: string;
}


