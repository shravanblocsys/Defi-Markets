// src/hooks/useContract.ts
import { useState, useCallback, useEffect, useMemo } from "react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import { SOLANA_NETWORKS, SOLANA_RPC_URLS } from "@/lib/solana";
import { VAULT_FACTORY_PROGRAM_ID } from "@/components/solana/programIds/programids";
import { VAULT_FACTORY_IDL } from "@/components/solana/Idl/vaultFactory";

// Define interface for wallet provider
interface WalletProvider {
  sendTransaction: (
    transaction: Transaction,
    connection: Connection
  ) => Promise<string>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
}

export const useContract = () => {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider("solana");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const connection = useMemo(
    () => new Connection(SOLANA_RPC_URLS[SOLANA_NETWORKS.MAINNET]),
    []
  );

  const executeTransaction = useCallback(
    async (transaction) => {
      if (!walletProvider || !isConnected) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = new PublicKey(address);

        const signature = await (
          walletProvider as WalletProvider
        ).sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, "confirmed");

        return signature;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [walletProvider, isConnected, address, connection]
  );

  const callContract = useCallback(
    async (programId, instruction) => {
      const transaction = new Transaction();
      transaction.add(instruction);
      return executeTransaction(transaction);
    },
    [executeTransaction]
  );

  return {
    callContract,
    executeTransaction,
    connection,
    loading,
    error,
    isConnected,
    address,
  };
};

// Separate hook for Anchor programs
export function useAnchorProgram(programId: PublicKey, idl: Idl) {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider("solana");
  const [program, setProgram] = useState<Program | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use useMemo to prevent Connection recreation on every render
  const connection = useMemo(
    () => new Connection(SOLANA_RPC_URLS[SOLANA_NETWORKS.MAINNET]),
    []
  );

  useEffect(() => {

    // Check if wallet is ready
    if (isConnected && address && walletProvider) {
      try {

        // Create a wallet adapter that implements the Anchor Wallet interface
        const anchorWallet = {
          publicKey: new PublicKey(address),
          signTransaction: async <T extends Transaction | any>(tx: T): Promise<T> => {
            // Use the wallet provider to sign the transaction
            const signedTx = await (
              walletProvider as WalletProvider
            ).signTransaction(tx as Transaction);
            return signedTx as T;
          },
          signAllTransactions: async <T extends Transaction | any>(transactions: T[]): Promise<T[]> => {
            // Use the wallet provider to sign all transactions
            const signedTxs = await Promise.all(
              transactions.map((tx) =>
                (walletProvider as WalletProvider).signTransaction(tx as Transaction)
              )
            );
            return signedTxs as T[];
          },
        };

        const provider = new AnchorProvider(connection, anchorWallet, {
          preflightCommitment: "processed"
        });

        // Create program instance using the actual IDL (matching backend script exactly)
        const programInstance = new Program(
          idl as Idl,
          provider
        ) as Program<Idl>;

        setProgram(programInstance);
        setError(null);
      } catch (err) {
        console.error("Failed to initialize program:", err);
        setError(
          err instanceof Error ? err.message : "Failed to initialize program"
        );
        setProgram(null);
      }
    } else {
      setProgram(null);

      // Provide helpful error messages
      if (!isConnected) {
        setError("Please connect your wallet first");
      } else if (!address) {
        setError("Wallet address not available. Please reconnect your wallet.");
      } else if (!walletProvider) {
        setError(
          "Wallet provider not available. Please reconnect your wallet."
        );
      } else {
        setError("Wallet not ready. Please reconnect your wallet.");
      }
    }
  }, [isConnected, address, walletProvider, programId, idl, connection]);

  return { program, error };
}

