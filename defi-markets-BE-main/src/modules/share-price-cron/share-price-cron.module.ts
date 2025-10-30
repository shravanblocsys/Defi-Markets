import { Module, forwardRef } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { SharePriceCronService } from "./share-price-cron.service";
import { SharePriceCronController } from "./share-price-cron.controller";
import { ChartsModule } from "../charts/charts.module";
import { VaultFactoryModule } from "../vault-factory/vault-factory.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    forwardRef(() => ChartsModule),
    forwardRef(() => VaultFactoryModule),
  ],
  providers: [SharePriceCronService],
  controllers: [SharePriceCronController],
  exports: [SharePriceCronService],
})
export class SharePriceCronModule {}
