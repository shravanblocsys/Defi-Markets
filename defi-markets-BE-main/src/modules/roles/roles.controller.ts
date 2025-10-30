import { 
  Controller, 
  Body, 
  Post, 
  Get, 
  Put, 
  Delete, 
  Param, 
  HttpCode, 
  HttpStatus 
} from "@nestjs/common";
import { ApiResponse, ApiTags, ApiParam } from "@nestjs/swagger";
import { RolesService, IGenericMessageBody } from "./roles.service";
import { CreateRolePayload } from "./payload/create-role.payload";
import { UpdateRolePayload } from "./payload/update-role.payload";
import { IRole } from "./roles.model";

/**
 * Roles Controller
 */
@Controller("api/v1/roles")
@ApiTags("roles")
export class RolesController {
  /**
   * Constructor
   * @param {RolesService} rolesService roles service
   */
  constructor(private readonly rolesService: RolesService) {}
}
