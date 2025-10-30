import { Module } from '@nestjs/common';
import { TxEventManagementService } from './tx-event-management.service';
import { TxEventManagementController } from './tx-event-management.controller';
import { VaultFactoryModule } from '../vault-factory/vault-factory.module';
import { ConfigModule } from '../config/config.module';
import { FeesManagementModule } from '../fees-management/fees-management.module';
import { VaultDepositModule } from '../vault-deposit/vault-deposit.module';
import { HistoryModule } from '../history/history.module';
import { RedisModule } from '../../utils/redis';

@Module({
  imports: [
    VaultFactoryModule, 
    ConfigModule, 
    FeesManagementModule,
    VaultDepositModule,
    HistoryModule,
    RedisModule
  ],
  providers: [TxEventManagementService],
  controllers: [TxEventManagementController],
  exports: [TxEventManagementService]
})
export class TxEventManagementModule {}
