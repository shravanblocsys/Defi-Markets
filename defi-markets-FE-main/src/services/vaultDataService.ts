import * as anchor from "@coral-xyz/anchor";
import {
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { PublicKey, Connection } from "@solana/web3.js";

// Types for vault data
export interface VaultAsset {
  mintAddress: string;
  allocation: number; // in bps
  balance: number; // in smallest unit (lamports/tokens)
  balanceFormatted: number; // in base10 (decimal) format
  decimals: number; // token decimals
}

export interface VaultData {
  totalAssets: number; // in lamports
  totalSupply: number; // in lamports
  managementFees: number; // in bps
  admin: string;
  underlyingAssets: VaultAsset[];
  stablecoinBalance: number; // in lamports
  stablecoinDecimals: number; // actual decimals of the stablecoin
  accruedManagementFees: number; // in lamports
}

export interface VaultValuation {
  nav: number; // Net Asset Value in USD
  navPerToken: number; // NAV per token in USD
  gav: number; // Gross Asset Value in USD
  gavPerToken: number; // GAV per token in USD
  accruedManagementFees: number; // in USD
}

export interface TokenPrice {
  mintAddress: string;
  usdPrice: number;
  priceChange24h: number;
}

class VaultDataService {
  private connection: Connection;
  private program: any;
  private decimalsCache = new Map<string, number>();

  constructor(connection: Connection, program: any) {
    this.connection = connection;
    this.program = program;
  }

  // Helper functions for PDA derivation
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

  // Helper function to get token decimals with caching optimization
  private async getTokenDecimals(mintAddress: PublicKey): Promise<number> {
    const mintKey = mintAddress.toBase58();

    // Check cache first
    if (this.decimalsCache.has(mintKey)) {
      // console.log(
      //   `    💾 CACHED DECIMALS: ${mintKey} = ${this.decimalsCache.get(
      //     mintKey
      //   )}`
      // );
      return this.decimalsCache.get(mintKey)!;
    }

    // Common token decimals (avoid blockchain calls for known tokens)
    const commonDecimals: Record<string, number> = {
      So11111111111111111111111111111111111111112: 9, // SOL
      EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6, // USDC
      Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 6, // USDT
      mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: 6, // mSOL
      "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": 8, // ETH (Wormhole)
      A9mUU4qviSctJVPJdBJWkb28deg915LYJKrzQ19ji3FM: 6, // USDCet
    };

    if (commonDecimals[mintKey]) {
      // console.log(
      //   `    📋 KNOWN DECIMALS: ${mintKey} = ${commonDecimals[mintKey]}`
      // );
      this.decimalsCache.set(mintKey, commonDecimals[mintKey]);
      return commonDecimals[mintKey];
    }

    // Only call blockchain for unknown tokens
    try {
      // console.log(`    🔍 FETCHING DECIMALS FROM BLOCKCHAIN: ${mintKey}`);
      const mintInfo = await getMint(this.connection, mintAddress);
      this.decimalsCache.set(mintKey, mintInfo.decimals);
      // console.log(
      //   `    ✅ BLOCKCHAIN DECIMALS: ${mintKey} = ${mintInfo.decimals}`
      // );
      return mintInfo.decimals;
    } catch (error) {
      // console.warn(
      //   `Failed to get decimals for ${mintAddress.toBase58()}, defaulting to 9`
      // );
      this.decimalsCache.set(mintKey, 9);
      return 9; // Default to 9 decimals for most Solana tokens
    }
  }

  // Call the contract's read function to get vault data
  async fetchVaultData(vaultIndex: number): Promise<VaultData> {
    const factory = this.pdaFactory();
    const vault = this.pdaVault(factory, vaultIndex);
    const vaultStable = this.pdaVaultStablecoin(vault);

    try {
      // console.log(`🔍 Reading Vault ${vaultIndex} Allocation:`);
      // console.log("🏭 Factory PDA:", factory.toBase58());
      // console.log("🔑 Vault PDA:", vault.toBase58());

      // Get vault account from contract
      const vaultAccount = (await this.program.account.vault.fetch(
        vault
      )) as any;
      // console.log("📊 Vault State:");
      // console.log(
      //   `  Total Assets: ${vaultAccount.totalAssets.toString()} (${(
      //     Number(vaultAccount.totalAssets) / 1e9
      //   ).toFixed(9)} SOL)`
      // );
      // console.log(
      //   `  Total Supply: ${vaultAccount.totalSupply.toString()} (${(
      //     Number(vaultAccount.totalSupply) / 1e9
      //   ).toFixed(9)} tokens)`
      // );
      // console.log(`  Management Fees: ${vaultAccount.managementFees} bps`);
      // console.log(`  Admin: ${vaultAccount.admin.toBase58()}`);

      // Get underlying assets with balances
      // console.log("🏦 Underlying Assets:");
      const underlyingAssets: VaultAsset[] = [];
      for (let i = 0; i < vaultAccount.underlyingAssets.length; i++) {
        const asset = vaultAccount.underlyingAssets[i];
        if (
          asset.mintAddress.toBase58() !== "11111111111111111111111111111111"
        ) {
          // console.log(`  Asset ${i}:`);
          // console.log(`    Mint: ${asset.mintAddress.toBase58()}`);
          // console.log(
          //   `    Allocation: ${asset.mintBps} bps (${(
          //     asset.mintBps / 100
          //   ).toFixed(2)}%)`
          // );

          // Get token account balance
          try {
            const tokenAccount = await getAssociatedTokenAddress(
              asset.mintAddress,
              vault,
              true
            );
            const balance = await getAccount(this.connection, tokenAccount);
            // console.log(
            //   `    🔍 RAW BALANCE FROM CHAIN: ${balance.amount.toString()}`
            // );

            // Get the actual token decimals from the mint
            const tokenDecimals = await this.getTokenDecimals(
              asset.mintAddress
            );
            // console.log(`    📊 TOKEN DECIMALS: ${tokenDecimals}`);

            // Convert balance from smallest unit to base10 using actual token decimals
            const balanceFormatted =
              Number(balance.amount) / Math.pow(10, tokenDecimals);

            // console.log(`    🔄 CONVERSION CALCULATION:`);
            // console.log(`       Raw Balance: ${balance.amount.toString()}`);
            // console.log(`       Token Decimals: ${tokenDecimals}`);
            // console.log(
            //   `       Divisor: 10^${tokenDecimals} = ${Math.pow(
            //     10,
            //     tokenDecimals
            //   )}`
            // );
            // console.log(
            //   `       Formula: ${balance.amount.toString()} ÷ ${Math.pow(
            //     10,
            //     tokenDecimals
            //   )} = ${balanceFormatted}`
            // );
            // console.log(
            //   `    ✅ CONVERTED TO BASE10: ${balanceFormatted.toFixed(
            //     tokenDecimals
            //   )} tokens`
            // );

            // console.log(
            //   `    📋 FINAL RESULT: ${balance.amount.toString()} → ${balanceFormatted.toFixed(
            //     tokenDecimals
            //   )} tokens (decimals: ${tokenDecimals})`
            // );

            underlyingAssets.push({
              mintAddress: asset.mintAddress.toBase58(),
              allocation: asset.mintBps,
              balance: Number(balance.amount), // Keep raw balance in smallest unit
              balanceFormatted: balanceFormatted, // Converted to base10
              decimals: tokenDecimals, // Store token decimals
            });
          } catch (e) {
            // console.log(`    Balance: Account not found or error`);
            underlyingAssets.push({
              mintAddress: asset.mintAddress.toBase58(),
              allocation: asset.mintBps,
              balance: 0,
              balanceFormatted: 0,
              decimals: 9, // Default to 9 decimals
            });
          }
        }
      }

      // Get vault stablecoin balance
      // console.log("💰 Vault Stablecoin Balance:");
      let stablecoinBalance = 0;
      let stablecoinDecimals = 6; // Default to USDC decimals
      try {
        const stableBalance = await getAccount(this.connection, vaultStable);
        stablecoinBalance = Number(stableBalance.amount);
        // Get stablecoin decimals (usually 6 for USDC, 9 for WSOL)
        stablecoinDecimals = await this.getTokenDecimals(stableBalance.mint);
        const stablecoinFormatted =
          Number(stableBalance.amount) / Math.pow(10, stablecoinDecimals);
        // console.log(
        //   `  Stablecoin Balance: ${stableBalance.amount.toString()} (${stablecoinFormatted.toFixed(
        //     stablecoinDecimals
        //   )} tokens, decimals: ${stablecoinDecimals})`
        // );
      } catch (e) {
        // console.log(`  Stablecoin Balance: Account not found or error`);
      }

      return {
        totalAssets: Number(vaultAccount.totalAssets),
        totalSupply: Number(vaultAccount.totalSupply),
        managementFees: vaultAccount.managementFees,
        admin: vaultAccount.admin.toBase58(),
        underlyingAssets,
        stablecoinBalance,
        stablecoinDecimals,
        accruedManagementFees: Number(
          vaultAccount.accruedManagementFeesUsdc || 0
        ),
      };
    } catch (error) {
      // console.error("Error fetching vault data:", error);
      throw new Error(
        `Failed to fetch vault data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Fetch token prices from Jupiter API
  async fetchTokenPrices(mintAddresses: string[]): Promise<TokenPrice[]> {
    if (mintAddresses.length === 0) return [];

    try {
      const ids = mintAddresses.join(",");
      // console.log(`🔍 Fetching prices for: ${ids}`);

      const response = await fetch(
        `https://lite-api.jup.ag/price/v3?ids=${ids}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Jupiter API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      // console.log("💰 Token prices fetched:", data);

      const prices: TokenPrice[] = [];

      for (const [mintAddress, priceData] of Object.entries(data)) {
        const price = priceData as any;
        prices.push({
          mintAddress,
          usdPrice: price.usdPrice || 0,
          priceChange24h: price.priceChange24h || 0,
        });
      }

      return prices;
    } catch (error) {
      // console.error("Error fetching token prices:", error);
      // Return default prices with 0 values instead of throwing to prevent complete failure
      return mintAddresses.map((mintAddress) => ({
        mintAddress,
        usdPrice: 0,
        priceChange24h: 0,
      }));
    }
  }

  // Calculate GAV and NAV using correct formulas
  async calculateVaultValuation(vaultIndex: number): Promise<VaultValuation> {
    // eslint-disable-next-line no-useless-catch
    try {
      // Fetch vault data from contract
      const vaultData = await this.fetchVaultData(vaultIndex);
      // console.log("vaultData", vaultData);

      // Get unique mint addresses for price fetching
      const mintAddresses = vaultData.underlyingAssets.map(
        (asset) => asset.mintAddress
      );

      // Fetch current prices
      const tokenPrices = await this.fetchTokenPrices(mintAddresses);
      const priceMap = new Map(
        tokenPrices.map((p) => [p.mintAddress, p.usdPrice])
      );

      // Calculate GAV using formula: GAV = Σ(Asset Quantity × Asset Price)
      // console.log("📈 Vault Valuation (NAV & GAV):");
      let gavValue = 0;

      for (const asset of vaultData.underlyingAssets) {
        const price = priceMap.get(asset.mintAddress) || 0;
        // Use the already converted base10 balance
        const assetQuantity = asset.balanceFormatted;
        const assetValue = assetQuantity * price;
        gavValue += assetValue;

        // console.log(`    💰 GAV CALCULATION FOR ${asset.mintAddress}:`);
        // console.log(`       Base10 Quantity: ${assetQuantity} tokens`);
        // console.log(`       Current Price: $${price}`);
        // console.log(
        //   `       Asset Value: ${assetQuantity} × $${price} = $${assetValue}`
        // );
        // console.log(`       Running GAV Total: $${gavValue}`);
      }

      // Add stablecoin balance using the actual decimals from vaultData
      const stablecoinValue =
        vaultData.stablecoinBalance /
        Math.pow(10, vaultData.stablecoinDecimals);
      gavValue += stablecoinValue;

      // console.log(`    💵 STABLECOIN CONVERSION:`);
      // console.log(
      //   `       Raw Stablecoin Balance: ${vaultData.stablecoinBalance}`
      // );
      // console.log(`       Stablecoin Decimals: ${vaultData.stablecoinDecimals}`);
      // console.log(
      //   `       Divisor: 10^${vaultData.stablecoinDecimals} = ${Math.pow(
      //     10,
      //     vaultData.stablecoinDecimals
      //   )}`
      // );
      // console.log(
      //   `       Formula: ${vaultData.stablecoinBalance} ÷ ${Math.pow(
      //     10,
      //     vaultData.stablecoinDecimals
      //   )} = ${stablecoinValue}`
      // );
      // console.log(`       Stablecoin Value: $${stablecoinValue}`);
      // console.log(`       Final GAV Total: $${gavValue}`);

      // console.log(`Total GAV calculated: ${gavValue} USD`);

      // Calculate NAV using formula: NAV = GAV - (GAV × Fee Percentage / 100)
      const feePercentage = vaultData.managementFees / 100; // Convert bps to percentage
      const totalFees = gavValue * (feePercentage / 100);
      const navValue = gavValue - totalFees;

      // console.log(`    📊 NAV CALCULATION:`);
      // console.log(`       GAV: $${gavValue}`);
      // console.log(`       Management Fees (bps): ${vaultData.managementFees}`);
      // console.log(`       Fee Percentage: ${feePercentage}%`);
      // console.log(
      //   `       Total Fees: $${gavValue} × ${feePercentage}% = $${totalFees}`
      // );
      // console.log(
      //   `       NAV Formula: $${gavValue} - $${totalFees} = $${navValue}`
      // );
      // console.log(`    ✅ FINAL NAV: $${navValue}`);

      // Calculate per-token values
      const totalSupply = vaultData.totalSupply;
      const gavPerToken = totalSupply > 0 ? gavValue / (totalSupply / 1e9) : 0;
      const navPerToken = totalSupply > 0 ? navValue / (totalSupply / 1e9) : 0;

      // console.log(`GAV per Token: ${gavPerToken.toFixed(6)} USD`);
      // console.log(`NAV per Token: ${navPerToken.toFixed(6)} USD`);

      return {
        nav: navValue,
        navPerToken,
        gav: gavValue,
        gavPerToken,
        accruedManagementFees: totalFees,
      };
    } catch (error) {
      // console.error("Error calculating vault valuation:", error);
      throw error;
    }
  }

  // Get formatted GAV and NAV for display
  async getFormattedVaultValuation(vaultIndex: number): Promise<{
    gav: number; // in USD
    nav: number; // in USD
    gavPerToken: number; // in USD
    navPerToken: number; // in USD
  }> {
    const valuation = await this.calculateVaultValuation(vaultIndex);

    return {
      gav: valuation.gav,
      nav: valuation.nav,
      gavPerToken: valuation.gavPerToken,
      navPerToken: valuation.navPerToken,
    };
  }
}

export default VaultDataService;
