import { Controller, Post, Get } from "@nestjs/common";
import { SharePriceCronService } from "./share-price-cron.service";

@Controller("api/v1/share-price-cron")
export class SharePriceCronController {
  constructor(private readonly sharePriceCronService: SharePriceCronService) {}

  @Post("trigger")
  async triggerSharePriceFetch() {
    const result = await this.sharePriceCronService.triggerSharePriceFetch();
    return {
      status: "success",
      message: "Share price fetch triggered",
      data: result,
    };
  }

  @Get("status")
  async getStatus() {
    return {
      status: "success",
      message: "Share price cron service is running",
      data: {
        cronSchedule: "Every 6 hours",
        description: "Fetches and stores share prices for all active vaults",
        nextRun: "Runs at 00:00, 06:00, 12:00, and 18:00 UTC daily",
      },
    };
  }
}
