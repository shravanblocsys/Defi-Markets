import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HttpModule } from "@nestjs/axios";
import { VaultInsightsService } from "./vault-insights.service";
import { VaultInsightsController } from "./vault-insights.controller";
import { VaultFactoryModule } from "../vault-factory/vault-factory.module";
import { VaultDepositModule } from "../vault-deposit/vault-deposit.module";
import { FeesManagementModule } from "../fees-management/fees-management.module";
import { HistoryModule } from "../history/history.module";
import { AssetAllocationModule } from "../asset-allocation/asset-allocation.module";
import { PaginationHelper } from "../../middlewares/pagination/paginationHelper";
import {
  VaultFactory,
  VaultFactorySchema,
} from "../vault-factory/entities/vault-factory.entity";
import { RedisModule } from "../../utils/redis";
import { ConfigModule } from "../config/config.module";
import { ChartsModule } from "../charts/charts.module";
import { TokenMappingService } from "./token-mapping.service";
import { DashboardModule } from "../dashboard/dashboard.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VaultFactory.name, schema: VaultFactorySchema },
    ]),
    HttpModule,
    VaultFactoryModule,
    VaultDepositModule,
    FeesManagementModule,
    HistoryModule,
    AssetAllocationModule,
    RedisModule,
    ConfigModule,
    ChartsModule,
    forwardRef(() => DashboardModule),
  ],
  providers: [VaultInsightsService, PaginationHelper, TokenMappingService],
  controllers: [VaultInsightsController],
})
export class VaultInsightsModule {}
