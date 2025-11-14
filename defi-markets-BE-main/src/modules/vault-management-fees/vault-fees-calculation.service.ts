import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";
import { VaultManagementFeesService } from "./vault-management-fees.service";
import { FeeStatus } from "./entities/vault-management-fee.entity";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { VAULT_FACTORY_IDL } from "../../utils/idls/idls";
import fetch from "node-fetch";

@Injectable()
export class VaultFeesCalculationService {
  private readonly logger = new Logger(VaultFeesCalculationService.name);
  private connection: Connection;
  private program: anchor.Program;
  private isCalculating = false;

  // Jupiter Price API
  private readonly JUP_PRICE_API = "https://api.jup.ag/ultra/price/v3?ids=";
  private readonly JUPITER_API_KEY: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly vaultFactoryService: VaultFactoryService,
    private readonly vaultManagementFeesService: VaultManagementFeesService
  ) {
    this.JUPITER_API_KEY = this.configService.get("JUPITER_API_KEY");
    this.initializeSolanaConnection();
  }

  private initializeSolanaConnection(): void {
    // Prefer Helius RPC URL if available (better rate limits), otherwise use SOLANA_RPC_URL or default
    const heliusRpcUrl = this.configService.get("HELIUS_RPC_URL");
    const solanaRpcUrl = this.configService.get("SOLANA_RPC_URL");
    const rpcUrl =
      heliusRpcUrl || solanaRpcUrl || "https://api.mainnet-beta.solana.com";

    if (heliusRpcUrl) {
      this.logger.log(`Using Helius RPC URL: ${heliusRpcUrl}`);
    } else if (solanaRpcUrl) {
      this.logger.log(`Using Solana RPC URL: ${solanaRpcUrl}`);
    } else {
      this.logger.log(`Using default Solana RPC URL: ${rpcUrl}`);
    }

    this.connection = new Connection(rpcUrl, "confirmed");

    const factoryAddress = this.configService.get(
      "SOLANA_VAULT_FACTORY_ADDRESS"
    );
    if (!factoryAddress) {
      throw new Error(
        "SOLANA_VAULT_FACTORY_ADDRESS is required in environment variables"
      );
    }

    const programId = new PublicKey(factoryAddress);
    this.program = new anchor.Program(
      VAULT_FACTORY_IDL as anchor.Idl,
      new anchor.AnchorProvider(
        this.connection,
        new anchor.Wallet(anchor.web3.Keypair.generate()),
        { preflightCommitment: "processed" }
      )
    ) as anchor.Program;
  }

  /**
   * Gets token decimals dynamically from the blockchain contract.
   * This is critical for accurate financial calculations as incorrect decimals
   * can lead to 1000x discrepancies (e.g., SOL has 9 decimals, not 6).
   *
   * @param mintAddress - The token mint address
   * @returns Promise<number> - The number of decimals for the token
   * @throws Error if decimals cannot be determined (no hardcoded defaults)
   */
  private async getTokenDecimals(mintAddress: string): Promise<number> {
    try {
      const mintInfo = await this.connection.getParsedAccountInfo(
        new PublicKey(mintAddress)
      );
      if (mintInfo.value?.data && "parsed" in mintInfo.value.data) {
        const decimals = mintInfo.value.data.parsed.info.decimals;
        if (typeof decimals === "number" && decimals >= 0 && decimals <= 18) {
          return decimals;
        }
        throw new Error(`Invalid decimals value: ${decimals}`);
      }
      throw new Error(`No parsed data found for mint ${mintAddress}`);
    } catch (error) {
      this.logger.error(`Failed to get decimals for ${mintAddress}:`, error);
      throw new Error(
        `Cannot determine token decimals for ${mintAddress}. This is required for accurate calculations. Error: ${error.message}`
      );
    }
  }

  private pdaFactory(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      this.program.programId
    )[0];
  }

  private pdaVault(factory: PublicKey, index: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        factory.toBuffer(),
        new anchor.BN(index).toArrayLike(Buffer, "le", 4),
      ],
      this.program.programId
    )[0];
  }

  private pdaVaultStablecoin(vault: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vault.toBuffer()],
      this.program.programId
    )[0];
  }

  private async fetchJupiterPrices(
    mintAddresses: PublicKey[]
  ): Promise<Record<string, number>> {
    if (mintAddresses.length === 0) return {};

    const ids = mintAddresses.map((m) => m.toBase58()).join(",");
    const url = `${this.JUP_PRICE_API}${ids}`;

    this.logger.log(
      `🌐 Fetching live prices from Jupiter for ${mintAddresses.length} tokens...`
    );

    // Retry logic with exponential backoff for rate limiting
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount < maxRetries) {
      try {
        const headers: any = {};
        if (this.JUPITER_API_KEY) {
          this.logger.log("JUPITER_API_KEY", this.JUPITER_API_KEY);
          headers["x-api-key"] = this.JUPITER_API_KEY;
        }
        const response = await fetch(url, { headers });

        if (response.status === 429) {
          // Rate limited - wait and retry
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 seconds
          this.logger.log(
            `Jupiter API Server responded with 429 Too Many Requests. Retrying after ${delay}ms delay...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch prices: ${response.statusText}`);
        }

        const data = (await response.json()) as Record<
          string,
          { usdPrice: number }
        >;
        const priceMap: Record<string, number> = {};

        for (const [mint, info] of Object.entries(data)) {
          priceMap[mint] = info.usdPrice;
        }

        return priceMap;
      } catch (error) {
        if (retryCount === maxRetries - 1) {
          throw error;
        }

        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        this.logger.log(
          `Error fetching prices, retrying after ${delay}ms:`,
          error.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
      }
    }

    throw new Error("Max retries exceeded for Jupiter API");
  }

  async calculateVaultFees(vaultIndex: number): Promise<{
    vaultName: string;
    vaultSymbol: string;
    vaultIndex: number;
    etfCreatorFee: number;
    platformOwnerFee: number;
    todaysAum: number;
    nav: number;
    gav: number;
    accruedFees: number;
    metadata: any;
  }> {
    this.logger.log(`🔍 Calculating fees for Vault ${vaultIndex}...`);

    const factory = this.pdaFactory();
    const vault = this.pdaVault(factory, vaultIndex);
    const vaultStable = this.pdaVaultStablecoin(vault);

    try {
      // Get vault account from blockchain
      const vaultAccount = (await (this.program.account as any).vault.fetch(
        vault
      )) as any;

      // Get vault details from database
      const dbVault = await this.vaultFactoryService
        .findAll()
        .then((vaults) =>
          vaults.find((vault) => vault.vaultIndex === vaultIndex)
        );
      if (!dbVault) {
        throw new Error(`Vault with index ${vaultIndex} not found in database`);
      }

      const vaultName = dbVault.vaultName;
      const vaultSymbol = dbVault.vaultSymbol;

      // Contract data is already in correct decimal formats:
      // total_supply: u64 - 9-decimal format (like SOL tokens)
      // accrued_management_fees_usdc: u64 - 6-decimal USD format
      // Note: We don't use total_assets from contract, we calculate live GAV from raw balances
      const contractTotalSupply = Number(vaultAccount.totalSupply); // Already in 9-decimal format
      const contractAccruedFees = Number(
        vaultAccount.accruedManagementFeesUsdc || 0
      ); // Already in 6-decimal USD

      // Fetch live prices from Jupiter (include stablecoin mint if account exists)
      const underlyingAssets = vaultAccount.underlyingAssets;
      let allMintAddresses = [
        ...underlyingAssets.map((a: any) => a.mintAddress),
      ];

      try {
        const stableBalance = await getAccount(this.connection, vaultStable);
        allMintAddresses.push(stableBalance.mint);
      } catch (e) {
        this.logger.warn(
          `Stablecoin account not found for vault ${vaultIndex}, skipping stablecoin price fetch`
        );
      }

      const priceMap = await this.fetchJupiterPrices(allMintAddresses);

      // Calculate GAV using live prices (same logic as read_vault.ts)
      let liveGav = 0;

      // Add stablecoin balance (convert to USD value using live price)
      try {
        const stableBalance = await getAccount(this.connection, vaultStable);
        const stablecoinMint = stableBalance.mint.toBase58();
        const stablecoinDecimals = await this.getTokenDecimals(stablecoinMint);
        const stablecoinPrice = priceMap[stablecoinMint];

        if (!stablecoinPrice) {
          this.logger.warn(
            `No price available for stablecoin ${stablecoinMint}`
          );
        } else {
          // Convert raw balance to human-readable format, then to USD using live price
          const balanceInTokens =
            Number(stableBalance.amount) / Math.pow(10, stablecoinDecimals);
          const valueUsd = balanceInTokens * stablecoinPrice; // Use live USDC price from Jupiter
          liveGav += valueUsd; // Store in base10 format
          this.logger.log(
            `  Stablecoin ${stablecoinMint}: ${balanceInTokens.toFixed(
              6
            )} tokens (${stablecoinDecimals} decimals) = $${valueUsd.toFixed(
              6
            )}`
          );
        }
      } catch (e) {
        if (e.message.includes("Cannot determine token decimals")) {
          this.logger.error(`Critical error: ${e.message}`);
          throw e; // Re-throw critical errors that affect calculation accuracy
        }
        this.logger.warn(
          `Stablecoin balance not found for vault ${vaultIndex}: ${e.message}`
        );
      }

      // Add underlying asset values using live prices
      for (let i = 0; i < underlyingAssets.length; i++) {
        const asset = underlyingAssets[i];
        const mintAddress = asset.mintAddress.toBase58();
        const priceUsd = priceMap[mintAddress];

        if (!priceUsd) {
          this.logger.warn(`No price available for ${mintAddress}`);
          continue;
        }

        try {
          const tokenAccount = await getAssociatedTokenAddress(
            asset.mintAddress,
            vault,
            true,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

          const balance = await getAccount(this.connection, tokenAccount);
          const tokenDecimals = await this.getTokenDecimals(mintAddress);

          // Convert raw balance to human-readable format (same as read_vault.ts)
          const balanceInTokens =
            Number(balance.amount) / Math.pow(10, tokenDecimals);
          const valueUsd = balanceInTokens * priceUsd;
          liveGav += valueUsd; // Store in base10 format
          this.logger.log(
            `  Asset ${mintAddress}: ${balanceInTokens.toFixed(
              6
            )} tokens (${tokenDecimals} decimals) = $${valueUsd.toFixed(6)}`
          );
        } catch (e) {
          if (e.message.includes("Cannot determine token decimals")) {
            this.logger.error(
              `Critical error for asset ${mintAddress}: ${e.message}`
            );
            throw e; // Re-throw critical errors that affect calculation accuracy
          }
          this.logger.warn(
            `Token account not found for ${mintAddress} in vault ${vaultIndex}: ${e.message}`
          );
        }
      }

      // Calculate newly accrued fees (all in base10 USD format)
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const elapsedSeconds = Math.max(
        0,
        currentTimestamp - Number(vaultAccount.lastFeeAccrualTs)
      );
      const managementFeeBps = vaultAccount.managementFees;
      const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

      // Convert contract accrued fees from 6-decimal to base10 format
      const previouslyAccruedFees = contractAccruedFees / 1_000_000; // Convert from 6-decimal to base10

      // Calculate newly accrued fees in base10 format
      const newlyAccruedFees =
        (liveGav * managementFeeBps * elapsedSeconds) /
        (10_000 * SECONDS_PER_YEAR);
      const totalAccruedFees = previouslyAccruedFees + newlyAccruedFees;

      // Calculate NAV (all in base10 USD format)
      const liveNav = liveGav - totalAccruedFees;

      // Calculate fees (70% to vault admin, 30% to platform) - all in base10 USD format
      const etfCreatorFee = totalAccruedFees * 0.7; // 70%
      const platformOwnerFee = totalAccruedFees * 0.3; // 30%

      this.logger.log(`✅ Calculated fees for Vault ${vaultIndex}:`);
      this.logger.log(
        `  Contract Total Supply: ${(contractTotalSupply / 1e9).toFixed(
          9
        )} (9-decimal tokens)`
      );
      this.logger.log(
        `  Contract Accrued Fees: $${(contractAccruedFees / 1_000_000).toFixed(
          6
        )} (6-decimal USD)`
      );
      this.logger.log(
        `  Live GAV (from raw balances): $${liveGav.toFixed(6)} (base10 USD)`
      );
      this.logger.log(`  Live NAV: $${liveNav.toFixed(6)} (base10 USD)`);
      this.logger.log(
        `  ETF Creator Fee: $${etfCreatorFee.toFixed(6)} (base10 USD)`
      );
      this.logger.log(
        `  Platform Owner Fee: $${platformOwnerFee.toFixed(6)} (base10 USD)`
      );

      return {
        vaultName,
        vaultSymbol,
        vaultIndex,
        etfCreatorFee, // Now in base10 USD format
        platformOwnerFee, // Now in base10 USD format
        todaysAum: liveGav, // Now in base10 USD format
        nav: liveNav, // Now in base10 USD format
        gav: liveGav, // Now in base10 USD format
        accruedFees: totalAccruedFees, // Now in base10 USD format
        metadata: {
          contractTotalSupply, // 9-decimal token format
          contractAccruedFees, // 6-decimal USD format (from contract)
          managementFeeBps,
          elapsedSeconds,
          previouslyAccruedFees, // Now in base10 USD format
          newlyAccruedFees, // Now in base10 USD format
          underlyingAssets: underlyingAssets.map((a: any) => ({
            mintAddress: a.mintAddress.toBase58(),
            allocation: a.mintBps,
            price: priceMap[a.mintAddress.toBase58()] || 0,
          })),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error calculating fees for vault ${vaultIndex}:`,
        error
      );
      throw error;
    }
  }

  async calculateAllVaultFees(): Promise<void> {
    // Prevent concurrent executions
    if (this.isCalculating) {
      this.logger.log(
        "⏳ Vault fees calculation already in progress, skipping..."
      );
      return;
    }

    this.isCalculating = true;
    this.logger.log("🚀 Starting vault fees calculation for all vaults...");
    this.logger.log("📅 Current timestamp:", new Date().toISOString());

    try {
      // Get all vaults from database
      this.logger.log("🔍 Step 1: Fetching all vaults from database...");
      const allVaults = await this.vaultFactoryService.findAll();
      this.logger.log(`✅ Found ${allVaults.length} vaults to process`);
      this.logger.log(
        "📋 Vault details:",
        allVaults.map((v) => ({ name: v.vaultName, index: v.vaultIndex }))
      );

      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
      this.logger.log("📅 Today's date for fee calculation:", today);

      for (const vault of allVaults) {
        this.logger.log(
          `\n🔄 Processing vault: ${vault.vaultName} (index: ${vault.vaultIndex})`
        );

        if (vault.vaultIndex === null || vault.vaultIndex === undefined) {
          this.logger.log(
            `❌ Skipping vault ${vault.vaultName} - no vault index`
          );
          this.logger.warn(
            `Skipping vault ${vault.vaultName} - no vault index`
          );
          continue;
        }

        try {
          // Check if fees already calculated for today
          this.logger.log(
            `🔍 Step 2: Checking existing fees for vault ${vault.vaultName}...`
          );
          const existingFees =
            await this.vaultManagementFeesService.findByVaultIndex(
              vault.vaultIndex
            );
          this.logger.log(
            `📊 Found ${existingFees.length} existing fee records for vault ${vault.vaultName}`
          );

          const todayFees = existingFees.find((fee) => fee.date === today);
          this.logger.log(
            `🔍 Checking for today's fees (${today}):`,
            todayFees ? "FOUND" : "NOT FOUND"
          );

          if (todayFees) {
            this.logger.log(
              `⏭️ Fees already calculated for vault ${vault.vaultName} on ${today}, skipping...`
            );
            continue;
          }

          // Calculate fees
          this.logger.log(
            `🧮 Step 3: Calculating fees for vault ${vault.vaultName}...`
          );
          const feeData = await this.calculateVaultFees(vault.vaultIndex);
          this.logger.log(
            `✅ Fee calculation completed for vault ${vault.vaultName}`
          );

          // Store in database
          this.logger.log(
            `💾 Step 4: Attempting to store fees for vault ${vault.vaultName}...`
          );
          this.logger.log(`📊 Fee data to store:`, {
            date: today,
            vaultName: feeData.vaultName,
            vaultSymbol: feeData.vaultSymbol,
            vaultIndex: feeData.vaultIndex,
            etfCreatorFee: feeData.etfCreatorFee,
            platformOwnerFee: feeData.platformOwnerFee,
            todaysAum: feeData.todaysAum,
            nav: feeData.nav,
            gav: feeData.gav,
            status: FeeStatus.PENDING,
          });

          this.logger.log(`🔧 Calling vaultManagementFeesService.create()...`);
          const createData = {
            date: today,
            vaultName: feeData.vaultName,
            vaultSymbol: feeData.vaultSymbol,
            vaultIndex: feeData.vaultIndex,
            etfCreatorFee: feeData.etfCreatorFee,
            platformOwnerFee: feeData.platformOwnerFee,
            todaysAum: feeData.todaysAum,
            nav: feeData.nav,
            gav: feeData.gav,
            status: FeeStatus.PENDING,
            metadata: feeData.metadata,
            notes: `Auto-calculated on ${new Date().toISOString()}`,
          };

          this.logger.log(
            `📝 Create data object:`,
            JSON.stringify(createData, null, 2)
          );

          const createdFee = await this.vaultManagementFeesService.create(
            createData
          );
          this.logger.log(
            `✅ Successfully stored fees for vault ${vault.vaultName}`
          );
          this.logger.log(`📄 Created fee record:`, createdFee);

          // Add delay to avoid rate limiting (2 seconds between vaults)
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          this.logger.error(
            `Failed to calculate or store fees for vault ${vault.vaultName}:`,
            error
          );
          console.error(`❌ Error details for vault ${vault.vaultName}:`, {
            error: error.message,
            stack: error.stack,
            vaultIndex: vault.vaultIndex,
            vaultName: vault.vaultName,
          });
          // Continue with other vaults
        }
      }

      this.logger.log("🎉 Completed vault fees calculation for all vaults");
    } catch (error) {
      this.logger.log("Error in calculateAllVaultFees:", error);
      throw error;
    } finally {
      this.isCalculating = false;
    }
  }
}
