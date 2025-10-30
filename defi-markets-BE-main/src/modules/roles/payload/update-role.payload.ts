import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsOptional, IsBoolean } from "class-validator";

/**
 * Update Role Payload Class
 */
export class UpdateRolePayload {
  /**
   * Role name field
   */
  @ApiProperty({
    required: false,
    description: "Role name (will be converted to uppercase)",
    example: "USER"
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  /**
   * Role description field
   */
  @ApiProperty({
    required: false,
    description: "Role description",
    example: "Standard user role with basic permissions"
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  /**
   * Role active status field
   */
  @ApiProperty({
    required: false,
    description: "Whether the role is active",
    example: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
