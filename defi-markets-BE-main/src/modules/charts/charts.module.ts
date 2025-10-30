import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ChartsService } from "./charts.service";
import { ChartsController } from "./charts.controller";
import {
  TokenPrice,
  TokenPriceSchema,
} from "../cron-job/entities/token-price.entity";
import {
  SharePriceHistory,
  SharePriceHistorySchema,
} from "../../schemas/share-price-history.schema";
import { VaultFactoryModule } from "../vault-factory/vault-factory.module";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TokenPrice.name, schema: TokenPriceSchema },
      { name: SharePriceHistory.name, schema: SharePriceHistorySchema },
    ]),
    forwardRef(() => VaultFactoryModule),
    ConfigModule,
  ],
  providers: [ChartsService],
  controllers: [ChartsController],
  exports: [ChartsService],
})
export class ChartsModule {}
