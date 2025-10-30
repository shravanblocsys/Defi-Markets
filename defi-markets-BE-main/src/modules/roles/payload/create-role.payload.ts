import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsArray, IsOptional, IsBoolean } from "class-validator";

/**
 * Create Role Payload Class
 */
export class CreateRolePayload {
  /**
   * Role name field
   */
  @ApiProperty({
    required: true,
    description: "Role name (will be converted to uppercase)",
    example: "USER"
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  /**
   * Role description field
   */
  @ApiProperty({
    required: true,
    description: "Role description",
    example: "Standard user role with basic permissions"
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  /**
   * Role active status field
   */
  @ApiProperty({
    required: false,
    description: "Whether the role is active",
    example: true,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
