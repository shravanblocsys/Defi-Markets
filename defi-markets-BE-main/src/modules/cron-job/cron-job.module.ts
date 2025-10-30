import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '../config/config.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CronJobService } from './cron-job.service';
import { TokenPrice, TokenPriceSchema } from './entities/token-price.entity';
import { AssetAllocationModule } from '../asset-allocation/asset-allocation.module';
import { VaultFactoryModule } from '../vault-factory/vault-factory.module';
import { VaultDepositModule } from '../vault-deposit/vault-deposit.module';
import { VaultManagementFeesModule } from '../vault-management-fees/vault-management-fees.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TokenPrice.name, schema: TokenPriceSchema }]),
    HttpModule,
    ConfigModule,
    ScheduleModule.forRoot(),
    AssetAllocationModule,
    VaultFactoryModule,
    VaultDepositModule,
    VaultManagementFeesModule,
  ],
  providers: [CronJobService],
  controllers: [],
  exports: [CronJobService]
})
export class CronJobModule {}
