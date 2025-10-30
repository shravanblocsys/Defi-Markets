import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import { setApyCalculationCompleted } from "@/store/slices/vaultsSlice";
import VaultDataService from "@/services/vaultDataService";
import { useContract, useVaultCreation } from "./useContract";
import type { VaultFinalData, AssetBalance } from "@/store/slices/vaultsSlice";

// Interface for storing basic vault data (name and index for contract calls)
interface VaultData {
  vaultName: string;
  vaultIndex?: number; // Vault index used for smart contract calls
}

// Interface for storing vault summary data from API (oldest NAV for each vault)
interface VaultSummaryData {
  vaultName: string;
  vaultSymbol: string;
  gav: number; // GAV from vault summary API
  initialNav: number; // NAV from vault summary API (oldest date)
  date: string; // Date from vault summary API (used for APY time calculation)
}

interface VaultFinalDataState {
  data: VaultFinalData[];
  loading: boolean;
  error: string | null;
}

// Custom hook to calculate final GAV, NAV, and APY for all vaults
// Combines initial data from vault summary API with current data from smart contract
export const useAPYCalculations = (
  vaultDataArray: VaultData[], // Array of vault names and indices
  vaultSummaryData: VaultSummaryData[] // Array of initial GAV/NAV data from API
) => {
  const dispatch = useAppDispatch();
  const apyCalculationCompleted = useAppSelector(
    (state) => state.vaults.apyCalculationCompleted
  );

  const [state, setState] = useState<VaultFinalDataState>({
    data: [],
    loading: false,
    error: null,
  });

  const { connection } = useContract();
  const { program } = useVaultCreation();

  const calculateFinalGavNav = async () => {
    try {
      // console.log("Calculating final GAV and NAV for all vaults...");

      if (!connection || !program) {
        // console.error("Contract connection or program not available");
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Contract connection or program not available",
        }));
        return;
      }

      if (vaultDataArray.length === 0) {
        // console.log("No vault data available yet, skipping final calculation");
        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
        }));
        return;
      }

      // Filter vaults that have vaultIndex
      const vaultsWithIndex = vaultDataArray.filter(
        (vault) => vault.vaultIndex !== undefined
      );

      if (vaultsWithIndex.length === 0) {
        // console.log("No vaults with vaultIndex found");
        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
        }));
        return;
      }

      // console.log(
      //   `Processing ${vaultsWithIndex.length} vaults with vaultIndex...`
      // );

      setState((prev) => ({ ...prev, loading: true, error: null }));

      const vaultDataService = new VaultDataService(connection, program);
      const finalData: VaultFinalData[] = [];

      // Process each vault
      for (const vault of vaultsWithIndex) {
        try {
          // console.log(
          //   `\n🔷 Processing vault: ${vault.vaultName} (Index: ${vault.vaultIndex})`
          // );

          // Get current GAV and NAV from smart contract
          const currentValuation =
            await vaultDataService.getFormattedVaultValuation(
              vault.vaultIndex!
            );

          // Get vault data including asset balances
          const vaultData = await vaultDataService.fetchVaultData(
            vault.vaultIndex!
          );

          // Find corresponding initial data from vaultSummaryData
          const initialData = vaultSummaryData.find(
            (summary) => summary.vaultName === vault.vaultName
          );

          if (initialData) {
            // console.log(`\n📊 APY CALCULATION FOR: ${vault.vaultName}`);
            // console.log("═".repeat(60));

            // Calculate APY using the formula: APY = ((Final NAV / Initial NAV) ^ (1 / Time in Years) - 1) × 100
            let timeInYears = 1; // Default to 1 year

            // Calculate actual time period using the date from vault summary API
            // This ensures accurate APY calculation based on real time elapsed
            let initialDate: Date;
            let currentDate: Date;
            let initialDateString: string;
            let currentDateString: string;

            try {
              initialDate = new Date(initialData.date);
              currentDate = new Date();
              initialDateString = initialData.date;
              currentDateString = currentDate.toISOString().split("T")[0];

              const timeDiffMs = currentDate.getTime() - initialDate.getTime();
              const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);
              timeInYears = timeDiffDays / 365.25; // Account for leap years

              // Ensure minimum time period of 1 day to avoid division by zero
              if (timeInYears < 1 / 365.25) {
                timeInYears = 1 / 365.25; // 1 day minimum
              }

              // console.log(`📅 Time Period:`);
              // console.log(`   Initial Date: ${initialDateString}`);
              // console.log(`   Current Date: ${currentDateString}`);
              // console.log(`   Days Elapsed: ${timeDiffDays.toFixed(2)} days`);
              // console.log(`   Time in Years: ${timeInYears.toFixed(4)} years`);
            } catch (error) {
              console.warn(
                `⚠️  Failed to parse date for vault ${vault.vaultName}, using default 1 year:`,
                error
              );
              timeInYears = 1;
              initialDateString = initialData.date || "Unknown";
              currentDateString = new Date().toISOString().split("T")[0];
            }

            // console.log(`\n💰 NAV Values:`);
            // console.log(`   Initial NAV (from API): ${initialData.initialNav}`);
            // console.log(
            //   `   Final NAV (from contract): ${currentValuation.nav}`
            // );

            // Calculate APY with proper handling for different NAV scenarios
            let apy = 0;
            let calculationType = "";

            if (initialData.initialNav > 0) {
              // Only calculate APY for positive initial NAV values (standard case)
              const navRatio = currentValuation.nav / initialData.initialNav;
              if (navRatio <= 0) {
                // Guard against negative or zero ratio which would yield NaN when exponentiated
                apy = 0;
                calculationType = "Skipped - non-positive NAV ratio (final NAV <= 0)";
              } else {
                apy = (Math.pow(navRatio, 1 / timeInYears) - 1) * 100;
                calculationType = "Standard calculation";
              }

              // console.log(`\n🧮 APY Calculation:`);
              // console.log(
              //   `   Formula: APY = ((Final NAV / Initial NAV) ^ (1 / Time in Years) - 1) × 100`
              // );
              // console.log(
              //   `   NAV Ratio: ${currentValuation.nav} / ${
              //     initialData.initialNav
              //   } = ${navRatio.toFixed(6)}`
              // );
              // console.log(
              //   `   Exponent: 1 / ${timeInYears.toFixed(4)} = ${(
              //     1 / timeInYears
              //   ).toFixed(6)}`
              // );
              if (navRatio > 0) {
                // console.log(
                //   `   Growth Factor: ${navRatio.toFixed(6)} ^ ${(
                //     1 / timeInYears
                //   ).toFixed(6)} = ${Math.pow(navRatio, 1 / timeInYears).toFixed(
                //     6
                //   )}`
                // );
                // console.log(
                //   `   APY: (${Math.pow(navRatio, 1 / timeInYears).toFixed(
                //     6
                //   )} - 1) × 100 = ${apy.toFixed(4)}%`
                // );
              } else {
                // console.log(
                //   "   NAV ratio non-positive; APY set to 0 to avoid NaN."
                // );
              }
            } else if (initialData.initialNav < 0) {
              // Skip APY calculation for negative initial NAV (not meaningful)
              console.warn(
                `\n⚠️  Negative initial NAV for ${vault.vaultName}: ${initialData.initialNav}. Skipping APY calculation as it's not meaningful.`
              );
              apy = 0; // Set to 0 for negative initial NAV
              calculationType = "Skipped - negative initial NAV";
            } else {
              // Skip APY calculation for zero initial NAV (division by zero)
              console.warn(
                `\n⚠️  Zero initial NAV for ${vault.vaultName}. Cannot calculate APY.`
              );
              apy = 0;
              calculationType = "Skipped - zero initial NAV";
            }

            // Convert asset balances to base10 format
            const assets = vaultData.underlyingAssets.map((asset) => ({
              mintAddress: asset.mintAddress,
              balanceBase10: asset.balanceFormatted, // Already converted to base10 in vaultDataService
              decimals: asset.decimals,
              allocation: asset.allocation,
            }));

            // Convert stablecoin balance to base10 using actual decimals from vaultData
            const stablecoinBalanceBase10 =
              vaultData.stablecoinBalance /
              Math.pow(10, vaultData.stablecoinDecimals);

            const finalVaultData: VaultFinalData = {
              vaultName: vault.vaultName,
              vaultSymbol: initialData.vaultSymbol,
              vaultIndex: vault.vaultIndex!,
              initialGav: initialData.gav,
              initialNav: initialData.initialNav,
              finalGav: currentValuation.gav,
              finalNav: currentValuation.nav,
              apy: apy,
              initialDate: initialDateString,
              currentDate: currentDateString,
              assets: assets, // Asset balances in base10
              stablecoinBalanceBase10: stablecoinBalanceBase10, // Stablecoin balance in base10
            };

            finalData.push(finalVaultData);

            // console.log(`\n✅ FINAL RESULT FOR ${vault.vaultName}:`);
            // console.log(`   Vault Symbol: ${initialData.vaultSymbol}`);
            // console.log(`   Initial GAV: ${initialData.gav}`);
            // console.log(`   Initial NAV: ${initialData.initialNav}`);
            // console.log(`   Final GAV: ${currentValuation.gav}`);
            // console.log(`   Final NAV: ${currentValuation.nav}`);
            // console.log(`   Calculated APY: ${apy.toFixed(2)}%`);
            // console.log(`   Calculation Type: ${calculationType}`);
            // console.log(
            //   `   Stablecoin Balance (Base10): ${stablecoinBalanceBase10.toFixed(
            //     6
            //   )}`
            // );
            // console.log(`   Assets (${assets.length} total):`);
            // assets.forEach((asset, index) => {
            //   console.log(`     Asset ${index + 1}:`);
            //   console.log(`       Mint: ${asset.mintAddress}`);
            //   console.log(
            //     `       Balance (Base10): ${asset.balanceBase10.toFixed(
            //       asset.decimals
            //     )}`
            //   );
            //   console.log(`       Decimals: ${asset.decimals}`);
            //   console.log(
            //     `       Allocation: ${asset.allocation} bps (${(
            //       asset.allocation / 100
            //     ).toFixed(2)}%)`
            //   );
            // });
            // console.log("═".repeat(60));
          } else {
            console.warn(
              `\n⚠️  No initial data found for vault: ${vault.vaultName}`
            );
          }
        } catch (error) {
          // Check if it's an "account does not exist" error (vault not created on-chain yet)
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes("Account does not exist") ||
            errorMessage.includes("has no data")
          ) {
            console.warn(
              `⚠️  Vault ${vault.vaultName} (Index: ${vault.vaultIndex}) not yet created on-chain - skipping`
            );
          } else {
            console.error(
              `\n❌ Error processing vault ${vault.vaultName}:`,
              error
            );
          }
        }
      }

      if (finalData.length > 0) {
        // console.log("Final GAV and NAV calculation completed:", finalData);
        setState({
          data: finalData,
          loading: false,
          error: null,
        });
        // console.log("Final vault data calculated:", finalData);
        // Mark APY calculation as completed in global state
        dispatch(setApyCalculationCompleted(true));
        // console.log("✅ APY calculation marked as completed globally");
      } else {
        // console.log("No final data to store");
        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
        }));
        // Still mark as completed even if no data (prevents infinite retries)
        dispatch(setApyCalculationCompleted(true));
      }
    } catch (error) {
      // console.error("Failed to calculate final GAV and NAV:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to calculate final GAV and NAV",
      }));
    }
  };

  useEffect(() => {
    // Only calculate if APY calculation hasn't been completed globally and have all required data
    if (
      !apyCalculationCompleted &&
      vaultDataArray.length > 0 &&
      vaultSummaryData.length > 0 &&
      connection &&
      program
    ) {
      // console.log("🚀 Starting APY calculation (first time only)");
      calculateFinalGavNav();
    }
  }, [
    vaultDataArray,
    vaultSummaryData,
    connection,
    program,
    apyCalculationCompleted,
  ]);

  // Manual refetch function that resets the calculation flag
  const refetch = () => {
    // console.log("🔄 Manual refetch requested - resetting calculation flag");
    dispatch(setApyCalculationCompleted(false));
    setState((prev) => ({ ...prev, data: [], error: null }));
  };

  return {
    ...state,
    refetch,
  };
};
