import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsAlphanumeric,
  Matches,
  IsMongoId,
  IsString,
} from "class-validator";

/**
 * Register Payload Class
 */
export class RegisterPayload {
  /**
   * Email field
   */
  @ApiProperty({
    required: true,
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  /**
   * Username field
   */
  @ApiProperty({
    required: true,
  })
  @IsAlphanumeric()
  @IsNotEmpty()
  username: string;

  /**
   * Name field
   */
  @ApiProperty({
    required: true,
  })
  @Matches(/^[a-zA-Z ]+$/)
  @IsNotEmpty()
  name: string;

  /**
   * Password field
   */
  @ApiProperty({
    required: true,
  })
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  /**
   * Role ID field
   */
  @ApiProperty({
    required: true,
    description: "Role ID (MongoDB ObjectId)",
    example: "507f1f77bcf86cd799439011"
  })
  @IsMongoId()
  @IsNotEmpty()
  roleId: string;

  /**
   * Wallet address field
   */
  @ApiProperty({
    required: true,
    description: "User's wallet address",
    example: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
  })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}
