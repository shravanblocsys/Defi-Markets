import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { Role } from "./roles.model";

/**
 * Roles Module
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Role", schema: Role },
    ]),
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
