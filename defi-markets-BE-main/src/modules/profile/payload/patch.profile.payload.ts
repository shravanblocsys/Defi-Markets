import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsAlphanumeric,
  Matches,
  IsOptional,
  IsArray,
  ValidateNested,
  IsObject,
  IsString,
  IsBoolean,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Patch Profile Payload Class
 */
export class PatchProfilePayload {
  /**
   * Email field
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((o) => o.email && o.email.trim() !== "")
  @IsEmail({}, { message: "Please provide a valid email address" })
  email?: string;

  /**
   * Username field
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsAlphanumeric()
  username?: string;

  /**
   * Name field
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^[a-zA-Z ]+$/)
  name?: string;

  /**
   * Password field
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @MinLength(8)
  password?: string;

  /**
   * Social links field - array of objects with key-value pairs
   */
  @ApiProperty({
    required: false,
    description: "Array of social links with key-value pairs",
    example: [
      {
        twitter: "https://twitter.com/username",
        github: "https://github.com/username",
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  socialLinks?: { [key: string]: string }[];

  /**
   * Twitter username field
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  twitter_username?: string;

  /**
   * Twitter connection status field
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isTwitterConnected?: boolean;

  /**
   * Avatar field
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatar?: string;
}
