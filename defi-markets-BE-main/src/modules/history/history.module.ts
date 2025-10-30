import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HistoryService } from "./history.service";
import { HistoryController } from "./history.controller";
import { History, HistorySchema } from "./entities/history.entity";
import { PaginationHelper } from "../../middlewares/pagination/paginationHelper";
import { AuthModule } from "../auth/auth.module";
import { RolesModule } from "../roles/roles.module";
import { ConfigModule } from "../config/config.module";
import { ProfileModule } from "../profile/profile.module";
import { RedisModule } from "../../utils/redis";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: History.name, schema: HistorySchema }]),
    AuthModule,
    ProfileModule,
    RolesModule,
    ConfigModule,
    RedisModule,
  ],
  controllers: [HistoryController],
  providers: [HistoryService, PaginationHelper],
  exports: [HistoryService], // Export the service so it can be used by other modules
})
export class HistoryModule {}
