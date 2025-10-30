import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeesManagementService } from './fees-management.service';
import { FeesManagementController } from './fees-management.controller';
import { FeesManagement, FeesManagementSchema } from './entities/fees-management.entity';
import { HistoryModule } from '../history/history.module';
import { ProfileModule } from '../profile/profile.module';
import { RedisModule } from '../../utils/redis/redis.module';
import { CacheUtilsModule } from '../../utils/cache/cache-utils.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FeesManagement.name, schema: FeesManagementSchema }]),
    ProfileModule,
    RedisModule,
    HistoryModule,
    CacheUtilsModule
  ],
  controllers: [FeesManagementController],
  providers: [FeesManagementService],
  exports: [FeesManagementService]
})
export class FeesManagementModule {}
