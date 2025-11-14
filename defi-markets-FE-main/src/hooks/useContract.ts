// src/hooks/useContract.ts
import { useState, useCallback, useEffect, useMemo } from "react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SendTransactionError,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { SOLANA_NETWORKS, SOLANA_RPC_URLS } from "@/lib/solana";
import { VAULT_FACTORY_PROGRAM_ID } from "@/components/solana/programIds/programids";
import { VAULT_FACTORY_IDL } from "@/components/solana/Idl/vaultFactory";

// Hardcoded stablecoin mint address (created earlier) - same as script.ts
const STABLECOIN_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

// Define interface for wallet provider
interface WalletProvider {
  sendTransaction: (
    transaction: Transaction | VersionedTransaction,
    connection: Connection
  ) => Promise<string>;
  signTransaction: (
    transaction: Transaction | VersionedTransaction
  ) => Promise<Transaction | VersionedTransaction>;
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
    async (transaction: Transaction | VersionedTransaction) => {
      if (!walletProvider || !isConnected) {
        throw new Error("Wallet not connected");
      }

      setLoading(true);
      setError(null);

      try {
        // Only mutate recentBlockhash/feePayer for legacy Transaction
        if (transaction instanceof Transaction) {
          const { blockhash } = await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = new PublicKey(address);
        }

        const signature = await (
          walletProvider as WalletProvider
        ).sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, "confirmed");

        return signature;
      } catch (err) {
        // Provide detailed logs when simulation fails
        try {
          if (err instanceof SendTransactionError) {
            // web3.js exposes getLogs() to retrieve simulation logs
            const logs = await err.getLogs(connection as Connection);
            const message = `SendTransactionError: ${err.message}${
              logs && logs.length ? `\nLogs:\n${logs.join("\n")}` : ""
            }`;
            // Surface logs in console for debugging
            // eslint-disable-next-line no-console
            console.error(message);
            setError(message as any);
            throw new Error(message);
          }
        } catch (_) {
          // Fallback: if getLogs not available or fails, proceed with original error
        }
        setError((err as any)?.message ?? "Transaction failed");
        throw err as any;
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

// Simplified hook for vault creation - based on script.ts approach
export function useVaultCreation() {
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider("solana");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);

  const connection = useMemo(
    () => new Connection(SOLANA_RPC_URLS[SOLANA_NETWORKS.MAINNET]),
    []
  );

  useEffect(() => {
    if (isConnected && address && walletProvider) {
      try {
        // Create wallet adapter exactly like script.ts
        const anchorWallet = {
          publicKey: new PublicKey(address),
          signTransaction: async <T extends Transaction | any>(
            tx: T
          ): Promise<T> => {
            const signedTx = await (
              walletProvider as WalletProvider
            ).signTransaction(tx as Transaction);
            return signedTx as T;
          },
          signAllTransactions: async <T extends Transaction | any>(
            transactions: T[]
          ): Promise<T[]> => {
            const signedTxs = await Promise.all(
              transactions.map((tx) =>
                (walletProvider as WalletProvider).signTransaction(
                  tx as Transaction
                )
              )
            );
            return signedTxs as T[];
          },
        };

        const provider = new AnchorProvider(connection, anchorWallet, {
          preflightCommitment: "processed",
        });

        // Create program instance exactly like script.ts
        const programInstance = new Program(
          VAULT_FACTORY_IDL as Idl,
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
  }, [isConnected, address, walletProvider, connection]);

  // Create vault function - exactly like script_min.ts with proper transaction handling
  const createVault = useCallback(
    async (
      vaultName: string,
      vaultSymbol: string,
      underlyingAssets: Array<{ mintAddress: PublicKey; mintBps: number }>,
      managementFees: number
    ) => {
      if (!program || !address) {
        throw new Error("Program or wallet not ready");
      }

      setLoading(true);
      setError(null);

      try {
        // console.log("🏭 Creating Vault...");

        // Derive the factory PDA exactly like script_min.ts
        const [factoryPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          VAULT_FACTORY_PROGRAM_ID
        );

        // console.log("🏭 Factory PDA:", factoryPda.toBase58());

        // Fetch factory account to get current vault count exactly like script_min.ts
        const factory = await (program as any).account.factory.fetch(
          factoryPda
        );
        const vaultIndex = factory.vaultCount;

        // console.log(`📊 Creating vault #${vaultIndex + 1}`);

        // Calculate vault PDA exactly like script_min.ts
        const [vaultPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("vault"),
            factoryPda.toBuffer(),
            new anchor.BN(vaultIndex).toArrayLike(Buffer, "le", 4),
          ],
          VAULT_FACTORY_PROGRAM_ID
        );

        const [vaultMintPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault_mint"), vaultPda.toBuffer()],
          VAULT_FACTORY_PROGRAM_ID
        );

        const [vaultTokenAccountPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault_token_account"), vaultPda.toBuffer()],
          VAULT_FACTORY_PROGRAM_ID
        );

        // console.log("🔑 Vault PDA:", vaultPda.toBase58());
        // console.log("🪙 Vault Mint PDA:", vaultMintPda.toBase58());
        // console.log(
        //   "💳 Vault Token Account PDA:",
        //   vaultTokenAccountPda.toBase58()
        // );

        // Prepare stablecoin accounts for vault creation fee
        // Factory stores vaultCreationFeeUsdc (e.g., 10000000 = 10 USDC with 6 decimals)
        const stablecoinMintForFee = STABLECOIN_MINT;

        // Get associated token addresses
        // User's stablecoin account (from which the fee will be deducted)
        const adminStablecoinAccountAddress = await getAssociatedTokenAddress(
          stablecoinMintForFee,
          new PublicKey(address), // owner (user's wallet)
          false,
          TOKEN_PROGRAM_ID
        );

        // Factory admin's stablecoin account (fee recipient)
        // Note: factory.admin and factory.feeRecipient are typically the same address
        const factoryAdminStablecoinAccountAddress =
          await getAssociatedTokenAddress(
            stablecoinMintForFee,
            factory.admin, // owner (factory admin / fee recipient)
            false,
            TOKEN_PROGRAM_ID
          );

        // console.log(
        //   "💰 Admin stablecoin account:",
        //   adminStablecoinAccountAddress.toBase58()
        // );
        // console.log(
        //   "🏭 Factory admin stablecoin account:",
        //   factoryAdminStablecoinAccountAddress.toBase58()
        // );

        // Create vault using the program method exactly like script_min.ts
        // Set compute unit limit to 400,000 to handle complex vault creation with many assets
        const tx = await (program as any).methods
          .createVault(vaultName, vaultSymbol, underlyingAssets, managementFees)
          .accountsStrict({
            admin: new PublicKey(address),
            factory: factoryPda,
            vault: vaultPda,
            vaultMint: vaultMintPda,
            vaultTokenAccount: vaultTokenAccountPda,
            stablecoinMint: stablecoinMintForFee,
            adminStablecoinAccount: adminStablecoinAccountAddress,
            factoryAdminStablecoinAccount: factoryAdminStablecoinAccountAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ])
          .rpc();

        // console.log("✅ Vault created! tx:", tx, "vault:", vaultPda.toBase58());

        // Explicitly confirm the transaction and surface on-chain errors
        try {
          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash();
          await connection.confirmTransaction(
            { signature: tx, blockhash, lastValidBlockHeight },
            "confirmed"
          );

          const txResult = await connection.getTransaction(tx, {
            commitment: "confirmed" as any,
          });

          if (txResult?.meta?.err) {
            const logs = txResult.meta?.logMessages?.join("\n") ?? "";
            throw new Error(
              `Transaction failed on-chain: ${JSON.stringify(
                txResult.meta.err
              )}${logs ? `\nLogs:\n${logs}` : ""}`
            );
          }
        } catch (confirmErr) {
          console.error("❌ Confirmation error:", confirmErr);
          throw confirmErr;
        }

        return tx;
      } catch (err) {
        console.error("❌ Vault creation error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create vault";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [program, address, connection]
  );

  return {
    createVault,
    program,
    loading,
    error,
    isConnected,
    address,
    connection,
  };
}
