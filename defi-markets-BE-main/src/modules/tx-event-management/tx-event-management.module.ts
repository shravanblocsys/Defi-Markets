import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TxEventManagementService } from "./tx-event-management.service";
import { TxEventManagementController } from "./tx-event-management.controller";
import { VaultFactoryModule } from "../vault-factory/vault-factory.module";
import { ConfigModule } from "../config/config.module";
import { FeesManagementModule } from "../fees-management/fees-management.module";
import { VaultDepositModule } from "../vault-deposit/vault-deposit.module";
import { HistoryModule } from "../history/history.module";
import { AssetAllocationModule } from "../asset-allocation/asset-allocation.module";
import { RedisModule } from "../../utils/redis";
import {
  FailedTransaction,
  FailedTransactionSchema,
} from "./entities/failed-transaction.entity";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FailedTransaction.name, schema: FailedTransactionSchema },
    ]),
    VaultFactoryModule,
    ConfigModule,
    FeesManagementModule,
    VaultDepositModule,
    HistoryModule,
    AssetAllocationModule,
    RedisModule,
  ],
  providers: [TxEventManagementService],
  controllers: [TxEventManagementController],
  exports: [TxEventManagementService],
})
export class TxEventManagementModule {}
