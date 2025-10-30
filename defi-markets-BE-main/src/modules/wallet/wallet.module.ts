import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './entities/wallet.entity';
import { WalletRole, WalletRoleSchema } from '../wallet-roles/entities/wallet-role.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { RedisModule } from '../../utils/redis/redis.module';
import { HistoryModule } from '../history/history.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: WalletRole.name, schema: WalletRoleSchema }
    ]),
    RedisModule,
    HistoryModule
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService]
})
export class WalletModule {}
