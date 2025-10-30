import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { ChartsService } from "./charts.service";

@Controller("api/v1/charts")
export class ChartsController {
  constructor(private readonly chartsService: ChartsService) {}

  @Get("vault/:id/line")
  async getVaultLine(
    @Param("id") id: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
    @Query("interval")
    interval: "minute" | "hour" | "day" | "week" = "day"
  ) {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;
    const { vaultName, series } = await this.chartsService.getVaultNavSeries(
      id,
      startDate,
      endDate,
      interval
    );
    return { vaultId: id, vaultName, interval, data: series };
  }

  @Get("vaults/line")
  async getVaultsLine(
    @Query("vaultIds") vaultIds: string,
    @Query("interval")
    interval: "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL" = "1W"
  ) {
    const data = await this.chartsService.getVaultsNavSeries(
      vaultIds,
      interval
    );
    return { interval, data };
  }

  @Get("all")
  async getAllPriceData() {
    const data = await this.chartsService.getAllPriceData();
    return data;
  }

  @Get("vault/:id/share-price")
  async getVaultSharePrice(@Param("id") id: string) {
    const data = await this.chartsService.getVaultSharePrice(id);
    if (!data) {
      throw new BadRequestException(
        `Vault with ID ${id} not found or no share price data available`
      );
    }
    return data;
  }

  @Get("vault/:id/share-price/history")
  async getVaultSharePriceHistory(
    @Param("id") id: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
    @Query("limit") limit?: string
  ) {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : 1000;

    const data = await this.chartsService.getVaultSharePriceHistory(
      id,
      startDate,
      endDate,
      limitNum
    );
    return { vaultId: id, data };
  }

  @Get("vault/:id/share-price/chart")
  async getVaultSharePriceChart(
    @Param("id") id: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
    @Query("interval") interval: "minute" | "hour" | "day" = "day"
  ) {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;

    const data = await this.chartsService.getVaultSharePriceChart(
      id,
      startDate,
      endDate,
      interval
    );
    return data;
  }

  @Get("vault/:id/share-price/chart/all")
  async getVaultSharePriceChartAll(@Param("id") id: string) {
    const data = await this.chartsService.getVaultSharePriceChartAll(id);
    return data;
  }

  // Returns vault-wise totalUsd values; processes sequentially (one by one)
  // When vaultIds is not provided, also returns featuredVaults array
  @Get("vaults/total-usd")
  async getVaultsTotalUsd(@Query("vaultIds") vaultIds?: string) {
    return await this.chartsService.getVaultsTotalUsdSequential(vaultIds);
  }
}
