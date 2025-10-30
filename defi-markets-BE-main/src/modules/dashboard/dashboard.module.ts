import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { VaultFactoryModule } from '../vault-factory/vault-factory.module';
import { VaultDepositModule } from '../vault-deposit/vault-deposit.module';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { RolesModule } from '../roles/roles.module';
import { ConfigModule } from '../config/config.module';
import { RedisModule } from '../../utils/redis';

@Module({
  imports: [
    VaultFactoryModule,
    VaultDepositModule,
    AuthModule,
    ProfileModule,
    RolesModule,
    ConfigModule,
    RedisModule
  ],
  providers: [DashboardService],
  controllers: [DashboardController]
})
export class DashboardModule {}
