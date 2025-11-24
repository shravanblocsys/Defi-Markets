import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { Role } from "./roles.model";
import { ProfileModule } from "../profile/profile.module";

/**
 * Roles Module
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Role", schema: Role },
    ]),
    forwardRef(() => ProfileModule),
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
