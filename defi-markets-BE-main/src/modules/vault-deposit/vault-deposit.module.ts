import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { VaultDepositService } from "./vault-deposit.service";
import { VaultDepositController } from "./vault-deposit.controller";
import {
  VaultDeposit,
  VaultDepositSchema,
  DepositTransaction,
  DepositTransactionSchema,
  RedeemTransaction,
  RedeemTransactionSchema,
  EmergencyWithdrawTransaction,
  EmergencyWithdrawTransactionSchema,
  VaultClosureTransaction,
  VaultClosureTransactionSchema,
} from "./entities/vault-deposit.entity";
import { RedisModule } from "../../utils/redis";
import { ProfileModule } from "../profile/profile.module";
import { VaultFactoryModule } from "../vault-factory/vault-factory.module";
import { FeesManagementModule } from "../fees-management/fees-management.module";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VaultDeposit.name, schema: VaultDepositSchema },
      { name: DepositTransaction.name, schema: DepositTransactionSchema },
      { name: RedeemTransaction.name, schema: RedeemTransactionSchema },
      {
        name: EmergencyWithdrawTransaction.name,
        schema: EmergencyWithdrawTransactionSchema,
      },
      {
        name: VaultClosureTransaction.name,
        schema: VaultClosureTransactionSchema,
      },
    ]),
    RedisModule,
    ProfileModule,
    forwardRef(() => VaultFactoryModule),
    FeesManagementModule,
    ConfigModule,
  ],
  controllers: [VaultDepositController],
  providers: [VaultDepositService],
  exports: [VaultDepositService],
})
export class VaultDepositModule {}
