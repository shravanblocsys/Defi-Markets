import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AssetAllocationService } from "./asset-allocation.service";
import { AssetAllocationController } from "./asset-allocation.controller";
import {
  AssetAllocation,
  AssetAllocationSchema,
} from "./entities/asset-allocation.entity";
import { PaginationHelper } from "../../middlewares/pagination/paginationHelper";
import { AuthModule } from "../auth/auth.module";
import { ProfileModule } from "../profile/profile.module";
import { RolesModule } from "../roles/roles.module";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AssetAllocation.name, schema: AssetAllocationSchema },
    ]),
    AuthModule,
    ProfileModule,
    RolesModule,
    ConfigModule,
  ],
  controllers: [AssetAllocationController],
  providers: [AssetAllocationService, PaginationHelper],
  exports: [AssetAllocationService],
})
export class AssetAllocationModule {}