// Hook specifically for vault factory operations
export function useVaultFactory() {
  const { program, error } = useAnchorProgram(VAULT_FACTORY_PROGRAM_ID, VAULT_FACTORY_IDL as Idl);
  const { address, isConnected } = useAppKitAccount();
  const { connection } = useContract();

  // -------- Read-only helpers used for NAV/GAV + fees (parity with read_vault.ts) --------
  const tokenDecimalsCache = useMemo(() => new Map<string, number>(), []);

  const getTokenDecimals = useCallback(async (mintAddress: PublicKey): Promise<number> => {
    const key = mintAddress.toBase58();
    if (tokenDecimalsCache.has(key)) {
      return tokenDecimalsCache.get(key)!;
    }

    try {
      const mintInfo = await getMint(connection, mintAddress);
      tokenDecimalsCache.set(key, mintInfo.decimals);
      return mintInfo.decimals;
    } catch (e) {
      console.warn(`Warning: Could not fetch decimals for ${key}, defaulting to 6`);
      tokenDecimalsCache.set(key, 6);
      return 6;
    }
  }, [connection, tokenDecimalsCache]);

  const fetchJupiterPrices = useCallback(async (mintAddresses: PublicKey[]): Promise<Record<string, number>> => {
    if (!mintAddresses || mintAddresses.length === 0) return {};
    const ids = mintAddresses.map(m => m.toBase58()).join(",");
    const url = `https://lite-api.jup.ag/price/v3?ids=${ids}`;
    console.log("🌐 Fetching live prices from Jupiter...");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch prices: ${response.statusText}`);
    }
    const data = await response.json() as Record<string, { usdPrice: number }>;
    const priceMap: Record<string, number> = {};
    for (const [mint, info] of Object.entries(data)) {
      // @ts-ignore - api shape
      priceMap[mint] = (info as any).usdPrice;
    }
    return priceMap;
  }, []);

  // Helper function to get factory PDA (matching script.ts implementation)
  const getFactoryPDA = useCallback(() => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      VAULT_FACTORY_PROGRAM_ID
    )[0];
  }, []);

  const getVaultPDA = useCallback((factory: PublicKey, vaultIndex: number) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factory.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      VAULT_FACTORY_PROGRAM_ID
    )[0];
  }, []);

  const getVaultStablecoinPDA = useCallback((vault: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vault.toBuffer()],
      VAULT_FACTORY_PROGRAM_ID
    )[0];
  }, []);

  // Update factory fees using Anchor program (matching script.ts implementation)
  const updateFactoryFees = useCallback(async (
    entryFeeBps: number,
    exitFeeBps: number,
    vaultCreationFeeUsdc: number,
    minManagementFeeBps: number,
    maxManagementFeeBps: number,
    vaultCreatorFeeRatioBps: number,
    platformFeeRatioBps: number
  ) => {
    if (!program || !address) {
      throw new Error("Program not initialized or wallet not connected");
    }

    const factoryPDA = getFactoryPDA();

    console.log("🏭 Factory PDA:", factoryPDA.toBase58());
    console.log("👤 Admin:", address);

    // Use .rpc() with skipPreflight to avoid simulation issues (matching FE implementation)
    const tx = await program.methods
      .updateFactoryFees(
        entryFeeBps,
        exitFeeBps,
        new BN(vaultCreationFeeUsdc),
        minManagementFeeBps,
        maxManagementFeeBps,
        vaultCreatorFeeRatioBps,
        platformFeeRatioBps
      )
      .accountsStrict({
        admin: new PublicKey(address),
        factory: factoryPDA,
      })
      .rpc({
        commitment: "confirmed"
      });

    console.log("✅ Factory fees updated! Transaction:", tx);

    // Wait for confirmation exactly like FE implementation
    const confirmation = await connection.confirmTransaction(tx, "confirmed");

    if (confirmation.value.err) {
      throw new Error(
        `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
      );
    }

    console.log("🎉 Transaction confirmed!");

    return tx;
  }, [program, address, getFactoryPDA, connection]);

  // Get factory info
  const getFactoryInfo = useCallback(async () => {
    if (!program) {
      throw new Error("Program not initialized");
    }

    const factoryPDA = getFactoryPDA();

    try {
      // First try to get account info directly
      const accountInfo = await connection.getAccountInfo(factoryPDA);
      if (!accountInfo) {
        throw new Error("Factory account not found");
      }
      
      console.log("📊 Factory account exists, size:", accountInfo.data.length, "bytes");
      
      // Try to fetch using the program method
      const factoryInfo = await program.methods
        .getFactoryInfo()
        .accountsStrict({
          factory: factoryPDA,
        })
        .view();

      console.log("🏭 Factory Information:", {
        factoryAddress: factoryInfo.factoryAddress.toBase58(),
        admin: factoryInfo.admin.toBase58(),
        feeRecipient: factoryInfo.feeRecipient.toBase58(),
        vaultCount: factoryInfo.vaultCount,
        state: factoryInfo.state,
        entryFeeBps: factoryInfo.entryFeeBps,
        exitFeeBps: factoryInfo.exitFeeBps,
        vaultCreationFeeUsdc: factoryInfo.vaultCreationFeeUsdc.toString(),
        minManagementFeeBps: factoryInfo.minManagementFeeBps,
        maxManagementFeeBps: factoryInfo.maxManagementFeeBps,
        vaultCreatorFeeRatioBps: factoryInfo.vaultCreatorFeeRatioBps,
        platformFeeRatioBps: factoryInfo.platformFeeRatioBps,
      });

      return factoryInfo;
    } catch (err) {
      console.error("❌ Factory info error:", err);
      
      // If there's a decoding error, try to get basic account info
      try {
        const accountInfo = await connection.getAccountInfo(factoryPDA);
        if (accountInfo) {
          console.log("📊 Factory account exists but has decoding issues:");
          console.log("  - Account size:", accountInfo.data.length, "bytes");
          console.log("  - Owner:", accountInfo.owner.toBase58());
          console.log("  - This suggests a version mismatch between deployed program and current IDL");
          console.log("  - The factory was likely created with an older version of the program");
        }
      } catch (basicErr) {
        console.error("❌ Could not get basic account info:", basicErr);
      }
      
      throw err;
    }
  }, [program, getFactoryPDA, connection]);

  // Read vault metrics (parity with read_vault.ts) and console.log all values
  const readVaultLiveMetrics = useCallback(async (vaultIndex: number) => {
    if (!program) throw new Error("Program not initialized");

    console.log(`\n🔍 Reading Vault ${vaultIndex} Allocation:`);
    const factoryPDA = getFactoryPDA();
    const vaultPDA = getVaultPDA(factoryPDA, vaultIndex);
    const vaultStablePDA = getVaultStablecoinPDA(vaultPDA);

    try {
      // Vault account
      const vaultAccount: any = await (program as any).account.vault.fetch(vaultPDA);
      // console.log(`\n📊 Vault State:`);
      // console.log(`  Total Assets: ${vaultAccount.totalAssets.toString()} ($${(Number(vaultAccount.totalAssets) / 1_000_000).toFixed(6)} USD)`);
      // console.log(`  Total Supply: ${vaultAccount.totalSupply.toString()} (${(Number(vaultAccount.totalSupply) / 1e6).toFixed(6)} tokens)`);
      // console.log(`  Management Fees: ${vaultAccount.managementFees} bps`);
      // console.log(`  Admin: ${vaultAccount.admin.toBase58()}`);

      console.log(`\n🏦 Underlying Assets:`);
      for (let i = 0; i < vaultAccount.underlyingAssets.length; i++) {
        const asset = vaultAccount.underlyingAssets[i];
        if (asset.mintAddress.toBase58() !== "11111111111111111111111111111111") {
          console.log(`  Asset ${i}:`);
          console.log(`    Mint: ${asset.mintAddress.toBase58()}`);
          console.log(`    Allocation: ${asset.mintBps} bps (${(asset.mintBps / 100).toFixed(2)}%)`);
          try {
            const tokenAccount = await getAssociatedTokenAddress(asset.mintAddress, vaultPDA, true);
            const balance = await getAccount(connection, tokenAccount);
            const decimals = await getTokenDecimals(asset.mintAddress);
            console.log(`    Balance: ${balance.amount.toString()} (${(Number(balance.amount) / Math.pow(10, decimals)).toFixed(6)} tokens)`);
          } catch (e) {
            console.log(`    Balance: Account not found or error`);
          }
        }
      }

      console.log(`\n💰 Vault Stablecoin Balance:`);
      let stablecoinMintBase58 = "";
      try {
        const stableBalance = await getAccount(connection, vaultStablePDA);
        const stablecoinMint = stableBalance.mint;
        stablecoinMintBase58 = stablecoinMint.toBase58();
        const stablecoinDecimals = await getTokenDecimals(stablecoinMint);
        console.log(`  ${stablecoinMintBase58}: ${stableBalance.amount.toString()} (${(Number(stableBalance.amount) / Math.pow(10, stablecoinDecimals)).toFixed(6)} tokens)`);
      } catch (e) {
        console.log(`  Stablecoin Balance: Account not found or error`);
      }

      // NAV & GAV (on-chain)
      console.log(`\n📈 Vault Valuation (NAV & GAV):`);
      const totalAssets = Number(vaultAccount.totalAssets);
      const totalSupply = Number(vaultAccount.totalSupply);
      const previouslyAccruedFees = Number(vaultAccount.accruedManagementFeesUsdc || 0);
      const nav = totalAssets;
      const navPerToken = totalSupply > 0 ? (nav * 1e6) / totalSupply : 0;
      const gav = totalAssets + previouslyAccruedFees;
      const gavPerToken = totalSupply > 0 ? (gav * 1e6) / totalSupply : 0;
      // console.log(`  Net Asset Value (NAV): ${nav.toFixed(0)} lamports ($${(nav / 1_000_000).toFixed(6)} USD)`);
      // console.log(`  NAV per Token: ${navPerToken.toFixed(0)} lamports ($${(navPerToken / 1_000_000).toFixed(6)} USD)`);
      // console.log(`  Gross Asset Value (GAV): ${gav.toFixed(0)} lamports ($${(gav / 1_000_000).toFixed(6)} USD)`);
      // console.log(`  GAV per Token: ${gavPerToken.toFixed(0)} lamports ($${(gavPerToken / 1_000_000).toFixed(6)} USD)`);
      // console.log(`  Accrued Management Fees: ${previouslyAccruedFees.toFixed(0)} lamports ($${(previouslyAccruedFees / 1_000_000).toFixed(6)} USD)`);

      // // Calculate user's share value
      // console.log(`\n👤 User Share Calculation:`);
      // console.log(`  If user has 1 vault token:`);
      // console.log(`  NAV Value: ${navPerToken.toFixed(0)} lamports ($${(navPerToken / 1_000_000).toFixed(6)} USD)`);
      // console.log(`  GAV Value: ${gavPerToken.toFixed(0)} lamports ($${(gavPerToken / 1_000_000).toFixed(6)} USD)`);

      // Off-chain live prices path
      console.log(`\n📊 Off-Chain Accrued Fees Calculation (using live prices):`);
      const underlyingAssets = vaultAccount.underlyingAssets as Array<any>;
      const priceMap = await fetchJupiterPrices(underlyingAssets.map(a => a.mintAddress));
      console.log(`\n💰 Live Prices from Jupiter:`);
      for (const [mint, price] of Object.entries(priceMap)) {
        console.log(`  ${mint}: $${Number(price).toFixed(6)}`);
      }

      let liveGav = 0;
      try {
        const stableBalance = await getAccount(connection, vaultStablePDA);
        liveGav += Number(stableBalance.amount);
        // console.log(`\n💵 Stablecoin Balance: ${stableBalance.amount} lamports`);
        // console.log(`  Stablecoin Mint: ${stablecoinMintBase58 || stableBalance.mint.toBase58()}`);
        const isStablecoinInUnderlying = underlyingAssets.some((a: any) => a.mintAddress.toBase58() === (stablecoinMintBase58 || stableBalance.mint.toBase58()));
        // console.log(`  Is stablecoin in underlying assets: ${isStablecoinInUnderlying}`);
      } catch (e) {
        console.log(`\n💵 Stablecoin Balance: 0 lamports (account not found)`);
      }

      console.log(`\n🏦 Underlying Asset Values (Live Prices):`);
      for (let i = 0; i < underlyingAssets.length; i++) {
        const asset = underlyingAssets[i];
        const mintAddress = asset.mintAddress.toBase58();
        const priceUsd = priceMap[mintAddress];
        if (!priceUsd) {
          console.log(`  Asset[${i}] ${mintAddress}: No price available`);
          continue;
        }
        try {
          const tokenAccount = await getAssociatedTokenAddress(
            asset.mintAddress,
            vaultPDA,
            true,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          const balance = await getAccount(connection, tokenAccount);
          const tokenDecimals = await getTokenDecimals(asset.mintAddress);
          const balanceNum = Number(balance.amount);
          const priceScaled = Math.round(Number(priceUsd) * 1_000_000);
          const valueUsd = Math.floor((balanceNum * priceScaled) / 1_000_000);
          liveGav += valueUsd;
          console.log(`  Asset[${i}] ${mintAddress}:`);
          console.log(`    Balance: ${balance.amount} (${(Number(balance.amount) / Math.pow(10, tokenDecimals)).toFixed(6)} tokens)`);
          console.log(`    Price: $${Number(priceUsd).toFixed(6)}`);
          console.log(`    Calculation: (${balanceNum} * ${priceScaled}) / 1_000_000 = ${valueUsd}`);
          console.log(`    Value: $${(valueUsd / 1_000_000).toFixed(6)} (${valueUsd} lamports)`);
        } catch (e) {
          console.log(`  Asset[${i}] ${mintAddress}: Account not found or error`);
        }
      }

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const elapsedSeconds = Math.max(0, currentTimestamp - Number(vaultAccount.lastFeeAccrualTs));
      const managementFeeBps = vaultAccount.managementFees;
      const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
      const newlyAccruedFees = (liveGav * managementFeeBps * elapsedSeconds) / (10_000 * SECONDS_PER_YEAR);
      const totalAccruedFees = previouslyAccruedFees + newlyAccruedFees;
      const liveNav = liveGav - totalAccruedFees;

      // console.log(`\n📈 Live Fee Calculation Results:`);
      // console.log(`  Current Timestamp: ${currentTimestamp}`);
      // console.log(`  Last Fee Accrual: ${Number(vaultAccount.lastFeeAccrualTs)}`);
      // console.log(`  Elapsed Seconds: ${elapsedSeconds}`);
      // console.log(`  Management Fee: ${managementFeeBps} bps (${(managementFeeBps/100).toFixed(2)}%)`);
      // console.log(`  Live GAV: ${Math.floor(liveGav)} lamports ($${(liveGav / 1_000_000).toFixed(6)})`);
      // console.log(`  Previously Accrued Fees: ${previouslyAccruedFees} lamports ($${(previouslyAccruedFees / 1_000_000).toFixed(6)})`);
      // console.log(`  Newly Accrued Fees: ${Math.floor(newlyAccruedFees)} lamports ($${(newlyAccruedFees / 1_000_000).toFixed(6)})`);
      // console.log(`  Total Accrued Fees: ${Math.floor(totalAccruedFees)} lamports ($${(totalAccruedFees / 1_000_000).toFixed(6)})`);
      // console.log(`  Live NAV: ${Math.floor(liveNav)} lamports ($${(liveNav / 1_000_000).toFixed(6)})`);

      // console.log(`\n💼 Total Assets Under Management (AUM):`);
      // console.log(`  AUM (Live GAV): $${(liveGav / 1_000_000).toFixed(2)} USD`);
      // console.log(`  AUM (On-Chain GAV): $${(gav / 1_000_000).toFixed(2)} USD`);

      // console.log(`\n🔄 Comparison with On-Chain Values:`);
      // console.log(`  On-Chain GAV: ${gav.toFixed(0)} lamports`);
      // console.log(`  Live GAV: ${Math.floor(liveGav)} lamports`);
      // console.log(`  Difference: ${Math.floor(liveGav) - gav} lamports`);
      // console.log(`  On-Chain NAV: ${nav.toFixed(0)} lamports`);
      // console.log(`  Live NAV: ${Math.floor(liveNav)} lamports`);
      // console.log(`  Difference: ${Math.floor(liveNav) - nav} lamports`);

      return {
        vaultIndex,
        nav,
        gav,
        liveGav,
        liveNav,
        managementFeeBps,
        lastFeeAccrualTs: Number(vaultAccount.lastFeeAccrualTs),
        previouslyAccruedFees,
        newlyAccruedFees,
      };
    } catch (e) {
      console.error("Error reading vault:", e);
      throw e;
    }
  }, [program, connection, getFactoryPDA, getVaultPDA, getVaultStablecoinPDA, getTokenDecimals, fetchJupiterPrices]);

  // Read accrued management fees (parity with read_accrued_fees.ts)
  const readAccruedManagementFees = useCallback(async (vaultIndex: number) => {
    if (!program) throw new Error("Program not initialized");

    console.log(`\n🔍 Reading Accrued Management Fees for Vault ${vaultIndex}...`);

    const factoryPDA = getFactoryPDA();
    const vaultPDA = getVaultPDA(factoryPDA, vaultIndex);
    const vaultStablePDA = getVaultStablecoinPDA(vaultPDA);

    try {
      // Fetch vault state
      const vaultAccount: any = await (program as any).account.vault.fetch(vaultPDA);
      const underlyingAssets: Array<{ mintAddress: PublicKey; mintBps: number }> = vaultAccount.underlyingAssets;

      console.log("\n🏦 Underlying Assets:");
      underlyingAssets.forEach((a, i) =>
        console.log(`  [${i}] mint=${a.mintAddress.toBase58()} alloc=${(a.mintBps/100).toFixed(2)}%`)
      );

      // Derive vault-owned ATAs for each underlying asset
      const vaultAssetAtas: PublicKey[] = [];
      const existingAssetIndices: number[] = [];
      
      for (let i = 0; i < underlyingAssets.length; i++) {
        const asset = underlyingAssets[i];
        const ata = await getAssociatedTokenAddress(
          asset.mintAddress,
          vaultPDA,
          true,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        
        vaultAssetAtas.push(ata);
        
        // Check if account exists
        try {
          await getAccount(connection, ata);
          existingAssetIndices.push(i);
          console.log(`  ✅ Asset[${i}] ${asset.mintAddress.toBase58()}: account exists`);
        } catch (e) {
          console.log(`  ❌ Asset[${i}] ${asset.mintAddress.toBase58()}: account not found`);
        }
      }

      // Fetch live prices from Jupiter
      const priceMap = await fetchJupiterPrices(underlyingAssets.map(a => a.mintAddress));

      // Build AssetPrice[] with 6-decimal fixed u64
      const assetPrices: Array<{ mintAddress: PublicKey; priceUsd: BN }> = underlyingAssets.map(a => {
        const key = a.mintAddress.toBase58();
        const p = priceMap[key];
        if (p === undefined) {
          throw new Error(`Missing price for ${key} in Jupiter response`);
        }
        const priceScaled = Math.round(p * 1_000_000); // 6 decimals
        return { mintAddress: a.mintAddress, priceUsd: new BN(priceScaled) };
      });
      
      console.log("\n💰 Asset prices being passed:");
      assetPrices.forEach((price, i) => {
        console.log(`  [${i}] ${price.mintAddress.toBase58()}: $${(Number(price.priceUsd) / 1_000_000).toFixed(6)}`);
      });

      // Prepare remaining accounts array (readonly)
      const remaining = vaultAssetAtas.map(pubkey => ({ pubkey, isSigner: false, isWritable: false }));
      
      console.log("\n📋 Remaining accounts being passed:");
      remaining.forEach((acc, i) => {
        console.log(`  [${i}] ${acc.pubkey.toBase58()}`);
      });

      // Call the instruction to get accrued fees (using rpc to get return data)
      console.log("\n📈 Calling get_accrued_management_fees...");
      const txSignature = await (program.methods as any)
        .getAccruedManagementFees(vaultIndex, assetPrices)
        .accounts({ 
          factory: factoryPDA, 
          vault: vaultPDA, 
          vault_stablecoin_account: vaultStablePDA 
        })
        .remainingAccounts(remaining)
        .rpc({
          commitment: "confirmed"
        });

      console.log("✅ Transaction sent:", txSignature);

      // Get the transaction to see return data
      const tx = await connection.getTransaction(txSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      });

      console.log("✅ Transaction returned:", tx);
      
      // Extract return data from transaction
      if (tx?.meta && 'returnData' in tx.meta && tx.meta.returnData) {
        const returnData = (tx.meta as any).returnData;
        console.log("✅ Return data:", returnData);
        return returnData;
      } else {
        console.log("⚠️ No return data found in transaction");
        console.log("Transaction meta:", tx?.meta);
        return null;
      }

    } catch (e) {
      console.error("Error reading accrued management fees:", e);
      throw e;
    }
  }, [program, connection, getFactoryPDA, getVaultPDA, getVaultStablecoinPDA, fetchJupiterPrices]);

  // Distribute accrued fees (parity with distribute_accrued_fees.ts)
  const distributeAccruedFees = useCallback(async (vaultIndex: number) => {
    if (!program || !address) {
      throw new Error("Program not initialized or wallet not connected");
    }

    console.log(`\n💰 Distributing accrued fees for vault index ${vaultIndex}`);

    const factoryPDA = getFactoryPDA();
    const vaultPDA = getVaultPDA(factoryPDA, vaultIndex);
    
    // Derive vault mint PDA
    const [vaultMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
      VAULT_FACTORY_PROGRAM_ID
    );

    console.log(`Factory: ${factoryPDA.toBase58()}`);
    console.log(`Vault: ${vaultPDA.toBase58()}`);
    console.log(`Vault Mint: ${vaultMintPDA.toBase58()}`);

    // Fetch factory and vault accounts to get recipients
    const factoryAccount: any = await (program as any).account.factory.fetch(factoryPDA);
    const vaultAccount: any = await (program as any).account.vault.fetch(vaultPDA);

    const feeRecipient = new PublicKey(factoryAccount.feeRecipient);
    const vaultAdmin = new PublicKey(vaultAccount.admin);

    // Derive recipient ATAs for vault tokens (ETF tokens)
    const feeRecipientVaultATA = await getAssociatedTokenAddress(
      vaultMintPDA,
      feeRecipient,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const vaultAdminVaultATA = await getAssociatedTokenAddress(
      vaultMintPDA,
      vaultAdmin,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log(`Fee recipient vault token ATA: ${feeRecipientVaultATA.toBase58()}`);
    console.log(`Vault admin vault token ATA: ${vaultAdminVaultATA.toBase58()}`);

    // Call the program to distribute fees as vault tokens
    console.log('Sending distributeAccruedFees instruction...');
    const tx = await (program.methods as any)
      .distributeAccruedFees(new BN(vaultIndex))
      .accountsStrict({
        collector: new PublicKey(address),
        factory: factoryPDA,
        vault: vaultPDA,
        vaultMint: vaultMintPDA,
        vaultAdminVaultAccount: vaultAdminVaultATA,
        feeRecipientVaultAccount: feeRecipientVaultATA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc({
        commitment: "confirmed"
      });

    console.log(`✅ Distributed accrued fees as ETF tokens. Tx: ${tx}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(tx, "confirmed");
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log("🎉 Transaction confirmed!");
    return tx;

  }, [program, address, connection, getFactoryPDA, getVaultPDA]);

  // Set vault paused state using Anchor program (matching script.ts implementation)
  const setVaultPaused = useCallback(async (
    vaultIndex: number,
    paused: boolean
  ) => {
    if (!program || !address) {
      throw new Error("Program not initialized or wallet not connected");
    }

    const factoryPDA = getFactoryPDA();

    // Calculate vault PDA (matching script.ts implementation)
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      VAULT_FACTORY_PROGRAM_ID
    );

    console.log(`${paused ? "⏸️ Pausing" : "▶️ Resuming"} Vault #${vaultIndex}...`);
    console.log("🔑 Vault PDA:", vaultPDA.toBase58());

    // Use .rpc() with skipPreflight to avoid simulation issues (matching FE implementation)
    const tx = await program.methods
      .setVaultPaused(vaultIndex, paused)
      .accountsStrict({
        admin: new PublicKey(address),
        factory: factoryPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc({
        commitment: "confirmed"
      });

    console.log(`✅ Vault ${paused ? "paused" : "resumed"}! Transaction:`, tx);

    // Wait for confirmation exactly like FE implementation
    const confirmation = await connection.confirmTransaction(tx, "confirmed");

    if (confirmation.value.err) {
      throw new Error(
        `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
      );
    }

    console.log("🎉 Transaction confirmed!");

    return tx;
  }, [program, address, getFactoryPDA, connection]);

  return {
    program,
    error,
    isConnected,
    address,
    updateFactoryFees,
    getFactoryInfo,
    getFactoryPDA,
    getVaultPDA,
    getVaultStablecoinPDA,
    readVaultLiveMetrics,
    readAccruedManagementFees,
    distributeAccruedFees,
    setVaultPaused,
  };
}