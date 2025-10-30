import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ChartsService } from "../charts/charts.service";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";

@Injectable()
export class SharePriceCronService {
  private readonly logger = new Logger(SharePriceCronService.name);

  constructor(
    private readonly chartsService: ChartsService,
    private readonly vaultFactoryService: VaultFactoryService
  ) {}

  /**
   * Cron job to fetch and store share prices every 6 hours
   * This provides a good balance between data freshness and resource usage
   */
  @Cron("0 0 */6 * * *") // Every 6 hours
  async fetchAndStoreSharePrices() {
    this.logger.log("🚀 Starting share price fetch cron job...");

    try {
      // Get all vaults and filter for active ones
      const allVaults = await this.vaultFactoryService.findAll();
      const vaults = allVaults.filter((vault) => vault.status === "active");

      if (!vaults || vaults.length === 0) {
        this.logger.warn("No active vaults found for share price fetching");
        return;
      }

      this.logger.log(
        `📊 Found ${vaults.length} active vaults, fetching share prices...`
      );

      const results = await Promise.allSettled(
        vaults.map(async (vault) => {
          try {
            // Get current share price data
            const sharePriceData = await this.chartsService.getVaultSharePrice(
              vault._id.toString()
            );

            if (sharePriceData) {
              // Store in database
              await this.chartsService.storeSharePriceHistory(sharePriceData);
              this.logger.log(
                `✅ Stored share price for vault ${vault.vaultName}: ${sharePriceData.sharePrice}`
              );
              return {
                vaultId: vault._id.toString(),
                success: true,
                sharePrice: sharePriceData.sharePrice,
              };
            } else {
              this.logger.warn(
                `⚠️ No share price data available for vault ${vault.vaultName}`
              );
              return {
                vaultId: vault._id.toString(),
                success: false,
                error: "No data",
              };
            }
          } catch (error) {
            this.logger.error(
              `❌ Error fetching share price for vault ${vault.vaultName}:`,
              error
            );
            return {
              vaultId: vault._id.toString(),
              success: false,
              error: error.message,
            };
          }
        })
      );

      // Log results summary
      const successful = results.filter(
        (r) => r.status === "fulfilled" && r.value.success
      ).length;
      const failed = results.length - successful;

      this.logger.log(
        `📈 Share price fetch completed: ${successful} successful, ${failed} failed`
      );

      // Log any failures
      results.forEach((result, index) => {
        if (
          result.status === "rejected" ||
          (result.status === "fulfilled" && !result.value.success)
        ) {
          this.logger.warn(
            `Failed vault ${index + 1}: ${
              result.status === "rejected" ? result.reason : result.value.error
            }`
          );
        }
      });
    } catch (error) {
      this.logger.error("❌ Error in share price fetch cron job:", error);
    }
  }

  /**
   * Manual trigger for testing - can be called via API
   */
  async triggerSharePriceFetch(): Promise<{ message: string; results: any[] }> {
    this.logger.log("🔧 Manual trigger for share price fetch...");

    try {
      const allVaults = await this.vaultFactoryService.findAll();
      const vaults = allVaults.filter((vault) => vault.status === "active");

      if (!vaults || vaults.length === 0) {
        return { message: "No active vaults found", results: [] };
      }

      const results = await Promise.allSettled(
        vaults.map(async (vault) => {
          try {
            const sharePriceData = await this.chartsService.getVaultSharePrice(
              vault._id.toString()
            );

            if (sharePriceData) {
              await this.chartsService.storeSharePriceHistory(sharePriceData);
              return {
                vaultId: vault._id.toString(),
                vaultName: vault.vaultName,
                success: true,
                sharePrice: sharePriceData.sharePrice,
              };
            } else {
              return {
                vaultId: vault._id.toString(),
                vaultName: vault.vaultName,
                success: false,
                error: "No data",
              };
            }
          } catch (error) {
            return {
              vaultId: vault._id.toString(),
              vaultName: vault.vaultName,
              success: false,
              error: error.message,
            };
          }
        })
      );

      const processedResults = results.map((result, index) => ({
        vaultName: vaults[index].vaultName,
        ...(result.status === "fulfilled"
          ? result.value
          : { success: false, error: result.reason }),
      }));

      return {
        message: `Processed ${vaults.length} vaults`,
        results: processedResults,
      };
    } catch (error) {
      this.logger.error("❌ Error in manual share price fetch:", error);
      throw error;
    }
  }
}
