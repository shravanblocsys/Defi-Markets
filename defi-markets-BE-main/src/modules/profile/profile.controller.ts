import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Req,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ACGuard, UseRoles } from "nest-access-control";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ProfileService, IGenericMessageBody } from "./profile.service";
import { PatchProfilePayload } from "./payload/patch.profile.payload";
import { IProfile } from "./profile.model";
import { AuthenticatedRequest } from "../../utils/utils";
import { RedisService } from "../../utils/redis/redis.service";

/**
 * Profile Controller
 */
@ApiBearerAuth()
@ApiTags("profile")
@Controller("api/v1/profile")
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);
  /**
   * Constructor
   * @param profileService
   */
  constructor(
    private readonly profileService: ProfileService,
    private readonly redisService: RedisService
  ) {}

  /**
   * Retrieves a particular profile
   * @param username the profile given username to fetch
   * @returns {Promise<IProfile>} queried profile data
   */
  @Get(":username")
  @ApiResponse({ status: 200, description: "Fetch Profile Request Received" })
  @ApiResponse({ status: 400, description: "Fetch Profile Request Failed" })
  async getProfile(
    @Param("username") username: string
  ): Promise<{ user: any }> {
    const profile = await this.profileService.getByUsername(username);
    if (!profile) {
      throw new BadRequestException(
        "The profile with that username could not be found."
      );
    }
    return profile;
  }

  /**
   * Edit a profile
   * @param {PatchProfilePayload} payload
   * @param {AuthenticatedRequest} request
   * @returns {Promise<IProfile>} mutated profile data
   */
  @Put()
  @UseRoles({
    resource: "profiles",
    action: "update",
    possession: "own",
  })
  async updateProfile(
    @Body() payload: PatchProfilePayload,
    @Req() request: AuthenticatedRequest
  ): Promise<IProfile> {
    if (!request.raw.user || !request.raw.user._id) {
      throw new BadRequestException(
        "Authentication required: User not found in request"
      );
    }

    const result = await this.profileService.editById(
      request.raw.user._id,
      payload
    );
    await this.clearVaultCache();
    return result;
  }
  /**
   * Removes a profile from the database
   * @param {string} id the id to remove
   * @returns {Promise<IGenericMessageBody>} whether or not the profile has been deleted
   */
  @Delete(":id")
  @UseGuards(AuthGuard("jwt"))
  @ApiResponse({ status: 200, description: "Delete Profile Request Received" })
  @ApiResponse({ status: 400, description: "Delete Profile Request Failed" })
  async delete(@Param("id") id: string): Promise<IGenericMessageBody> {
    return await this.profileService.deleteById(id);
  }

  /**
   * Clear all vault-related cache entries
   */
  private async clearVaultCache(): Promise<void> {
    try {
      const keys = await this.redisService.keys("vaults:*");
      if (keys.length > 0) {
        for (const key of keys) {
          await this.redisService.delDirect(key);
        }
      }
    } catch (error) {
      this.logger.error("❌ Error clearing vault cache:", error);
    }
  }
}
