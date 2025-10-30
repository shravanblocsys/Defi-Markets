import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VaultManagementFeesService } from './vault-management-fees.service';
import { VaultManagementFeesController } from './vault-management-fees.controller';
import { VaultFeesCalculationService } from './vault-fees-calculation.service';
import { VaultManagementFee, VaultManagementFeeSchema } from './entities/vault-management-fee.entity';
import { ConfigModule } from '../config/config.module';
import { VaultFactoryModule } from '../vault-factory/vault-factory.module';
import { PaginationHelper } from '../../middlewares/pagination/paginationHelper';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VaultManagementFee.name, schema: VaultManagementFeeSchema }
    ]),
    ConfigModule,
    VaultFactoryModule,
  ],
  controllers: [VaultManagementFeesController],
  providers: [VaultManagementFeesService, VaultFeesCalculationService, PaginationHelper],
  exports: [VaultManagementFeesService, VaultFeesCalculationService], // Export services for use in other modules
})
export class VaultManagementFeesModule {}
