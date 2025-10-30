import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { VaultFactoryService } from "./vault-factory.service";
import { VaultFactoryController } from "./vault-factory.controller";
import {
  VaultFactory,
  VaultFactorySchema,
} from "./entities/vault-factory.entity";
import { ProfileModule } from "../profile/profile.module";
import { ConfigModule } from "../config/config.module";
import { TokenManagementService } from "./token-management.service";
import { PaginationHelper } from "../../middlewares/pagination/paginationHelper";
import { HistoryModule } from "../history/history.module";
import { RedisModule } from "../../utils/redis";
import { AssetAllocationModule } from "../asset-allocation/asset-allocation.module";
import { AuthModule } from "../auth/auth.module";
import { RolesModule } from "../roles/roles.module";
import { ChartsModule } from "../charts/charts.module";
import { VaultDepositModule } from "../vault-deposit/vault-deposit.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VaultFactory.name, schema: VaultFactorySchema },
    ]),
    ProfileModule,
    ConfigModule,
    AuthModule,
    RolesModule,
    RedisModule,
    HistoryModule,
    AssetAllocationModule,
    forwardRef(() => ChartsModule),
    forwardRef(() => VaultDepositModule),
  ],
  controllers: [VaultFactoryController],
  providers: [VaultFactoryService, TokenManagementService, PaginationHelper],
  exports: [VaultFactoryService],
})
export class VaultFactoryModule {}
