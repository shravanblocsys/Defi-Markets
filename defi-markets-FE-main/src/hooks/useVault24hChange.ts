import { useState, useEffect } from "react";
import { useAppSelector } from "@/store";
import type { VaultFinalData } from "@/store/slices/vaultsSlice";

interface JupiterPriceData {
  [mintAddress: string]: {
    usdPrice: number;
    blockId: number;
    decimals: number;
    priceChange24h: number;
  };
}

interface VaultChange24h {
  change: number;
  isPositive: boolean;
  formatted: string;
}

export const useVault24hChange = (vaultName: string): VaultChange24h => {
  const [change24h, setChange24h] = useState<VaultChange24h>({
    change: 0,
    isPositive: true,
    formatted: "+0.0%",
  });

  const { vaultFinalData } = useAppSelector((state) => state.vaults);

  useEffect(() => {
    const calculateVaultChange = async () => {
      try {
        // console.log("\n" + "=".repeat(80));
        // console.log(`🔄 CALCULATING 24H CHANGE FOR VAULT: ${vaultName}`);
        // console.log("=".repeat(80));

        // Find the vault data from global state
        const vaultData = vaultFinalData.find(
          (data: VaultFinalData) => data.vaultName === vaultName
        );

        if (!vaultData || !vaultData.assets || vaultData.assets.length === 0) {
          console.log(`❌ No vault data found for ${vaultName}`);
          return;
        }

        // console.log(`✅ Vault data found:`, {
        //   vaultName: vaultData.vaultName,
        //   vaultSymbol: vaultData.vaultSymbol,
        //   numberOfAssets: vaultData.assets.length,
        //   stablecoinBalance: vaultData.stablecoinBalanceBase10,
        // });

        // Extract mint addresses from vault assets
        const mintAddresses = vaultData.assets
          .map((asset) => asset.mintAddress)
          .filter(Boolean);

        if (mintAddresses.length === 0) {
          console.log(`❌ No mint addresses found for ${vaultName}`);
          return;
        }

        // console.log(`\n📋 Assets in vault (${mintAddresses.length} total):`);
        vaultData.assets.forEach((asset, index) => {
          // console.log(`  ${index + 1}. Mint: ${asset.mintAddress}`);
          // console.log(
          //   `     Balance: ${asset.balanceBase10} (${asset.decimals} decimals)`
          // );
        });

        // Fetch price data from Jupiter API
        const jupiterUrl = `${import.meta.env.VITE_JUPITER_PRICE_API}${mintAddresses.join(
          ","
        )}`;
        const response = await fetch(jupiterUrl, {
          headers: {
              "x-api-key": import.meta.env.VITE_JUPITER_API_KEY,
          },
        });
        console.log("💰 Price data fetched:", response);
        // console.log(`\n🌐 Fetching prices from Jupiter API...`);
        // console.log(`   URL: ${jupiterUrl}`);

        if (!response.ok) {
          console.error("❌ Failed to fetch prices from Jupiter API");
          return;
        }

        const priceData: JupiterPriceData = await response.json();
        // console.log(`✅ Price data received from Jupiter API`);
        // console.log(
        //   `   Assets with price data: ${Object.keys(priceData).length}`
        // );

        // Calculate current and previous total values
        // console.log(`\n${"─".repeat(80)}`);
        // console.log(`💰 STEP-BY-STEP CALCULATION:`);
        // console.log(`${"─".repeat(80)}`);

        let currentTotalValue = 0;
        let previousTotalValue = 0;

        vaultData.assets.forEach((asset, index) => {
          const assetPrice = priceData[asset.mintAddress];

          if (!assetPrice) {
            console.warn(
              `⚠️  Asset ${index + 1}: No price data for ${asset.mintAddress}`
            );
            return;
          }

          // console.log(`\n📊 Asset ${index + 1}:`);
          // console.log(`   Mint Address: ${asset.mintAddress}`);
          // console.log(`   Balance: ${asset.balanceBase10}`);

          const currentPrice = assetPrice.usdPrice;
          const priceChange24h = assetPrice.priceChange24h || 0;

          // console.log(
          //   `   Current Price (from Jupiter): $${currentPrice.toFixed(6)}`
          // );
          // console.log(
          //   `   24h Price Change: ${
          //     priceChange24h >= 0 ? "+" : ""
          //   }${priceChange24h.toFixed(4)}%`
          // );

          // Calculate previous price using formula:
          // Previous Price = Current Price / (1 + (priceChange24h / 100))
          const previousPrice = currentPrice / (1 + priceChange24h / 100);
          // console.log(`   \n   📐 Previous Price Calculation:`);
          // console.log(
          //   `      Formula: Previous Price = Current Price / (1 + (priceChange24h / 100))`
          // );
          // console.log(
          //   `      Previous Price = ${currentPrice} / (1 + (${priceChange24h} / 100))`
          // );
          // console.log(
          //   `      Previous Price = ${currentPrice} / ${(
          //     1 +
          //     priceChange24h / 100
          //   ).toFixed(6)}`
          // );
          // console.log(`      Previous Price = $${previousPrice.toFixed(6)}`);

          // Calculate asset values
          const currentAssetValue = asset.balanceBase10 * currentPrice;
          const previousAssetValue = asset.balanceBase10 * previousPrice;

          // console.log(`   \n   💵 Value Calculation:`);
          // console.log(`      Current Value = Balance × Current Price`);
          // console.log(
          //   `      Current Value = ${
          //     asset.balanceBase10
          //   } × $${currentPrice.toFixed(6)}`
          // );
          // console.log(`      Current Value = $${currentAssetValue.toFixed(2)}`);
          // console.log(
          //   `      \n      Previous Value = Balance × Previous Price`
          // );
          // console.log(
          //   `      Previous Value = ${
          //     asset.balanceBase10
          //   } × $${previousPrice.toFixed(6)}`
          // );
          // console.log(
          //   `      Previous Value = $${previousAssetValue.toFixed(2)}`
          // );

          currentTotalValue += currentAssetValue;
          previousTotalValue += previousAssetValue;

          // console.log(`   \n   📈 Running Totals:`);
          // console.log(`      Current Total: $${currentTotalValue.toFixed(2)}`);
          // console.log(
          //   `      Previous Total: $${previousTotalValue.toFixed(2)}`
          // );
        });

        // Include stablecoin balance in calculations (assuming price = 1.0 and no change)
        if (vaultData.stablecoinBalanceBase10 > 0) {
          // console.log(`\n💵 Stablecoin Balance:`);
          // console.log(`   Balance: ${vaultData.stablecoinBalanceBase10}`);
          // console.log(`   Price: $1.00 (stable)`);
          // console.log(
          //   `   Value: $${vaultData.stablecoinBalanceBase10.toFixed(2)}`
          // );

          currentTotalValue += vaultData.stablecoinBalanceBase10;
          previousTotalValue += vaultData.stablecoinBalanceBase10;

          // console.log(`   \n   Updated Totals (including stablecoin):`);
          // console.log(`      Current Total: $${currentTotalValue.toFixed(2)}`);
          // console.log(
          //   `      Previous Total: $${previousTotalValue.toFixed(2)}`
          // );
        }

        // Calculate vault percentage change
        // Vault Change % = ((Current Total Value - Previous Total Value) / Previous Total Value) × 100
        // console.log(`\n${"═".repeat(80)}`);
        // console.log(`🎯 FINAL VAULT 24H CHANGE CALCULATION:`);
        // console.log(`${"═".repeat(80)}`);

        let vaultChangePercent = 0;
        if (previousTotalValue > 0) {
          const valueDifference = currentTotalValue - previousTotalValue;

          // console.log(`\n📊 Summary:`);
          // console.log(
          //   `   Current Total Value:  $${currentTotalValue.toFixed(2)}`
          // );
          // console.log(
          //   `   Previous Total Value: $${previousTotalValue.toFixed(2)}`
          // );
          // console.log(
          //   `   Value Difference:     $${valueDifference.toFixed(2)} ${
          //     valueDifference >= 0 ? "📈" : "📉"
          //   }`
          // );

          // console.log(`\n📐 Percentage Change Formula:`);
          // console.log(
          //   `   Vault Change % = ((Current - Previous) / Previous) × 100`
          // );
          // console.log(
          //   `   Vault Change % = (($${currentTotalValue.toFixed(
          //     2
          //   )} - $${previousTotalValue.toFixed(
          //     2
          //   )}) / $${previousTotalValue.toFixed(2)}) × 100`
          // );
          // console.log(
          //   `   Vault Change % = ($${valueDifference.toFixed(
          //     2
          //   )} / $${previousTotalValue.toFixed(2)}) × 100`
          // );

          vaultChangePercent =
            ((currentTotalValue - previousTotalValue) / previousTotalValue) *
            100;

          // console.log(
          //   `   Vault Change % = ${
          //     vaultChangePercent >= 0 ? "+" : ""
          //   }${vaultChangePercent.toFixed(2)}%`
          // );
        } else {
          console.log(`⚠️  Cannot calculate percentage (previous total is 0)`);
        }

        // Format the change for display
        const isPositive = vaultChangePercent >= 0;
        const formatted = `${isPositive ? "+" : ""}${vaultChangePercent.toFixed(
          1
        )}%`;

        // console.log(`\n✅ RESULT:`);
        // console.log(`   ${isPositive ? "🟢" : "🔴"} ${formatted}`);
        // console.log(`   Direction: ${isPositive ? "UP ↗" : "DOWN ↘"}`);
        // console.log(`${"═".repeat(80)}\n`);

        setChange24h({
          change: vaultChangePercent,
          isPositive,
          formatted,
        });
      } catch (error) {
        console.error(
          `\n❌ Error calculating 24h change for ${vaultName}:`,
          error
        );
        // console.log(`${"═".repeat(80)}\n`);
      }
    };

    // Only calculate if we have vault data
    if (vaultFinalData.length > 0) {
      calculateVaultChange();
    }
  }, [vaultName, vaultFinalData]);

  return change24h;
};
