import * as winston from "winston";
import * as rotateFile from "winston-daily-rotate-file";
import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { MongooseModule, MongooseModuleAsyncOptions } from "@nestjs/mongoose";
import { ConfigModule } from "../config/config.module";
import { ConfigService } from "../config/config.service";
import { AuthModule } from "../auth/auth.module";
import { ProfileModule } from "../profile/profile.module";
import { RolesModule } from "../roles/roles.module";
import { SiwxModule } from "../siwx/siwx.module";
import { AuthMiddleware } from "../../middlewares/auth/authMiddleware";
import { HeliusStreamModule } from "../helius-stream/helius-stream.module";
import { ResponseMiddleware } from "../../middlewares/response/responseMiddleware";
import { WinstonModule } from "../winston/winston.module";
import { AccessControlModule } from "nest-access-control";
import { VaultFactoryModule } from "../vault-factory/vault-factory.module";
import { VaultDepositModule } from "../vault-deposit/vault-deposit.module";
import { RedisModule } from "../../utils/redis";
import { roles } from "./app.roles";
import { DashboardModule } from "../dashboard/dashboard.module";
import { WalletModule } from "../wallet/wallet.module";
import { WalletRolesModule } from "../wallet-roles/wallet-roles.module";
import { FeesManagementModule } from "../fees-management/fees-management.module";
import { TxEventManagementModule } from "../tx-event-management/tx-event-management.module";
import { AssetAllocationModule } from "../asset-allocation/asset-allocation.module";
import { SolanaTokenModule } from "../solana-token/solana-token.module";
import { S3BucketModule } from "../s3-bucket/s3-bucket.module";
import { SeedersModule } from "../seeders/seeders.module";
import { ChartsModule } from "../charts/charts.module";
import { VaultInsightsModule } from "../vault-insights/vault-insights.module";
import { CronJobModule } from "../cron-job/cron-job.module";
import { VaultManagementFeesModule } from "../vault-management-fees/vault-management-fees.module";
import { SharePriceCronModule } from "../share-price-cron/share-price-cron.module";

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        ({
          uri: configService.get("DB_URL"),
          useNewUrlParser: true,
          useUnifiedTopology: true,
        } as MongooseModuleAsyncOptions),
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isDev = configService.isEnv("dev");

        return {
          level: isDev ? "debug" : "info",
          format: winston.format.combine(
            winston.format.timestamp({
              format: "YYYY-MM-DD HH:mm:ss",
            }),
            winston.format.errors({ stack: true }),
            winston.format.json(),
            winston.format.prettyPrint()
          ),
          defaultMeta: {
            service: "defi-markets-api",
            environment: configService.get("NODE_ENV") || "development",
          },
          transports: [
            // Error log file - all environments
            new winston.transports.File({
              filename: "logs/error.log",
              level: "error",
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
              ),
            }),

            // Combined log file - all environments
            new winston.transports.File({
              filename: "logs/combined.log",
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
              ),
            }),

            // Daily rotate file for application logs
            new rotateFile({
              filename: "logs/application-%DATE%.log",
              datePattern: "YYYY-MM-DD",
              zippedArchive: true,
              maxSize: "20m",
              maxFiles: "14d",
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
              ),
            }),

            // Daily rotate file for error logs
            new rotateFile({
              filename: "logs/error-%DATE%.log",
              datePattern: "YYYY-MM-DD",
              zippedArchive: true,
              maxSize: "20m",
              maxFiles: "30d",
              level: "error",
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
              ),
            }),
          ],
        };
      },
    }),
    AccessControlModule.forRoles(roles),
    ConfigModule,
    AuthModule,
    ProfileModule,
    RolesModule,
    SiwxModule,
    HeliusStreamModule,
    VaultFactoryModule,
    VaultDepositModule,
    RedisModule,
    DashboardModule,
    WalletModule,
    WalletRolesModule,
    FeesManagementModule,
    TxEventManagementModule,
    AssetAllocationModule,
    SolanaTokenModule,
    S3BucketModule,
    SeedersModule,
    VaultInsightsModule,
    CronJobModule,
    ChartsModule,
    VaultManagementFeesModule,
    SharePriceCronModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: ResponseMiddleware },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        // Login/Register
        "api/v1/auth/login",
        "api/v1/auth/register",
        "api/v1/auth/admin/login",
        // Twitter OAuth
        "api/v1/auth/twitter",
        "api/v1/auth/twitter/callback",
        "api/v1/dashboard/dashboard-statistics",
        "api/v1/dashboard/vault-stats",
        // SIWX public endpoints only
        "api/v1/user/create-nonce",
        "api/v1/user/create-message",
        "api/v1/user/verify",
        "api/v1/user/verify-payload",
        "api/v1/vault-insights/user",
        "api/v1/vaults/:id",
        "api/v1/vault-insights/:id",
        "api/v1/vault-insights/featured/list",
        "api/v1/seeders",
        "api/v1/seeders/status",
        "api/v1/seeders/clear",
        // Health and docs
        "api/health",
        "api/docs",
        // Regex pattern for all docs paths - already handles "api/docs/(.*)"
        //helius webhook
        "helius-stream/webhook",
        "api/v1/vault-insights/:id",
        "api/v1/vault-insights/portfolio/:id",
        "api/v1/vault-insights/fees/:id",
        "api/v1/vault-insights/user-holdings/:id",
        "api/v1/vault-insights/history/:id",
        // Cron job endpoints
        "api/v1/cron-job/trigger-price-fetch",
        "api/v1/cron-job/token-price-history/*",
        "api/v1/cron-job/vault-tvl-history/*",
        // Charts public endpoints
        "api/v1/charts/vaults/line",
        "api/v1/charts/all",
        "api/v1/charts/vault/:id/share-price",
        "api/v1/charts/vault/:id/share-price/history",
        "api/v1/charts/vault/:id/share-price/chart",
        "api/v1/charts/vault/:id/share-price/chart/all",
        // Share price cron endpoints
        "api/v1/share-price-cron/trigger",
        "api/v1/share-price-cron/status",
        //Vault Management Fees
        "api/v1/vault-management-fees/vault-summary",
        "api/v1/charts/vaults/total-usd",
      )
      .forRoutes("*");
  }
}
