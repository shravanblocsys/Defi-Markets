import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import {
  Connection,
  PublicKey,
  TransactionResponse,
  VersionedTransactionResponse,
  Keypair,
  AddressLookupTableAccount,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { ReadTransactionDto } from "./dto/read-transaction.dto";
import { UpdateFeesDto } from "./dto/update-fees.dto";
import { VaultFactoryService } from "../vault-factory/vault-factory.service";
import { ConfigService } from "../config/config.service";
import { FeesManagementService } from "../fees-management/fees-management.service";
import { UpdateVaultDepositDto } from "./dto/update-vault-deposit.dto";
import { UpdateVaultRedeemDto } from "./dto/update-vault-redeem.dto";
import { VaultDepositService } from "../vault-deposit/vault-deposit.service";
import { HistoryService } from "../history/history.service";
import { RedisService } from "../../utils/redis";
import { SwapDto } from "./dto/swap.dto";
import { RedeemSwapAdminDto } from "./dto/redeem-swap-admin.dto";

@Injectable()
export class TxEventManagementService {
  private readonly logger = new Logger(TxEventManagementService.name);

  /**
   * Determine the correct token program for a given mint
   */
  private async getTokenProgramId(
    connection: Connection,
    mint: PublicKey
  ): Promise<PublicKey> {
    try {
      const mintInfo = await connection.getAccountInfo(mint);
      if (!mintInfo) {
        console.log(
          `Mint ${mint.toBase58()} not found, defaulting to TOKEN_PROGRAM_ID`
        );
        return TOKEN_PROGRAM_ID;
      }

      // Check if it's Token-2022 program
      if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        console.log(
          `Using TOKEN_2022_PROGRAM_ID for mint ${mint.toBase58()}`
        );
        return TOKEN_2022_PROGRAM_ID;
      }

      // Default to SPL Token program
      console.log(`Using TOKEN_PROGRAM_ID for mint ${mint.toBase58()}`);
      return TOKEN_PROGRAM_ID;
    } catch (error) {
      console.log(
        `Error determining token program for ${mint.toBase58()}: ${
          error.message
        }, defaulting to TOKEN_PROGRAM_ID`
      );
      return TOKEN_PROGRAM_ID;
    }
  }
  private connection: Connection;

  // Event discriminators from your IDL
  private readonly EVENT_DISCRIMINATORS = {
    ed363f30d7c928d7: "FactoryAssetsUpdated",
    "751978fe4bec4e73": "VaultCreated", // Alternative discriminator found in actual transaction
    b42bcf021247034b: "VaultCreated",
    "978890413dd89840": "FactoryFeesUpdated",
    "97883a29bd5908f0": "FactoryFeesUpdated", // Alternative discriminator found in actual transaction
    fbdd7e1809d86367: "VaultFeesUpdated",
    "145688f675618ff0": "FactoryInitialized",
    a5227d54fb89a39b: "ProtocolFeesCollected",
    ca0c99be7ba73f0e: "FactoryStateChanged",
    "3b3e2bc8dc686443": "VaultDeposited",
  };

  constructor(
    private readonly vaultFactoryService: VaultFactoryService,
    private readonly configService: ConfigService,
    private readonly feesManagementService: FeesManagementService,
    private readonly vaultDepositService: VaultDepositService,
    private readonly historyService: HistoryService,
    private readonly redisService: RedisService
  ) {
    // Initialize Solana connection to the configured network
    // You can configure this via environment variables
    this.connection = new Connection(
      this.configService.get("SOLANA_RPC_URL"),
      "confirmed"
    );
  }

  /**
   * Execute swaps for a vault using admin wallet and Jupiter, based on amountInRaw.
   * Hardcoded RPC and Jupiter endpoints for now; reads SOLANA_ADMIN_PRIVATE_KEY when available.
   */
  async swap(dto: SwapDto): Promise<any> {
    console.log(`[DEBUG] Swap function called with dto:`, dto);

    const PROGRAM_ID = new PublicKey(
      this.configService.get("SOLANA_VAULT_FACTORY_ADDRESS")
    );
    const STABLECOIN_MINT = new PublicKey(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );
    const JUPITER_QUOTE_API =
      this.configService.get("JUPITER_QUOTE_API") ||
      "https://lite-api.jup.ag/swap/v1/quote";
    const JUPITER_SWAP_API =
      this.configService.get("JUPITER_SWAP_API") ||
      "https://lite-api.jup.ag/swap/v1/swap-instructions";

    console.log(
      `[DEBUG] Jupiter APIs - Quote: ${JUPITER_QUOTE_API}, Swap: ${JUPITER_SWAP_API}`
    );

    const rpcUrl =
      this.configService.get("SOLANA_RPC_URL") ||
      "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "processed");

    const adminKeyRaw = this.configService.get("SOLANA_ADMIN_PRIVATE_KEY");
    if (!adminKeyRaw) {
      throw new BadRequestException("Missing SOLANA_ADMIN_PRIVATE_KEY");
    }
    console.log(`[DEBUG] Admin key raw length: ${adminKeyRaw.length}`);

    let adminKeypair: Keypair;
    try {
      const secret = new Uint8Array(JSON.parse(adminKeyRaw));
      adminKeypair = Keypair.fromSecretKey(secret);
      console.log(
        `[DEBUG] Admin keypair created successfully, public key: ${adminKeypair.publicKey.toBase58()}`
      );
    } catch (e) {
      console.error(`[DEBUG] Failed to create admin keypair:`, e);
      throw new BadRequestException("Invalid SOLANA_ADMIN_PRIVATE_KEY format");
    }

    const adminWallet = new Wallet(adminKeypair);
    const provider = new AnchorProvider(connection, adminWallet, {});

    // Load IDL from bundled utils
    const idl = (await import("../../utils/idls/idls"))
      .VAULT_FACTORY_IDL as any;
    const program = new Program(idl, provider);

    const retryWithBackoff = async <T>(
      fn: () => Promise<T>,
      maxRetries = 5
    ): Promise<T> => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error) {
          console.log(
            `[DEBUG] Retry attempt ${i + 1}/${maxRetries} failed:`,
            error.message
          );
          if (i === maxRetries - 1) throw error;

          // Exponential backoff with jitter for rate limiting
          const baseDelay = 1000 * Math.pow(2, i);
          const jitter = Math.random() * 1000;
          const delay = baseDelay + jitter;
          console.log(
            `[DEBUG] Waiting ${Math.round(delay)}ms before retry...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw new Error("Max retries exceeded");
    };

    const getJupiterQuote = async (
      inputMint: PublicKey,
      outputMint: PublicKey,
      amount: bigint
    ) => {
      const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount.toString()}&slippageBps=200&onlyDirectRoutes=false&maxAccounts=64`;
      console.log(`[DEBUG] Jupiter Quote URL: ${url}`);

      const res = await fetch(url as any);
      console.log(
        `[DEBUG] Jupiter Quote Response Status: ${res.status} ${res.statusText}`
      );
      console.log(
        `[DEBUG] Jupiter Quote Response Headers:`,
        Object.fromEntries(res.headers.entries())
      );

      if (!res.ok) {
        throw new Error(
          `Jupiter quote API error: ${res.status} ${res.statusText}`
        );
      }

      const responseText = await res.text();
      console.log(
        `[DEBUG] Jupiter Quote Response Text Length: ${responseText.length}`
      );
      console.log(
        `[DEBUG] Jupiter Quote Response Text Preview: ${responseText.substring(
          0,
          500
        )}`
      );

      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from Jupiter quote API");
      }

      let data;
      try {
        data = JSON.parse(responseText);
        console.log(`[DEBUG] Jupiter Quote Parsed Successfully`);
      } catch (parseError) {
        console.error(`[DEBUG] Jupiter Quote Parse Error:`, parseError);
        throw new Error(
          `Failed to parse Jupiter quote response: ${
            parseError.message
          }. Response: ${responseText.substring(0, 200)}`
        );
      }

      if ((data as any).error)
        throw new Error(`Failed to get quote: ${(data as any).error}`);
      return data;
    };

    const getJupiterInstructions = async (
      quote: any,
      userPublicKey: PublicKey,
      destinationTokenAccount: PublicKey
    ) => {
      const body: any = {
        quoteResponse: quote,
        userPublicKey: userPublicKey.toBase58(),
        destinationTokenAccount: destinationTokenAccount.toBase58(),
      };
      console.log(`[DEBUG] Jupiter Instructions URL: ${JUPITER_SWAP_API}`);
      console.log(
        `[DEBUG] Jupiter Instructions Body:`,
        JSON.stringify(body, null, 2)
      );

      const res = await fetch(
        JUPITER_SWAP_API as any,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        } as any
      );

      console.log(
        `[DEBUG] Jupiter Instructions Response Status: ${res.status} ${res.statusText}`
      );
      console.log(
        `[DEBUG] Jupiter Instructions Response Headers:`,
        Object.fromEntries(res.headers.entries())
      );

      if (!res.ok) {
        throw new Error(
          `Jupiter instructions API error: ${res.status} ${res.statusText}`
        );
      }

      const responseText = await res.text();
      console.log(
        `[DEBUG] Jupiter Instructions Response Text Length: ${responseText.length}`
      );
      console.log(
        `[DEBUG] Jupiter Instructions Response Text Preview: ${responseText.substring(
          0,
          500
        )}`
      );

      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from Jupiter instructions API");
      }

      let data;
      try {
        data = JSON.parse(responseText);
        console.log(`[DEBUG] Jupiter Instructions Parsed Successfully`);
      } catch (parseError) {
        console.error(`[DEBUG] Jupiter Instructions Parse Error:`, parseError);
        throw new Error(
          `Failed to parse Jupiter instructions response: ${
            parseError.message
          }. Response: ${responseText.substring(0, 200)}`
        );
      }

      if ((data as any).error)
        throw new Error(
          `Failed to get swap instructions: ${(data as any).error}`
        );
      return data;
    };

    const deserializeInstruction = (ix: any) => ({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((k: any) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(ix.data, "base64"),
    });

    const getAddressLookupTableAccounts = async (
      keys: string[]
    ): Promise<AddressLookupTableAccount[]> => {
      const infos = await connection.getMultipleAccountsInfo(
        keys.map((k) => new PublicKey(k))
      );
      return infos.reduce((acc, accountInfo, idx) => {
        const addr = keys[idx];
        if (accountInfo) {
          acc.push(
            new AddressLookupTableAccount({
              key: new PublicKey(addr),
              state: AddressLookupTableAccount.deserialize(
                Uint8Array.from(accountInfo.data)
              ),
            })
          );
        }
        return acc;
      }, new Array<AddressLookupTableAccount>());
    };

    const { vaultIndex, amountInRaw } = dto;
    if (vaultIndex == null || Number.isNaN(Number(vaultIndex))) {
      throw new BadRequestException("Invalid vaultIndex");
    }
    const requestedAmount = BigInt(amountInRaw);
    if (requestedAmount <= BigInt(0)) {
      throw new BadRequestException("amountInRaw must be > 0");
    }

    // Derive PDAs
    const [factory] = PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      PROGRAM_ID
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        factory.toBuffer(),
        new BN(vaultIndex).toArrayLike(Buffer, "le", 4),
      ],
      PROGRAM_ID
    );
    const [vaultUSDCAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vault.toBuffer()],
      PROGRAM_ID
    );

    // Fetch vault state to get underlying assets
    console.log(
      `[DEBUG] Fetching vault account for vault: ${vault.toBase58()}`
    );
    const vaultAccount: any = await (program as any).account.vault.fetch(vault);
    console.log(
      `[DEBUG] Vault account fetched, underlying assets:`,
      vaultAccount.underlyingAssets
    );

    const underlying: { mint: PublicKey; bps: number }[] = (
      vaultAccount.underlyingAssets || []
    ).map((ua: any) => ({
      mint: new PublicKey(ua.mintAddress || ua.mint_address || ua.mint),
      bps: Number(ua.mintBps || ua.mint_bps || ua.pctBps || ua.bps),
    }));
    console.log(
      `[DEBUG] Processed underlying assets:`,
      underlying.map((u) => ({ mint: u.mint.toBase58(), bps: u.bps }))
    );

    if (!underlying.length)
      throw new BadRequestException("No underlying assets configured");

    // Read vault USDC balance like in admin_swaps.ts and clamp the requested amount
    const vaultUSDC = await getAccount(connection, vaultUSDCAccount);
    const totalUSDC = BigInt(vaultUSDC.amount.toString());
    if (totalUSDC === BigInt(0)) {
      return {
        vaultIndex,
        amountInRaw: requestedAmount.toString(),
        swaps: [],
        note: "Vault USDC balance is 0; nothing to swap.",
      };
    }
    const amountToUse =
      requestedAmount > totalUSDC ? totalUSDC : requestedAmount;

    // Ensure admin USDC ATA
    const adminUSDC = await getAssociatedTokenAddress(
      STABLECOIN_MINT,
      adminWallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const results: any[] = [];

    for (let i = 0; i < underlying.length; i++) {
      const { mint: assetMint, bps } = underlying[i];
      const assetAmount = (amountToUse * BigInt(bps)) / BigInt(10000);
      console.log(
        `[DEBUG] Processing asset ${i + 1}/${
          underlying.length
        }: ${assetMint.toBase58()}, bps: ${bps}, amount: ${assetAmount.toString()}`
      );

      if (assetAmount === BigInt(0)) {
        console.log(
          `[DEBUG] Skipping asset ${assetMint.toBase58()} - amount is 0`
        );
        continue;
      }

      const tokenProgramId = await this.getTokenProgramId(
        connection,
        assetMint
      );

      // Derive/create vault ATA for asset
      const vaultAssetAccount = await getAssociatedTokenAddress(
        assetMint,
        vault,
        true,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const vaultAssetInfo = await connection.getAccountInfo(vaultAssetAccount);
      if (!vaultAssetInfo) {
        console.log(
          `Creating ATA for ${assetMint.toBase58()} with token program ${tokenProgramId.toBase58()}`
        );
        const createIx = createAssociatedTokenAccountInstruction(
          adminWallet.publicKey,
          vaultAssetAccount,
          vault,
          assetMint,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        await provider.sendAndConfirm(
          new (await import("@solana/web3.js")).Transaction().add(createIx),
          []
        );
        console.log(`ATA created successfully for ${assetMint.toBase58()}`);
      }

      // Transfer USDC from vault to admin
      const transferSig = await (program as any).methods
        .transferVaultToUser(new BN(vaultIndex), new BN(assetAmount.toString()))
        .accountsStrict({
          user: adminWallet.publicKey,
          factory,
          vault,
          vaultStablecoinAccount: vaultUSDCAccount,
          userStablecoinAccount: adminUSDC,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Jupiter swap USDC -> asset into vault's ATA
      console.log(
        `[DEBUG] Getting Jupiter quote for ${STABLECOIN_MINT.toBase58()} -> ${assetMint.toBase58()}, amount: ${assetAmount.toString()}`
      );
      let quote;
      try {
        quote = await retryWithBackoff(() =>
          getJupiterQuote(STABLECOIN_MINT, assetMint, assetAmount)
        );
        console.log(`[DEBUG] Jupiter quote received successfully`);
      } catch (quoteError) {
        console.log(
          `[DEBUG] Failed to get quote for ${assetMint.toBase58()}: ${
            quoteError.message
          }. Skipping this asset.`
        );
        continue; // Skip this asset if we can't get a quote
      }

      console.log(`[DEBUG] Getting Jupiter instructions for swap`);
      let instructions;
      try {
        instructions = await retryWithBackoff(() =>
          getJupiterInstructions(
            quote,
            adminWallet.publicKey,
            vaultAssetAccount
          )
        );
        console.log(`[DEBUG] Jupiter instructions received successfully`);
      } catch (instructionsError) {
        console.log(
          `[DEBUG] Failed to get instructions for ${assetMint.toBase58()}: ${
            instructionsError.message
          }. Skipping this asset.`
        );
        continue; // Skip this asset if we can't get instructions
      }

      const swapInstruction = deserializeInstruction(
        instructions.swapInstruction
      );
      const swapIxs: any[] = [];

      // Add dynamic compute unit limits based on swap complexity
      const getComputeUnitConfig = (quote: any) => {
        // Check if it's a complex swap (multiple hops, large amount)
        const isComplexSwap =
          quote.routePlan?.length > 2 ||
          BigInt(quote.inAmount || 0) > BigInt(1_000_000); // > 1 USDC

        if (isComplexSwap) {
          console.log(`[DEBUG] Complex swap detected, using high CU limit`);
          return {
            units: 2_000_000, // 2M CU for complex swaps
            microLamports: 1000, // Higher priority fee
          };
        } else {
          console.log(
            `[DEBUG] Simple swap detected, using standard CU limit`
          );
          return {
            units: 1_500_000, // 1.5M CU for simple swaps
            microLamports: 500, // Lower priority fee
          };
        }
      };

      const cuConfig = getComputeUnitConfig(quote);
      swapIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: cuConfig.units })
      );
      swapIxs.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: cuConfig.microLamports,
        })
      );

      if (instructions.setupInstructions?.length)
        instructions.setupInstructions.forEach((ix: any) =>
          swapIxs.push(deserializeInstruction(ix))
        );
      // Skip Jupiter's computeBudgetInstructions to avoid duplicates
      // if (instructions.computeBudgetInstructions?.length) instructions.computeBudgetInstructions.forEach((ix: any) => swapIxs.push(deserializeInstruction(ix)));
      swapIxs.push(
        new TransactionInstruction({
          programId: swapInstruction.programId,
          keys: swapInstruction.keys,
          data: swapInstruction.data,
        })
      );
      if (instructions.cleanupInstruction)
        swapIxs.push(deserializeInstruction(instructions.cleanupInstruction));

      const alts: AddressLookupTableAccount[] = instructions
        .addressLookupTableAddresses?.length
        ? await getAddressLookupTableAccounts(
            instructions.addressLookupTableAddresses
          )
        : [];

      console.log(
        `[DEBUG] Building transaction for ${assetMint.toBase58()} with ${
          swapIxs.length
        } instructions`
      );

      const blockhash = (await connection.getLatestBlockhash()).blockhash;
      const messageV0 = new TransactionMessage({
        payerKey: adminWallet.publicKey,
        recentBlockhash: blockhash,
        instructions: swapIxs,
      }).compileToV0Message(alts);
      const vtx = new VersionedTransaction(messageV0);
      const signed = await adminWallet.signTransaction(vtx);

      console.log(
        `[DEBUG] Sending swap transaction for ${assetMint.toBase58()}`
      );
      const sig = await retryWithBackoff(
        () =>
          connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: false,
            preflightCommitment: "processed",
          }),
        5
      );
      console.log(`[DEBUG] Swap transaction sent: ${sig}`);

      console.log(
        `[DEBUG] Confirming swap transaction for ${assetMint.toBase58()}`
      );
      await retryWithBackoff(
        () => connection.confirmTransaction(sig, "processed"),
        3
      );
      console.log(`[DEBUG] Swap transaction confirmed: ${sig}`);

      // Create history record for swap per asset (admin as performer if available)
      try {
        const adminProfile = await this.vaultDepositService[
          "profileService"
        ].getByWalletAddress(adminWallet.publicKey.toBase58());
        const vaultFactory = await this.vaultFactoryService.findByAddress(
          vault.toBase58()
        );
        if (adminProfile && vaultFactory) {
          await this.historyService.createTransactionHistory(
            "swap_completed",
            `Swap completed: ${assetAmount.toString()} USDC -> ${assetMint.toBase58()} for vault index ${vaultIndex}`,
            adminProfile._id.toString(),
            vaultFactory._id.toString(),
            {
              vaultIndex,
              vaultAddress: vault.toBase58(),
              assetMint: assetMint.toBase58(),
              usdcPortion: assetAmount.toString(),
              transferSig,
              swapSig: sig,
            },
            sig
          );
        }
      } catch (historyError) {
        console.log(
          `Failed to create swap history: ${historyError.message}`
        );
      }

      results.push({
        assetMint: assetMint.toBase58(),
        usdcPortion: assetAmount.toString(),
        transferSig,
        swapSig: sig,
      });

      // Add delay between assets to avoid rate limiting
      if (i < underlying.length - 1) {
        const delay = 2000 + Math.random() * 1000; // 2-3 seconds
        console.log(
          `[DEBUG] Waiting ${Math.round(
            delay
          )}ms before processing next asset...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    await this.clearCache();
    return {
      vaultIndex,
      amountRequested: requestedAmount.toString(),
      amountUsed: amountToUse.toString(),
      vaultUsdcBalance: totalUSDC.toString(),
      swaps: results,
    };
  }

  /**
   * Admin redeem-swap: withdraw underlying to admin, swap to USDC into vault USDC PDA
   */
  async redeemSwapAdmin(dto: RedeemSwapAdminDto): Promise<any> {
    const PROGRAM_ID = new PublicKey(
      "5tAdLifeaGj3oUVVpr7gG5ntjW6c2Lg3sY2ftBCi8MkZ"
    );
    const STABLECOIN_MINT = new PublicKey(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );
    const JUPITER_QUOTE_API =
      this.configService.get("JUPITER_QUOTE_API") ||
      "https://lite-api.jup.ag/swap/v1/quote";
    const JUPITER_SWAP_API =
      this.configService.get("JUPITER_SWAP_API") ||
      "https://lite-api.jup.ag/swap/v1/swap-instructions";

    const rpcUrl =
      this.configService.get("SOLANA_RPC_URL") ||
      "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "processed");
    console.log(`🌐 Using RPC URL: ${rpcUrl}`);
    console.log(`🔗 Connection commitment: processed`);

    const adminKeyRaw = this.configService.get("SOLANA_ADMIN_PRIVATE_KEY");
    if (!adminKeyRaw)
      throw new BadRequestException("Missing SOLANA_ADMIN_PRIVATE_KEY");
    let adminKeypair: Keypair;
    try {
      const secret = new Uint8Array(JSON.parse(adminKeyRaw));
      adminKeypair = Keypair.fromSecretKey(secret);
    } catch {
      throw new BadRequestException("Invalid SOLANA_ADMIN_PRIVATE_KEY format");
    }
    const adminWallet = new Wallet(adminKeypair);
    const provider = new AnchorProvider(connection, adminWallet, {});
    const idl = (await import("../../utils/idls/idls"))
      .VAULT_FACTORY_IDL as any;
    const program = new Program(idl, provider);

    const retryWithBackoff = async <T>(
      fn: () => Promise<T>,
      maxRetries = 5
    ): Promise<T> => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i === maxRetries - 1) throw error;

          // Exponential backoff with jitter for rate limiting
          const baseDelay = 1000 * Math.pow(2, i);
          const jitter = Math.random() * 1000;
          const delay = baseDelay + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw new Error("Max retries exceeded");
    };
    const getJupiterQuote = async (
      inputMint: PublicKey,
      outputMint: PublicKey,
      amount: bigint
    ) => {
      const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount.toString()}&slippageBps=200&onlyDirectRoutes=false&maxAccounts=64`;
      const res = await fetch(url as any);

      if (!res.ok) {
        throw new Error(
          `Jupiter quote API error: ${res.status} ${res.statusText}`
        );
      }

      const responseText = await res.text();
      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from Jupiter quote API");
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(
          `Failed to parse Jupiter quote response: ${
            parseError.message
          }. Response: ${responseText.substring(0, 200)}`
        );
      }

      if ((data as any).error)
        throw new BadRequestException(`Quote error: ${(data as any).error}`);
      return data;
    };
    const getJupiterInstructions = async (
      quote: any,
      userPublicKey: PublicKey,
      destinationTokenAccount: PublicKey
    ) => {
      const body: any = {
        quoteResponse: quote,
        userPublicKey: userPublicKey.toBase58(),
        destinationTokenAccount: destinationTokenAccount.toBase58(),
      };

      const res = await fetch(
        JUPITER_SWAP_API as any,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        } as any
      );

      if (!res.ok) {
        throw new Error(
          `Jupiter instructions API error: ${res.status} ${res.statusText}`
        );
      }

      const responseText = await res.text();
      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from Jupiter instructions API");
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(
          `Failed to parse Jupiter instructions response: ${
            parseError.message
          }. Response: ${responseText.substring(0, 200)}`
        );
      }

      if ((data as any).error)
        throw new BadRequestException(
          `Swap build error: ${(data as any).error}`
        );
      return data;
    };
    const deserializeInstruction = (ix: any) => ({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((k: any) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(ix.data, "base64"),
    });
    const getAddressLookupTableAccounts = async (
      keys: string[]
    ): Promise<AddressLookupTableAccount[]> => {
      const infos = await connection.getMultipleAccountsInfo(
        keys.map((k) => new PublicKey(k))
      );
      return infos.reduce((acc, accountInfo, idx) => {
        const addr = keys[idx];
        if (accountInfo)
          acc.push(
            new AddressLookupTableAccount({
              key: new PublicKey(addr),
              state: AddressLookupTableAccount.deserialize(
                Uint8Array.from(accountInfo.data)
              ),
            })
          );
        return acc;
      }, new Array<AddressLookupTableAccount>());
    };

    const { vaultIndex, vaultTokenAmount } = dto;
    console.log("[redeemSwapAdmin] input dto", {
      vaultIndex,
      vaultTokenAmount,
    });
    console.log("[program id]", PROGRAM_ID);
    const [factory] = PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      PROGRAM_ID
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        factory.toBuffer(),
        new BN(vaultIndex).toArrayLike(Buffer, "le", 4),
      ],
      PROGRAM_ID
    );
    const [vaultUSDC] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vault.toBuffer()],
      PROGRAM_ID
    );
    console.log("[redeemSwapAdmin] PDAs", {
      factory: factory.toBase58(),
      vault: vault.toBase58(),
      vaultUSDC: vaultUSDC.toBase58(),
    });

    // Fetch vault account and underlying
    console.log(
      `\n🔍 Fetching vault account for vault: ${vault.toBase58()}`
    );
    const vaultAccount: any = await (program as any).account.vault.fetch(vault);
    console.log(
      `📋 Raw vault account data:`,
      JSON.stringify(vaultAccount, null, 2)
    );

    // Helper function to get token decimals
    const getTokenDecimals = async (
      mintAddress: PublicKey
    ): Promise<number> => {
      try {
        const mintInfo = await connection.getAccountInfo(mintAddress);
        if (!mintInfo) return 6; // Default to 6 decimals

        // Parse mint account data to get decimals
        const data = mintInfo.data;
        const decimals = data[44]; // Decimals is at offset 44 in mint account
        return decimals || 6;
      } catch (error) {
        console.warn(
          `Warning: Could not fetch decimals for ${mintAddress.toBase58()}, defaulting to 6`
        );
        return 6;
      }
    };

    console.log("\n🔍 Reading Vault Allocation for Redeem Swap:");
    console.log(`📊 Vault State:`);
    console.log(
      `  Total Assets: ${vaultAccount.totalAssets?.toString?.()} ($${(
        Number(vaultAccount.totalAssets) / 1_000_000
      ).toFixed(6)} USD)`
    );
    console.log(`  Management Fees: ${vaultAccount.managementFees} bps`);
    console.log(`  Admin: ${vaultAccount.admin?.toBase58?.()}`);

    // Get underlying assets with detailed balance information
    console.log(`\n🏦 Underlying Assets:`);
    const underlying: {
      mint: PublicKey;
      bps: number;
      balance: bigint;
      decimals: number;
    }[] = [];

    for (let i = 0; i < (vaultAccount.underlyingAssets || []).length; i++) {
      const asset = vaultAccount.underlyingAssets[i];
      const mintAddress = new PublicKey(
        asset.mintAddress || asset.mint_address || asset.mint
      );

      if (mintAddress.toBase58() !== "11111111111111111111111111111111") {
        console.log(`  Asset ${i}:`);
        console.log(`    Mint: ${mintAddress.toBase58()}`);
        console.log(
          `    Allocation: ${
            asset.mintBps || asset.mint_bps || asset.pctBps || asset.bps
          } bps (${(
            (asset.mintBps || asset.mint_bps || asset.pctBps || asset.bps) / 100
          ).toFixed(2)}%)`
        );

        // Get token account balance with decimals
        let balance = BigInt(0);
        let decimals = 6;
        try {
          const assetTokenProgram = await this.getTokenProgramId(
            connection,
            mintAddress
          );
          const tokenAccount = await getAssociatedTokenAddress(
            mintAddress,
            vault,
            true,
            assetTokenProgram,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

          console.log(`    Token Account: ${tokenAccount.toBase58()}`);
          console.log(`    Token Program: ${assetTokenProgram.toBase58()}`);

          const accountInfo = await getAccount(connection, tokenAccount);
          balance = BigInt(accountInfo.amount.toString());
          decimals = await getTokenDecimals(mintAddress);

          console.log(
            `    Balance: ${balance.toString()} (${(
              Number(balance) / Math.pow(10, decimals)
            ).toFixed(6)} tokens)`
          );
        } catch (e) {
          console.log(
            `    Balance: Account not found or error - ${e.message}`
          );
        }

        underlying.push({
          mint: mintAddress,
          bps: Number(
            asset.mintBps || asset.mint_bps || asset.pctBps || asset.bps
          ),
          balance: balance,
          decimals: decimals,
        });
      }
    }

    // Get vault stablecoin balance
    console.log(`\n💰 Vault Stablecoin Balance:`);
    try {
      const stableBalance = await getAccount(connection, vaultUSDC);
      const stablecoinMint = stableBalance.mint;
      const stablecoinDecimals = await getTokenDecimals(stablecoinMint);
      console.log(
        `  ${stablecoinMint.toBase58()}: ${stableBalance.amount.toString()} (${(
          Number(stableBalance.amount) / Math.pow(10, stablecoinDecimals)
        ).toFixed(6)} tokens)`
      );
    } catch (e) {
      console.log(`  Stablecoin Balance: Account not found or error`);
    }

    console.log("\n[redeemSwapAdmin] vaultAccount totals", {
      totalAssets: vaultAccount.totalAssets?.toString?.(),
      totalSupply: vaultAccount.totalSupply?.toString?.(),
      underlyingCount: underlying.length,
    });

    // Determine factory admin (recipient of withdraws)
    const factoryAccount: any = await (program as any).account.factory.fetch(
      factory
    );
    const factoryAdminPubkey = new PublicKey(factoryAccount.admin);

    // Safety check: env admin must be factory admin to sign withdraws
    if (!adminWallet.publicKey.equals(factoryAdminPubkey)) {
      console.log(
        `SOLANA_ADMIN_PRIVATE_KEY pubkey ${adminWallet.publicKey.toBase58()} does not match factory admin ${factoryAdminPubkey.toBase58()}. Withdraw will fail constraints.`
      );
    }

    // Determine token program for USDC (should be SPL Token)
    const usdcTokenProgram = await this.getTokenProgramId(
      connection,
      STABLECOIN_MINT
    );

    // Ensure admin USDC ATA (recipient = factory admin)
    const adminUSDC = await getAssociatedTokenAddress(
      STABLECOIN_MINT,
      factoryAdminPubkey,
      false,
      usdcTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const results: any[] = [];

    // Price-based calculation: Calculate USD value and split by real-time prices
    const requestedShares = BigInt(vaultTokenAmount);
    const totalAssets: bigint = BigInt(
      vaultAccount.totalAssets?.toString?.() || "0"
    );
    const totalSupply: bigint = BigInt(
      vaultAccount.totalSupply?.toString?.() || "0"
    );

    // IMPORTANT: Use FULL input amount for calculations - NO fee deduction here!
    // Smart contract will handle fee deduction during FinalizeRedeem
    const sharePriceUSD = 1; // 1 share = 1 USDC unit
    const totalValueUSD = Number(requestedShares); // Use FULL requested amount

    console.log(
      "[redeemSwapAdmin] FULL AMOUNT CALCULATION (no pre-deduction)",
      {
        inputVaultTokenAmount: vaultTokenAmount,
        requestedShares: requestedShares.toString(),
        totalAssets: totalAssets.toString(),
        totalSupply: totalSupply.toString(),
        sharePriceUSD: sharePriceUSD.toString(),
        totalValueUSD: totalValueUSD.toString(),
        note: "Using FULL amount - smart contract will deduct fees later",
      }
    );

    // Helper function to get asset price in USD using Jupiter price API
    const getAssetPriceUSD = async (assetMint: PublicKey): Promise<bigint> => {
      try {
        const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${assetMint.toBase58()}`;
        const response = await retryWithBackoff(() => fetch(priceUrl));

        if (!response.ok) {
          throw new Error(
            `Jupiter price API error: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        const priceData = data[assetMint.toBase58()];

        if (!priceData || !priceData.usdPrice) {
          throw new Error(`No price data found for ${assetMint.toBase58()}`);
        }

        // Convert USD price to BigInt (multiply by 1e6 for 6 decimals)
        const usdPrice = Math.floor(priceData.usdPrice * 1000000);
        return BigInt(usdPrice);
      } catch (error) {
        this.logger.warn(
          `Failed to get price for ${assetMint.toBase58()}: ${error.message}`
        );
        return BigInt(0);
      }
    };

    for (let i = 0; i < underlying.length; i++) {
      const asset = underlying[i];
      const assetTokenProgram = await this.getTokenProgramId(
        connection,
        asset.mint
      );
      const vaultAsset = await getAssociatedTokenAddress(
        asset.mint,
        vault,
        true,
        assetTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Use the accurate balance from vault reading (already includes decimals handling)
      const vaultAssetAmount = asset.balance;
      if (vaultAssetAmount === BigInt(0)) continue;

      // Calculate USD allocation for this asset based on allocation percentage
      // Using FULL input amount - no fee deduction here!
      const assetUSDAllocation = Math.floor(
        (totalValueUSD * asset.bps) / 10000
      );

      console.log(`[redeemSwapAdmin] Asset ${i} allocation calculation:`, {
        assetMint: asset.mint.toBase58(),
        bps: asset.bps,
        totalValueUSD: totalValueUSD,
        assetUSDAllocation: assetUSDAllocation,
        calculation: `(${totalValueUSD} * ${asset.bps}) / 10000 = ${assetUSDAllocation}`,
        note: "Using FULL input amount for allocation",
      });

      // Get real-time price for this asset (price per 1 token in USDC)
      const assetPriceUSD = await getAssetPriceUSD(asset.mint);
      if (assetPriceUSD === BigInt(0)) {
        console.log(
          `Skipping ${asset.mint.toBase58()} - unable to get price`
        );
        continue;
      }

      // Calculate token amount needed: USD allocation / price per token
      // Note: assetPriceUSD is price for 1 token (with 6 decimals), so we need to adjust
      // Use the actual decimals from vault reading for accurate calculation
      const tokenAmountNeeded = Math.floor(
        (assetUSDAllocation * Math.pow(10, asset.decimals)) /
          Number(assetPriceUSD)
      );

      // Withdraw at most what's available in vault for this asset
      const withdrawAmount =
        BigInt(tokenAmountNeeded) > vaultAssetAmount
          ? vaultAssetAmount
          : BigInt(tokenAmountNeeded);
      if (withdrawAmount === BigInt(0)) continue;

      // For program compatibility, use targetByAllocation name but with price-based value
      const targetByAllocation = withdrawAmount; // This is now the price-calculated amount

      console.log("[redeemSwapAdmin] asset leg (price-based)", {
        assetMint: asset.mint.toBase58(),
        vaultAssetAta: vaultAsset.toBase58(),
        vaultAssetAmount: vaultAssetAmount.toString(),
        vaultAssetAmountTokens: (
          Number(vaultAssetAmount) / Math.pow(10, asset.decimals)
        ).toFixed(6),
        decimals: asset.decimals,
        bps: asset.bps,
        assetUSDAllocation: assetUSDAllocation.toString(),
        assetPriceUSD: assetPriceUSD.toString(),
        tokenAmountNeeded: tokenAmountNeeded.toString(),
        tokenAmountNeededTokens: (
          Number(tokenAmountNeeded) / Math.pow(10, asset.decimals)
        ).toFixed(6),
        vaultTokenAmountForWithdraw: targetByAllocation.toString(), // Full amount passed to withdrawUnderlyingToUser
        withdrawAmount: withdrawAmount.toString(),
        withdrawAmountTokens: (
          Number(withdrawAmount) / Math.pow(10, asset.decimals)
        ).toFixed(6),
        note: "withdrawUnderlyingToUser uses FULL vaultTokenAmount, swap uses calculated withdrawAmount",
      });

      // Ensure admin ATA for this asset exists (owner = factory admin)
      const adminAssetAta = await getAssociatedTokenAddress(
        asset.mint,
        factoryAdminPubkey,
        false,
        assetTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const adminAssetInfo = await connection.getAccountInfo(adminAssetAta);
      if (!adminAssetInfo) {
        const createIx = createAssociatedTokenAccountInstruction(
          adminWallet.publicKey,
          adminAssetAta,
          factoryAdminPubkey,
          asset.mint,
          assetTokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const createTx = new (
          await import("@solana/web3.js")
        ).Transaction().add(createIx);
        await provider.sendAndConfirm(createTx, []);
      }

      // Withdraw to admin using FULL vault token amount (1 USDC = 1,000,000)
      // Smart contract will handle fee deduction during FinalizeRedeem
      await (program as any).methods
        .withdrawUnderlyingToUser(
          new BN(vaultIndex),
          new BN(targetByAllocation.toString())
        )
        .accountsStrict({
          user: factoryAdminPubkey,
          factory,
          vault,
          vaultAssetAccount: vaultAsset,
          userAssetAccount: adminAssetAta,
          tokenProgram: assetTokenProgram,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Swap admin asset -> USDC into vault USDC PDA
      let quote;
      try {
        quote = await retryWithBackoff(() =>
          getJupiterQuote(asset.mint, STABLECOIN_MINT, targetByAllocation)
        );
        const outAmount =
          quote && (quote.outAmount || quote.otherAmountThreshold)
            ? quote.outAmount || quote.otherAmountThreshold
            : undefined;
        console.log("[redeemSwapAdmin] quote", {
          inputMint: asset.mint.toBase58(),
          outAmount,
        });
      } catch (quoteError) {
        console.log(
          `[redeemSwapAdmin] Failed to get quote for ${asset.mint.toBase58()}: ${
            quoteError.message
          }. Skipping this asset.`
        );
        continue; // Skip this asset if we can't get a quote
      }

      let instructions;
      try {
        instructions = await retryWithBackoff(() =>
          getJupiterInstructions(quote, factoryAdminPubkey, vaultUSDC)
        );
      } catch (instructionsError) {
        console.log(
          `[redeemSwapAdmin] Failed to get instructions for ${asset.mint.toBase58()}: ${
            instructionsError.message
          }. Skipping this asset.`
        );
        continue; // Skip this asset if we can't get instructions
      }
      const swapIxs: TransactionInstruction[] = [];

      // Add dynamic compute unit limits based on swap complexity
      const getComputeUnitConfig = (quote: any) => {
        // Check if it's a complex swap (multiple hops, large amount)
        const isComplexSwap =
          quote.routePlan?.length > 2 ||
          BigInt(quote.inAmount || 0) > BigInt(1_000_000); // > 1 USDC

        if (isComplexSwap) {
          console.log(
            `[redeemSwapAdmin] Complex swap detected, using high CU limit`
          );
          return {
            units: 2_000_000, // 2M CU for complex swaps
            microLamports: 1000, // Higher priority fee
          };
        } else {
          console.log(
            `[redeemSwapAdmin] Simple swap detected, using standard CU limit`
          );
          return {
            units: 1_500_000, // 1.5M CU for simple swaps
            microLamports: 500, // Lower priority fee
          };
        }
      };

      const cuConfig = getComputeUnitConfig(quote);
      swapIxs.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: cuConfig.units })
      );
      swapIxs.push(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: cuConfig.microLamports,
        })
      );

      if (instructions.setupInstructions?.length)
        swapIxs.push(
          ...instructions.setupInstructions.map(deserializeInstruction)
        );
      // Skip Jupiter's computeBudgetInstructions to avoid duplicates
      // if (instructions.computeBudgetInstructions?.length) swapIxs.push(...instructions.computeBudgetInstructions.map(deserializeInstruction));
      swapIxs.push(deserializeInstruction(instructions.swapInstruction));
      if (instructions.cleanupInstruction)
        swapIxs.push(deserializeInstruction(instructions.cleanupInstruction));
      console.log(
        `[redeemSwapAdmin] Building transaction for ${asset.mint.toBase58()} with ${
          swapIxs.length
        } instructions`
      );

      const lutAddrs: string[] = instructions.addressLookupTableAddresses || [];
      const alts = await getAddressLookupTableAccounts(lutAddrs);
      const { blockhash } = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: factoryAdminPubkey,
        recentBlockhash: blockhash,
        instructions: swapIxs,
      }).compileToV0Message(alts);
      const vtx = new VersionedTransaction(messageV0);
      vtx.sign([adminKeypair]);
      const sig = await retryWithBackoff(
        () =>
          connection.sendRawTransaction(vtx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          }),
        5
      );
      await retryWithBackoff(
        () => connection.confirmTransaction(sig, "confirmed"),
        3
      );
      results.push({
        mint: asset.mint.toBase58(),
        input: targetByAllocation.toString(),
        sig,
      });

      // History: per-leg executed (use existing action name)
      try {
        const vf = await this.vaultFactoryService.findByAddress(
          vault.toBase58()
        );
        await this.historyService.createTransactionHistory(
          "swap_completed",
          `Admin redeem swap executed for ${asset.mint.toBase58()} -> USDC`,
          undefined,
          vf?._id?.toString(),
          {
            vaultIndex,
            vaultAddress: vault.toBase58(),
            assetMint: asset.mint.toBase58(),
            inputAmount: targetByAllocation.toString(),
          },
          sig
        );
      } catch (e) {
        console.log(`Failed to write per-leg history: ${e?.message}`);
      }

      // Add delay between assets to avoid rate limiting
      if (i < underlying.length - 1) {
        const delay = 2000 + Math.random() * 1000; // 2-3 seconds
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // After swaps, compute whether vault USDC can cover requested shares and suggest adjusted amount
    const latestVaultAcc: any = await (program as any).account.vault.fetch(
      vault
    );
    const totalAssetsAfter: bigint = BigInt(
      latestVaultAcc.totalAssets?.toString?.() || "0"
    );
    const totalSupplyAfter: bigint = BigInt(
      latestVaultAcc.totalSupply?.toString?.() || "0"
    );
    const vaultUsdcAcc = await getAccount(connection, vaultUSDC);
    const vaultUsdcBalance: bigint = BigInt(vaultUsdcAcc.amount.toString());

    // In price-based mode, calculate required USDC (1 share = 1 USDC unit)
    const sharePriceAfter = 1; // 1 share = 1 USDC unit
    const requiredUsdc = requestedShares; // Direct conversion since 1 share = 1 USDC
    let adjustedVaultTokenAmount = requestedShares;

    // If vault USDC balance is insufficient, adjust the redeemable amount
    if (vaultUsdcBalance < requiredUsdc) {
      adjustedVaultTokenAmount = vaultUsdcBalance; // Can only redeem what's available in USDC
    }

    console.log("[redeemSwapAdmin] post-swap state (price-based)", {
      totalAssetsAfter: totalAssetsAfter.toString(),
      totalSupplyAfter: totalSupplyAfter.toString(),
      sharePriceAfter: sharePriceAfter.toString(),
      vaultUsdcBalance: vaultUsdcBalance.toString(),
      requiredUsdc: requiredUsdc.toString(),
      adjustedVaultTokenAmount: adjustedVaultTokenAmount.toString(),
    });

    // Summary: Confirm we used FULL input amount
    console.log("[redeemSwapAdmin] REDEEM SWAP SUMMARY:", {
      inputAmount: vaultTokenAmount,
      totalValueUsed: totalValueUSD,
      swapsExecuted: results.length,
      totalUSDCGenerated: vaultUsdcBalance.toString(),
      note: "FULL input amount used - smart contract will deduct fees during FinalizeRedeem",
    });

    // History: batch completed (use existing action name)
    try {
      const vf = await this.vaultFactoryService.findByAddress(vault.toBase58());
      await this.historyService.createTransactionHistory(
        "swap_completed",
        `Admin redeem swaps completed for vault index ${vaultIndex}`,
        undefined,
        vf?._id?.toString(),
        {
          vaultIndex,
          vaultAddress: vault.toBase58(),
          legs: results.length,
          vaultUsdcBalance: vaultUsdcBalance.toString(),
          requiredUsdc: requiredUsdc.toString(),
          adjustedVaultTokenAmount: adjustedVaultTokenAmount.toString(),
        }
      );
    } catch (e) {
      console.log(
        `Failed to write batch-completed history: ${e?.message}`
      );
    }

    await this.clearCache();
    return {
      vaultIndex,
      vaultTokenAmount,
      swaps: results,
      vaultUsdcBalance: vaultUsdcBalance.toString(),
      requiredUsdc: requiredUsdc.toString(),
      adjustedVaultTokenAmount: adjustedVaultTokenAmount.toString(),
      sharePriceAfter: sharePriceAfter.toString(),
      totalValueUSD: totalValueUSD.toString(),
      mode: "price-based",
    };
  }

  async readTransaction(transactionDto: ReadTransactionDto): Promise<any> {
    try {
      const { transactionSignature, bannerUrl, logoUrl, description } =
        transactionDto;

      // Reading transaction from blockchain
      console.log(`Fetching transaction: ${transactionSignature}`);

      // Fetch transaction details from Solana blockchain
      // Let Solana RPC validate the signature format and existence
      const transaction = await this.connection.getTransaction(
        transactionSignature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }
      );

      if (!transaction) {
        throw new BadRequestException("Transaction not found on blockchain");
      }

      // Extract and decode program data
      const programData = this.extractProgramLogs(transaction);
      console.log("programData", programData);

      // Extract structured vault data from program logs
      const structuredVaultData = this.extractStructuredVaultData(programData);
      console.log("Structured Vault Data:", structuredVaultData);

      // Log formatted vault data for better readability
      this.logFormattedVaultData(structuredVaultData);
      // Transaction data decoded successfully

      // Process VaultCreated events and create vault factory records
      const vaultCreationResults = await this.processVaultCreatedEvents(
        structuredVaultData,
        bannerUrl,
        logoUrl,
        description
      );

      // Return vault factory creation results
      return vaultCreationResults;
    } catch (error) {
      console.log(
        `Error reading transaction: ${error.message}`,
        error.stack
      );

      // Handle specific Solana RPC errors
      if (error.message?.includes("Invalid transaction signature")) {
        throw new BadRequestException("Invalid transaction signature format");
      }

      if (
        error.message?.includes("Transaction not found") ||
        error.message?.includes("not found")
      ) {
        throw new BadRequestException("Transaction not found on blockchain");
      }

      if (error.message?.includes("RPC")) {
        throw new BadRequestException("Failed to connect to Solana blockchain");
      }

      // Re-throw other errors
      throw error;
    }
  }

  private extractProgramLogs(
    transaction: TransactionResponse | VersionedTransactionResponse
  ): string[] {
    const logs: string[] = [];

    if (transaction.meta?.logMessages) {
      // Filter for program logs (instructions executed by programs)
      transaction.meta.logMessages.forEach((log) => {
        if (log.startsWith("Program log:")) {
          logs.push(log);
        } else if (log.startsWith("Program ")) {
          // Also include program instruction logs
          logs.push(log);
        }
      });
    }

    return logs;
  }

  private extractStructuredVaultData(programLogs: string[]): any {
    const vaultData: any = {
      vaultName: null,
      vaultSymbol: null,
      vaultIndex: null,
      managementFees: null,
      underlyingAssets: [],
      factoryKey: null,
      vaultPda: null,
      vaultAdmin: null,
      vaultMintPda: null,
      vaultTokenAccountPda: null,
      createdAt: null,
      totalBpsAllocation: null,
      assetsCount: null,
    };

    programLogs.forEach((log) => {
      // Extract vault name
      if (log.includes("📝 Vault Name:")) {
        const match = log.match(/📝 Vault Name: (.+)/);
        if (match) {
          vaultData.vaultName = match[1].trim();
        }
      }

      // Extract vault symbol
      if (log.includes("🏷️ Vault Symbol:")) {
        const match = log.match(/🏷️ Vault Symbol: (.+)/);
        if (match) {
          vaultData.vaultSymbol = match[1].trim();
        }
      }

      // Extract management fees
      if (log.includes("💰 Management Fees:")) {
        const match = log.match(/💰 Management Fees: (\d+) bps/);
        if (match) {
          vaultData.managementFees = {
            bps: parseInt(match[1]),
            percentage: (parseInt(match[1]) / 100).toFixed(2) + "%",
          };
        }
      }

      // Extract number of underlying assets
      if (log.includes("📊 Number of underlying assets:")) {
        const match = log.match(/📊 Number of underlying assets: (\d+)/);
        if (match) {
          vaultData.assetsCount = parseInt(match[1]);
        }
      }

      // Extract underlying assets
      if (
        log.includes("Asset ") &&
        log.includes("Mint=") &&
        log.includes("BPS=")
      ) {
        const match = log.match(/Asset \d+: Mint=([A-Za-z0-9]+), BPS=(\d+)/);
        if (match) {
          vaultData.underlyingAssets.push({
            mint: match[1],
            bps: parseInt(match[2]),
            percentage: (parseInt(match[2]) / 100).toFixed(2) + "%",
          });
        }
      }

      // Extract total BPS allocation
      if (log.includes("📈 Total BPS allocation:")) {
        const match = log.match(/📈 Total BPS allocation: (\d+)/);
        if (match) {
          vaultData.totalBpsAllocation = parseInt(match[1]);
        }
      }

      // Extract factory key
      if (log.includes("🏭 Factory key:")) {
        const match = log.match(/🏭 Factory key: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.factoryKey = match[1];
        }
      }

      // Extract vault index (convert from 1-based to 0-based for blockchain)
      if (log.includes("🔢 Current vault count:")) {
        const match = log.match(
          /🔢 Current vault count: \d+, creating vault #(\d+)/
        );
        if (match) {
          // Convert from 1-based index to 0-based index for blockchain
          vaultData.vaultIndex = parseInt(match[1]) - 1;
        }
      }

      // Extract vault PDA
      if (log.includes("🔑 Vault PDA:")) {
        const match = log.match(/🔑 Vault PDA: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.vaultPda = match[1];
        }
      }

      // Extract vault admin
      if (log.includes("👑 Vault Admin:")) {
        const match = log.match(/👑 Vault Admin: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.vaultAdmin = match[1];
        }
      }

      // Extract vault mint PDA
      if (log.includes("🪙 Vault Mint PDA:")) {
        const match = log.match(/🪙 Vault Mint PDA: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.vaultMintPda = match[1];
        }
      }

      // Extract vault token account PDA
      if (log.includes("💳 Vault Token Account PDA:")) {
        const match = log.match(/💳 Vault Token Account PDA: ([A-Za-z0-9]+)/);
        if (match) {
          vaultData.vaultTokenAccountPda = match[1];
        }
      }

      // Extract created at timestamp
      if (log.includes("📅 Created at:")) {
        const match = log.match(/📅 Created at: (\d+)/);
        if (match) {
          const timestamp = parseInt(match[1]);
          vaultData.createdAt = {
            timestamp: timestamp,
            date: new Date(timestamp * 1000).toISOString(),
          };
        }
      }
    });

    return vaultData;
  }

  private logFormattedVaultData(vaultData: any): void {
    console.log("\n🏦 ===== VAULT CREATION DATA =====");
    console.log(`📝 Vault Name: ${vaultData.vaultName || "N/A"}`);
    console.log(`🏷️ Vault Symbol: ${vaultData.vaultSymbol || "N/A"}`);
    console.log(
      `🔢 Vault Index: ${
        vaultData.vaultIndex !== null ? vaultData.vaultIndex : "N/A"
      } (blockchain: ${
        vaultData.vaultIndex !== null ? vaultData.vaultIndex : "N/A"
      }, logs: ${
        vaultData.vaultIndex !== null ? vaultData.vaultIndex + 1 : "N/A"
      })`
    );
    console.log(
      `💰 Management Fees: ${vaultData.managementFees?.bps || 0} bps (${
        vaultData.managementFees?.percentage || "0.00%"
      })`
    );
    console.log(`📊 Number of Assets: ${vaultData.assetsCount || 0}`);
    console.log(
      `📈 Total BPS Allocation: ${vaultData.totalBpsAllocation || 0}`
    );

    if (vaultData.underlyingAssets && vaultData.underlyingAssets.length > 0) {
      console.log("\n💎 Underlying Assets:");
      vaultData.underlyingAssets.forEach((asset: any, index: number) => {
        console.log(
          `  Asset ${index + 1}: ${asset.mint} - ${asset.bps} bps (${
            asset.percentage
          })`
        );
      });
    }

    console.log("\n🔑 Vault Addresses:");
    console.log(`  🏭 Factory: ${vaultData.factoryKey || "N/A"}`);
    console.log(`  🔑 Vault PDA: ${vaultData.vaultPda || "N/A"}`);
    console.log(`  👑 Vault Admin: ${vaultData.vaultAdmin || "N/A"}`);
    console.log(`  🪙 Vault Mint PDA: ${vaultData.vaultMintPda || "N/A"}`);
    console.log(
      `  💳 Vault Token Account PDA: ${vaultData.vaultTokenAccountPda || "N/A"}`
    );

    if (vaultData.createdAt) {
      console.log(
        `\n📅 Created: ${vaultData.createdAt.date || "N/A"} (${
          vaultData.createdAt.timestamp || "N/A"
        })`
      );
    }

    console.log("🏦 ================================\n");
  }

  private extractProgramData(
    transaction: TransactionResponse | VersionedTransactionResponse
  ): string[] {
    const programData: string[] = [];

    if (transaction.meta?.logMessages) {
      transaction.meta.logMessages.forEach((log) => {
        // Extract only the data part from "Program data: <data>"
        if (log.startsWith("Program data:")) {
          const dataMatch = log.match(/Program data: (.+)/);
          if (dataMatch && dataMatch[1]) {
            programData.push(dataMatch[1]);
          }
        }
      });
    }

    return programData;
  }

  private decodeProgramData(programData: string[]): {
    raw: string[];
    decoded: string[];
    structured: any[];
  } {
    const decoded: string[] = [];
    const structured: any[] = [];

    programData.forEach((data) => {
      try {
        // Try to decode base64 data
        const buffer = Buffer.from(data, "base64");
        const decodedString = buffer.toString("utf8");
        decoded.push(decodedString);

        // Decode structured event data
        const structuredEvent = this.decodeStructuredEvent(buffer);
        if (structuredEvent) {
          structured.push(structuredEvent);
        }
      } catch (error) {
        // If decoding fails, add the original data
        decoded.push(`[Decoding failed: ${error.message}]`);
      }
    });

    return {
      raw: programData,
      decoded: decoded,
      structured: structured,
    };
  }

  private decodeStructuredEvent(buffer: Buffer): any {
    try {
      // Extract discriminator (first 8 bytes)
      const discriminator = buffer.slice(0, 8).toString("hex");

      // Identify event type
      const eventType = this.EVENT_DISCRIMINATORS[discriminator];

      if (eventType) {
        // Decode specific event based on type
        switch (eventType) {
          case "VaultCreated":
            return this.decodeVaultCreated(buffer);
          case "FactoryAssetsUpdated":
            return this.decodeFactoryAssetsUpdated(buffer);
          case "FactoryInitialized":
            return this.decodeFactoryInitialized(buffer);
          case "FactoryFeesUpdated":
            return this.decodeFactoryFeesUpdatedEnhanced(buffer);
          case "VaultFeesUpdated":
            return this.decodeVaultFeesUpdated(buffer);
          case "ProtocolFeesCollected":
            return this.decodeProtocolFeesCollected(buffer);
          case "VaultDeposited":
            return this.decodeVaultDeposited(buffer);
          default:
            return this.decodeGeneric(buffer, eventType);
        }
      } else {
        return this.decodeGeneric(buffer, "Unknown");
      }
    } catch (error) {
      return null;
    }
  }

  private decodeVaultCreated(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Vault address (32 bytes)
      const vault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Creator address (32 bytes)
      const creator = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Now I need to analyze the actual structure
      // Looking at the hex data, I can see the strings at the end
      // Let me work backwards from the end to find the structure

      // From the hex data, I can see:
      // - At the very end: "DirectVault_1757673812620" (25 bytes)
      // - Before that: "DVJUV" (5 bytes)
      // - Before that: some numeric values

      // Let me extract the strings first
      const fullString = buffer.toString();

      // Look for the vault name pattern
      const nameMatch = fullString.match(/DirectVault_\d+/);
      const symbolMatch = fullString.match(/[A-Z]{3,6}/);

      let vaultName = nameMatch ? nameMatch[0] : "Unknown";
      let vaultSymbol = symbolMatch ? symbolMatch[0] : "UNK";
      // Now let me try to find the numeric values
      // Looking at the hex pattern, I can see some values that look like they could be the numeric fields

      // Let me try a different approach - look for the actual structure
      // The structure might be: 3 pubkeys + some data + strings at the end

      // Let me try to find where the strings start
      const nameStart = fullString.indexOf("DirectVault_");
      const symbolStart = fullString.indexOf("DVJUV");

      // The data section should be between the pubkeys and the strings
      // Let me try to extract numeric values from the data section

      let managementFee = 0;
      let underlyingAssets = [];
      let assetsCount = 0;
      let totalSupply = BigInt(0);
      let nav = BigInt(0);
      let timestamp = BigInt(0);
      let vaultIndex = 0;
      let etfVaultPda = "";
      let etfMint = "";
      let vaultTreasury = "";

      // Try to find numeric values in the data section
      // Let me look for patterns that could be the numeric values

      // From the hex, I can see some patterns that might be the values
      // Let me try to extract them systematically

      // Based on the Solana program structure, let me try to parse the fields in order
      // The structure should be: 3 pubkeys + management_fee_bps (u16) + underlying_assets + other fields
      const dataStart = 8 + 96; // After discriminator + 3 pubkeys
      const dataEnd = symbolStart > 0 ? symbolStart : buffer.length - 50; // Before strings

      // Try to find the management fee (should be a small u16 value right after the pubkeys)
      for (let i = dataStart; i < dataEnd - 2; i++) {
        const value = buffer.readUInt16LE(i);
        if (value > 0 && value < 10000) {
          // Reasonable fee range
          managementFee = value;
          break;
        }
      }

      // Try to find additional public keys that could be etf_vault_pda, etf_mint, vault_treasury
      for (let i = dataStart; i < dataEnd - 32; i++) {
        try {
          const potentialPubkey = new PublicKey(buffer.slice(i, i + 32));

          // Check if this is a new pubkey (not the main 3 we already have)
          if (
            potentialPubkey.toString() !== vault.toString() &&
            potentialPubkey.toString() !== factory.toString() &&
            potentialPubkey.toString() !== creator.toString()
          ) {
            // Assign to the additional fields if they're empty
            if (!etfVaultPda) {
              etfVaultPda = potentialPubkey.toString();
            } else if (!etfMint) {
              etfMint = potentialPubkey.toString();
            } else if (!vaultTreasury) {
              vaultTreasury = potentialPubkey.toString();
            }
          }
        } catch (e) {
          // Not a valid public key, continue
        }
      }

      // Try to find the timestamp (should be a large number representing Unix timestamp)
      // Look for 8-byte values that could be timestamps
      for (let i = dataStart; i < dataEnd - 8; i++) {
        const value = buffer.readBigInt64LE(i);
        const timestampValue = Number(value);
        // Check if it's a reasonable timestamp (between 2020 and 2030)
        if (timestampValue > 1577836800 && timestampValue < 1893456000) {
          timestamp = value;
          break;
        }
      }

      // Try to find other numeric values
      // Look for total supply, NAV, and vault_index
      for (let i = dataStart; i < dataEnd - 8; i++) {
        const value = buffer.readBigUInt64LE(i);
        if (value > BigInt(0) && value < BigInt(1000000000000000)) {
          // Reasonable range
          if (totalSupply === BigInt(0)) {
            totalSupply = value;
          } else if (nav === BigInt(0)) {
            nav = value;
          }
        }
      }

      // Try to find vault_index (should be a small u8 or u16 value)
      for (let i = dataStart; i < dataEnd - 1; i++) {
        const value = buffer.readUInt8(i);
        if (value > 0 && value < 255) {
          // Reasonable vault index range
          vaultIndex = value;
          break;
        }
      }

      // Try to find underlying assets
      // Look for potential public keys in the data section that could be asset mints
      for (let i = dataStart; i < dataEnd - 32; i++) {
        try {
          const potentialMint = new PublicKey(buffer.slice(i, i + 32));

          // Check if this looks like a valid asset mint (not one of the main addresses)
          if (
            potentialMint.toString() !== vault.toString() &&
            potentialMint.toString() !== factory.toString() &&
            potentialMint.toString() !== creator.toString()
          ) {
            // Try to read percentage after the mint (2 bytes)
            if (i + 34 <= dataEnd) {
              const pctBps = buffer.readUInt16LE(i + 32);
              if (pctBps > 0 && pctBps <= 10000) {
                // Reasonable percentage range
                underlyingAssets.push({
                  mint: potentialMint.toString(),
                  pctBps: pctBps,
                  percentage: (pctBps / 100).toFixed(2) + "%",
                });
                assetsCount++;
              }
            }
          }
        } catch (e) {
          // Not a valid public key, continue
        }
      }

      const date =
        timestamp > BigInt(0) ? new Date(Number(timestamp) * 1000) : new Date();

      const result = {
        eventType: "VaultCreated",
        vault: vault.toString(),
        factory: factory.toString(),
        creator: creator.toString(),
        vaultName,
        vaultSymbol,
        managementFeeBps: managementFee,
        managementFeePercent: (managementFee / 100).toFixed(2),
        underlyingAssets: underlyingAssets,
        underlyingAssetsCount: assetsCount,
        vaultIndex: vaultIndex,
        etfVaultPda: etfVaultPda,
        etfMint: etfMint,
        vaultTreasury: vaultTreasury,
        totalSupply: totalSupply.toString(),
        nav: nav.toString(),
        timestamp: timestamp.toString(),
        createdAt: date.toISOString(),
      };

      return result;
    } catch (error) {
      console.log(`Error decoding VaultCreated: ${error.message}`);
      return this.decodeGeneric(buffer, "VaultCreated");
    }
  }

  private decodeFactoryAssetsUpdated(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Updated by address (32 bytes)
      const updatedBy = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Old assets count (u8)
      const oldAssetsCount = buffer.readUInt8(offset);
      offset += 1;

      // New assets count (u8)
      const newAssetsCount = buffer.readUInt8(offset);
      offset += 1;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "FactoryAssetsUpdated",
        factory: factory.toString(),
        updatedBy: updatedBy.toString(),
        oldAssetsCount,
        newAssetsCount,
        timestamp: timestamp.toString(),
        updatedAt: date.toISOString(),
      };
    } catch (error) {
      console.log(
        `Error decoding FactoryAssetsUpdated: ${error.message}`
      );
      return this.decodeGeneric(buffer, "FactoryAssetsUpdated");
    }
  }

  private decodeFactoryInitialized(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Initializer address (32 bytes)
      const initializer = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "FactoryInitialized",
        factory: factory.toString(),
        initializer: initializer.toString(),
        timestamp: timestamp.toString(),
        initializedAt: date.toISOString(),
      };
    } catch (error) {
      console.log(`Error decoding FactoryInitialized: ${error.message}`);
      return this.decodeGeneric(buffer, "FactoryInitialized");
    }
  }

  private decodeFactoryFeesUpdated(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Updated by address (32 bytes)
      const updatedBy = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Old fee (u16)
      const oldFee = buffer.readUInt16LE(offset);
      offset += 2;

      // New fee (u16)
      const newFee = buffer.readUInt16LE(offset);
      offset += 2;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "FactoryFeesUpdated",
        factory: factory.toString(),
        updatedBy: updatedBy.toString(),
        oldFeeBps: oldFee,
        oldFeePercent: (oldFee / 100).toFixed(2),
        newFeeBps: newFee,
        newFeePercent: (newFee / 100).toFixed(2),
        timestamp: timestamp.toString(),
        updatedAt: date.toISOString(),
      };
    } catch (error) {
      console.log(`Error decoding FactoryFeesUpdated: ${error.message}`);
      return this.decodeGeneric(buffer, "FactoryFeesUpdated");
    }
  }

  private decodeVaultFeesUpdated(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Vault address (32 bytes)
      const vault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Updated by address (32 bytes)
      const updatedBy = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Old fee (u16)
      const oldFee = buffer.readUInt16LE(offset);
      offset += 2;

      // New fee (u16)
      const newFee = buffer.readUInt16LE(offset);
      offset += 2;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "VaultFeesUpdated",
        vault: vault.toString(),
        updatedBy: updatedBy.toString(),
        oldFeeBps: oldFee,
        oldFeePercent: (oldFee / 100).toFixed(2),
        newFeeBps: newFee,
        newFeePercent: (newFee / 100).toFixed(2),
        timestamp: timestamp.toString(),
        updatedAt: date.toISOString(),
      };
    } catch (error) {
      console.log(`Error decoding VaultFeesUpdated: ${error.message}`);
      return this.decodeGeneric(buffer, "VaultFeesUpdated");
    }
  }

  private decodeProtocolFeesCollected(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Vault address (32 bytes)
      const vault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Collector address (32 bytes)
      const collector = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Fee amount (u64)
      const feeAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      return {
        eventType: "ProtocolFeesCollected",
        vault: vault.toString(),
        collector: collector.toString(),
        feeAmount: feeAmount.toString(),
        timestamp: timestamp.toString(),
        collectedAt: date.toISOString(),
      };
    } catch (error) {
      console.log(
        `Error decoding ProtocolFeesCollected: ${error.message}`
      );
      return this.decodeGeneric(buffer, "ProtocolFeesCollected");
    }
  }

  private decodeGeneric(buffer: Buffer, eventType: string): any {
    const discriminator = buffer.slice(0, 8).toString("hex");
    const data = buffer.slice(8);

    // Try to extract any potential public keys (32-byte chunks)
    const potentialPubkeys: string[] = [];
    let offset = 0;
    let pubkeyCount = 0;

    while (offset + 32 <= data.length && pubkeyCount < 5) {
      try {
        const potentialPubkey = new PublicKey(data.slice(offset, offset + 32));
        potentialPubkeys.push(potentialPubkey.toString());
        pubkeyCount++;
      } catch (e) {
        // Not a valid public key
      }
      offset += 32;
    }

    return {
      eventType,
      discriminator,
      dataLength: data.length,
      dataHex: data.toString("hex"),
      potentialPubkeys,
      raw: buffer.toString("base64"),
    };
  }

  /**
   * Process VaultCreated events and create vault factory records
   * @param structuredVaultData - Structured vault data from program logs
   * @returns Array of vault creation results or empty array if no events
   */
  private async processVaultCreatedEvents(
    structuredVaultData: any,
    bannerUrl: string,
    logoUrl: string,
    description: string
  ): Promise<any[]> {
    // Processing structured vault data for vault creation

    const vaultCreationResults: any[] = [];

    try {
      // Validate required fields
      if (
        !structuredVaultData.vaultPda ||
        !structuredVaultData.factoryKey ||
        !structuredVaultData.vaultAdmin ||
        !structuredVaultData.vaultName ||
        !structuredVaultData.vaultSymbol
      ) {
        console.log("Skipping vault creation - missing required fields");
        return vaultCreationResults;
      }

      // Validate underlying assets data
      if (
        !structuredVaultData.underlyingAssets ||
        !Array.isArray(structuredVaultData.underlyingAssets)
      ) {
        console.log(
          "Skipping vault creation - missing or invalid underlying assets"
        );
        return vaultCreationResults;
      }

      // Map underlying assets to the expected format
      const mappedUnderlyingAssets = structuredVaultData.underlyingAssets.map(
        (asset) => ({
          mint: asset.mint,
          pctBps: asset.bps,
          percentage: asset.percentage,
        })
      );

      // Create vault factory record
      const vaultRecord =
        await this.vaultFactoryService.createFromStructuredProgramData({
          eventType: "VaultCreated",
          vault: structuredVaultData.vaultPda,
          factory: structuredVaultData.factoryKey,
          creator: structuredVaultData.vaultAdmin,
          vaultName: structuredVaultData.vaultName,
          vaultSymbol: structuredVaultData.vaultSymbol,
          managementFeeBps: structuredVaultData.managementFees?.bps || 0,
          underlyingAssets: mappedUnderlyingAssets,
          underlyingAssetsCount:
            structuredVaultData.assetsCount ||
            structuredVaultData.underlyingAssets.length,
          totalSupply: "0", // Initial total supply
          nav: "0", // Initial NAV
          timestamp:
            structuredVaultData.createdAt?.timestamp?.toString() ||
            Date.now().toString(),
          createdAt:
            structuredVaultData.createdAt?.date || new Date().toISOString(),
          vaultIndex: structuredVaultData.vaultIndex,
          etfVaultPda: structuredVaultData.vaultPda,
          etfMint: structuredVaultData.vaultMintPda,
          vaultTreasury: structuredVaultData.vaultTokenAccountPda,
          bannerUrl: bannerUrl,
          vaultLogoUrl: logoUrl,
          description: description,
        });

      console.log(
        `Successfully created vault factory record: ${vaultRecord._id}`
      );

      // Add vault creation result to the array
      vaultCreationResults.push({
        eventType: "VaultCreated",
        vault: vaultRecord,
      });
    } catch (error) {
      console.log(
        `Error processing vault creation: ${error.message}`,
        error.stack
      );

      // Add error result to the array
      vaultCreationResults.push({
        eventType: "VaultCreated",
        vault: null,
        error: error.message,
      });
    }

    return vaultCreationResults;
  }

  // Method to get transaction details without logging (for other use cases)
  async getTransactionDetails(
    transactionSignature: string
  ): Promise<TransactionResponse | VersionedTransactionResponse | null> {
    try {
      return await this.connection.getTransaction(transactionSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
    } catch (error) {
      console.log(`Error fetching transaction details: ${error.message}`);
      return null;
    }
  }

  /**
   * Independent method to handle FactoryFeesUpdated events from transaction signature
   * This method reads a transaction, extracts FactoryFeesUpdated events, and console logs the decoded data
   * @param updateFeesDto - Contains the transaction signature to process
   * @returns Processed fee update data with console logging
   */
  async updateFees(updateFeesDto: UpdateFeesDto): Promise<any> {
    try {
      const { transactionSignature } = updateFeesDto;
      console.log(
        `Processing transaction for FactoryFeesUpdated events: ${transactionSignature}`
      );

      // Fetch transaction details from Solana blockchain
      // Let Solana RPC validate the signature format and existence
      const transaction = await this.connection.getTransaction(
        transactionSignature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }
      );

      if (!transaction) {
        throw new BadRequestException("Transaction not found");
      }

      // Extract and decode program data
      const programData = this.extractProgramData(transaction);
      const decodedData = this.decodeProgramData(programData);

      // Filter for FactoryFeesUpdated events only
      const factoryFeesUpdatedEvents = decodedData.structured.filter(
        (event) => event.eventType === "FactoryFeesUpdated"
      );

      if (factoryFeesUpdatedEvents.length === 0) {
        return {
          transactionSignature,
        };
      }

      // Process each FactoryFeesUpdated event found
      const processedEvents = [];
      for (const event of factoryFeesUpdatedEvents) {
        console.log(`Found FactoryFeesUpdated event in transaction`);

        try {
          // Update fees management using the new service method
          const updatedFeeConfig =
            await this.feesManagementService.updateFeesFromFactoryEvent(
              event,
              event.updatedBy, // Use the updatedBy from the event
              undefined // No specific vault ID for factory-level fee updates
            );

          console.log(
            `Successfully updated fee configuration: ${
              (updatedFeeConfig as any)._id
            }`
          );

          // Update the event with the updated fee config ID
          event.updatedFeeConfigId = (updatedFeeConfig as any)._id;
        } catch (error) {
          console.log(
            `Failed to update fee configuration for event: ${error.message}`,
            error.stack
          );
          // Continue processing other events even if one fails
          event.feeUpdateError = error.message;
        }

        // Create a minimal response with only required fields
        const minimalEvent = {
          eventType: event.eventType,
          factory: event.factory,
          updatedBy: event.updatedBy,
        };

        processedEvents.push(minimalEvent);
      }

      // Return the processed data
      return {
        events: processedEvents,
      };
    } catch (error) {
      console.log(
        `Error processing FactoryFeesUpdated transaction: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Parse deposit program logs to extract structured deposit data
   * @param programLogs - Array of program log messages
   * @returns Structured deposit data
   */
  private parseDepositProgramLogs(programLogs: string[]): any {
    const depositData: any = {
      vaultName: null,
      vaultSymbol: null,
      vaultIndex: null,
      user: null,
      amount: null,
      entryFee: null,
      managementFee: null,
      totalFees: null,
      netAmount: null,
      vaultTokensToMint: null,
      previousTotalAssets: null,
      previousTotalSupply: null,
      newTotalAssets: null,
      newTotalSupply: null,
      timestamp: null,
      swapOutputsByMint: {} as Record<string, number>,
    };
    let currentSwapMint: string | null = null;

    programLogs.forEach((log) => {
      // Extract vault information
      if (log.includes("🏦 Vault:")) {
        const match = log.match(/🏦 Vault: (.+)/);
        if (match) {
          const vaultInfo = match[1].trim();
          // Parse vault name and symbol from format like "SBC COILLE (SC-ETF)"
          const vaultMatch = vaultInfo.match(/^(.+?)\s+\((.+?)\)$/);
          if (vaultMatch) {
            depositData.vaultName = vaultMatch[1].trim();
            depositData.vaultSymbol = vaultMatch[2].trim();
          }
        }
      }

      // Extract vault index
      if (log.includes("Starting deposit process for vault #")) {
        const match = log.match(/Starting deposit process for vault #(\d+)/);
        if (match) {
          depositData.vaultIndex = parseInt(match[1]);
        }
      }

      // Extract user address
      if (log.includes("👤 User:")) {
        const match = log.match(/👤 User: ([A-Za-z0-9]+)/);
        if (match) {
          depositData.user = match[1];
        }
      }

      // Extract deposit amount
      if (log.includes("💵 Deposit amount:")) {
        const match = log.match(/💵 Deposit amount: (\d+) raw units/);
        if (match) {
          depositData.amount = match[1];
        }
      }

      // Extract entry fee
      if (log.includes("Entry fee:")) {
        const match = log.match(/Entry fee: (\d+) raw units/);
        if (match) {
          depositData.entryFee = match[1];
        }
      }

      // Extract management fee
      if (log.includes("Management fee:")) {
        const match = log.match(/Management fee: (\d+) raw units/);
        if (match) {
          depositData.managementFee = match[1];
        }
      }

      // Extract total fees
      if (log.includes("Total fees:")) {
        const match = log.match(/Total fees: (\d+) raw units/);
        if (match) {
          depositData.totalFees = match[1];
        }
      }

      // Extract net deposit amount
      if (log.includes("Net deposit:")) {
        const match = log.match(/Net deposit: (\d+) raw units/);
        if (match) {
          depositData.netAmount = match[1];
        }
      }

      // Extract vault tokens to mint
      if (log.includes("Vault tokens to mint:")) {
        const match = log.match(/Vault tokens to mint: (\d+) raw units/);
        if (match) {
          depositData.vaultTokensToMint = match[1];
        }
      }

      // Detect Raydium swap start and remember target mint
      if (log.includes("[Raydium] swapping -> mint:")) {
        const mintMatch = log.match(
          /\[Raydium\] swapping -> mint:\s+([A-Za-z0-9]+)/
        );
        if (mintMatch) {
          currentSwapMint = mintMatch[1];
        }
      }

      // Capture output_amount from subsequent log lines and attribute to last seen mint
      if (currentSwapMint && log.includes("output_amount:")) {
        const outMatch = log.match(/output_amount:(\d+)/);
        if (outMatch) {
          const out = Number(outMatch[1]);
          if (!Number.isNaN(out) && out > 0) {
            depositData.swapOutputsByMint[currentSwapMint] =
              (depositData.swapOutputsByMint[currentSwapMint] || 0) + out;
            // do not clear currentSwapMint yet; a single swap may log multiple lines but we only count first occurrence per swap
          }
        }
      }

      // Extract previous total assets
      if (log.includes("Previous total assets:")) {
        const match = log.match(/Previous total assets: (\d+)/);
        if (match) {
          depositData.previousTotalAssets = match[1];
        }
      }

      // Extract previous total supply
      if (log.includes("Previous total supply:")) {
        const match = log.match(/Previous total supply: (\d+)/);
        if (match) {
          depositData.previousTotalSupply = match[1];
        }
      }

      // Extract new total assets
      if (log.includes("New total assets:")) {
        const match = log.match(/New total assets: (\d+)/);
        if (match) {
          depositData.newTotalAssets = match[1];
        }
      }

      // Extract new total supply
      if (log.includes("New total supply:")) {
        const match = log.match(/New total supply: (\d+)/);
        if (match) {
          depositData.newTotalSupply = match[1];
        }
      }
    });

    // Set timestamp to current time if not found in logs
    depositData.timestamp = Date.now().toString();
    depositData.timestampDate = new Date().toISOString();

    return depositData;
  }

  /**
   * Independent method to handle deposit transactions from transaction signature
   * This method reads a transaction, extracts deposit program logs, and processes the deposit
   * @param updateDepositTransactionDto - Contains the transaction signature to process
   * @returns Processed deposit data
   */
  async depositTransaction(
    updateDepositTransactionDto: UpdateVaultDepositDto
  ): Promise<any> {
    try {
      const { transactionSignature, signatureArray } =
        updateDepositTransactionDto;
      console.log(
        `Processing transaction for deposit events: ${transactionSignature}`
      );

      // Fetch transaction details from Solana blockchain
      const transaction = await this.connection.getTransaction(
        transactionSignature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }
      );

      if (!transaction) {
        throw new BadRequestException("Transaction not found");
      }

      // Extract program logs
      const programLogs = this.extractProgramLogs(transaction);
      this.logger.debug("programLogs Logs", programLogs);

      // Parse deposit data from program logs
      const depositData = this.parseDepositProgramLogs(programLogs);
      this.logger.debug("Parsed deposit data:", depositData);

      // Check if this is a deposit transaction
      if (!depositData.user || !depositData.amount) {
        console.log("No deposit data found in transaction logs");
        return {
          events: [],
          message: "No deposit data found in transaction logs",
        };
      }

      // Find vault by name and symbol
      let vaultAddress = "unknown";
      if (depositData.vaultName && depositData.vaultSymbol) {
        try {
          const vault = await this.vaultFactoryService.findByVaultNameAndSymbol(
            depositData.vaultName,
            depositData.vaultSymbol
          );
          if (vault && vault.vaultAddress) {
            vaultAddress = vault.vaultAddress;
          }
        } catch (error) {
          console.log(
            `Could not find vault by name and symbol: ${error.message}`
          );
        }
      }

      // Process the deposit transaction
      const processedEvents = [];

      try {
        // Update vault deposit using the parsed data
        const updatedVaultDeposit =
          await this.vaultDepositService.updateVaultDepositFromEvent(
            {
              event_type: "VaultDeposited",
              vault: vaultAddress,
              user: depositData.user,
              amount: depositData.amount,
              shares_minted:
                depositData.vaultTokensToMint || depositData.netAmount,
              entry_fee: depositData.entryFee || "0",
              net_amount: depositData.netAmount,
              total_assets: depositData.newTotalAssets,
              total_shares: depositData.newTotalSupply,
              timestamp: depositData.timestamp,
              timestamp_date: depositData.timestampDate,
            },
            depositData.user,
            vaultAddress,
            transactionSignature,
            transaction.slot
          );

        // Update the event with the updated vault deposit ID
        depositData.updatedVaultDepositId = (updatedVaultDeposit as any)._id;

        // Create history record for deposit transaction
        try {
          const vaultFactory = await this.vaultFactoryService.findByAddress(
            vaultAddress
          );
          const userProfile = await this.vaultDepositService[
            "profileService"
          ].getByWalletAddress(depositData.user);

          if (vaultFactory && userProfile) {
            await this.historyService.createTransactionHistory(
              "deposit_completed",
              `Deposit completed: ${depositData.amount} tokens deposited into ${depositData.vaultName} (${depositData.vaultSymbol})`,
              userProfile._id.toString(),
              vaultFactory._id.toString(),
              {
                amount: depositData.amount,
                vaultTokensMinted: depositData.vaultTokensToMint,
                entryFee: depositData.entryFee,
                managementFee: depositData.managementFee,
                netAmount: depositData.netAmount,
                vaultName: depositData.vaultName,
                vaultSymbol: depositData.vaultSymbol,
                vaultIndex: depositData.vaultIndex,
                userAddress: depositData.user,
                timestamp: depositData.timestamp,
                blockNumber: transaction.slot,
              },
              transactionSignature,
              signatureArray
            );
            console.log(
              `History record created for deposit transaction: ${transactionSignature}`
            );
          }
        } catch (historyError) {
          console.log(
            `Failed to create history record for deposit: ${historyError.message}`
          );
        }
      } catch (error) {
        console.log(
          `Failed to update vault deposit: ${error.message}`,
          error.stack
        );
        depositData.vaultDepositUpdateError = error.message;
      }

      // Create response with processed data
      const processedEvent = {
        eventType: "VaultDeposited",
        vaultName: depositData.vaultName,
        vaultSymbol: depositData.vaultSymbol,
        vaultIndex: depositData.vaultIndex,
        user: depositData.user,
        amount: depositData.amount,
        entryFee: depositData.entryFee,
        managementFee: depositData.managementFee,
        totalFees: depositData.totalFees,
        netAmount: depositData.netAmount,
        vaultTokensMinted: depositData.vaultTokensToMint,
        previousTotalAssets: depositData.previousTotalAssets,
        previousTotalSupply: depositData.previousTotalSupply,
        newTotalAssets: depositData.newTotalAssets,
        newTotalSupply: depositData.newTotalSupply,
        timestamp: depositData.timestamp,
        timestampDate: depositData.timestampDate,
        updatedVaultDepositId: depositData.updatedVaultDepositId,
        vaultDepositUpdateError: depositData.vaultDepositUpdateError,
      };

      processedEvents.push(processedEvent);

      // Return the processed data
      // Update vault underlying totalAssetLocked using swap outputs
      try {
        if (
          vaultAddress &&
          vaultAddress !== "unknown" &&
          depositData.swapOutputsByMint
        ) {
          await this.vaultFactoryService.incrementTotalAssetLockedByVaultAddress(
            vaultAddress,
            depositData.swapOutputsByMint
          );
        }
      } catch (lockUpdateError) {
        console.log(
          `Failed to update totalAssetLocked: ${lockUpdateError.message}`
        );
      }

      this.clearCache();
      return {
        events: processedEvents,
      };
    } catch (error) {
      console.log(
        `Error processing deposit transaction: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Parse redeem program logs to extract structured redeem data
   * @param programLogs - Array of program log messages
   * @returns Structured redeem data
   */
  private parseRedeemProgramLogs(programLogs: string[]): any {
    const redeemData: any = {
      vaultName: null,
      vaultSymbol: null,
      vaultIndex: null,
      user: null,
      vaultTokensToRedeem: null,
      exitFee: null,
      managementFee: null,
      totalFees: null,
      netStablecoinAmount: null,
      previousTotalAssets: null,
      previousTotalSupply: null,
      newTotalAssets: null,
      newTotalSupply: null,
      timestamp: null,
    };

    programLogs.forEach((log) => {
      this.logger.debug(`Processing log: ${log}`);

      // Handle newer pattern: Instruction indicates FinalizeRedeem
      if (log.includes("Instruction: FinalizeRedeem")) {
        // Marker that we are in a redeem flow
      }

      // Pattern: "🧾 Finalizing redeem for 9206191 vault tokens"
      if (log.includes("Finalizing redeem for")) {
        const match = log.match(
          /Finalizing redeem for\s+(\d+)\s+vault tokens/i
        );
        if (match) {
          redeemData.vaultTokensToRedeem = match[1];
        }
      }

      // Pattern: "Fees: exit=23015, mgmt=184123, net_to_user=8999053" or "Fees: exit=2497, net_to_user=996493"
      if (log.includes("Fees:")) {
        this.logger.debug(`Found fees log: ${log}`);

        // Try pattern with management fee first
        let match = log.match(
          /Fees:\s*exit=(\d+),\s*mgmt=(\d+),\s*net_to_user=(\d+)/i
        );
        if (match) {
          this.logger.debug(
            `Matched fees with management fee: exit=${match[1]}, mgmt=${match[2]}, net_to_user=${match[3]}`
          );
          redeemData.exitFee = match[1];
          redeemData.managementFee = match[2];
          redeemData.netStablecoinAmount = match[3];
          try {
            const total =
              BigInt(redeemData.exitFee) + BigInt(redeemData.managementFee);
            redeemData.totalFees = total.toString();
          } catch {
            redeemData.totalFees = undefined;
          }
        } else {
          // Try pattern without management fee
          match = log.match(/Fees:\s*exit=(\d+),\s*net_to_user=(\d+)/i);
          if (match) {
            this.logger.debug(
              `Matched fees without management fee: exit=${match[1]}, net_to_user=${match[2]}`
            );
            redeemData.exitFee = match[1];
            redeemData.managementFee = "0"; // No management fee in this case
            redeemData.netStablecoinAmount = match[2];
            redeemData.totalFees = redeemData.exitFee;
          } else {
            console.log(`Could not parse fees log: ${log}`);
          }
        }
      }
      // Extract vault information
      if (log.includes("🏦 Vault:")) {
        const match = log.match(/🏦 Vault: (.+)/);
        if (match) {
          const vaultInfo = match[1].trim();
          // Parse vault name and symbol from format like "Theta Pool 4273 (WQB75)"
          const vaultMatch = vaultInfo.match(/^(.+?)\s+\((.+?)\)$/);
          if (vaultMatch) {
            redeemData.vaultName = vaultMatch[1].trim();
            redeemData.vaultSymbol = vaultMatch[2].trim();
          }
        }
      }

      // Extract vault index
      if (log.includes("Starting redeem process for vault #")) {
        const match = log.match(/Starting redeem process for vault #(\d+)/);
        if (match) {
          redeemData.vaultIndex = parseInt(match[1]);
        }
      }

      // Extract user address
      if (log.includes("👤 User:")) {
        const match = log.match(/👤 User: ([A-Za-z0-9]+)/);
        if (match) {
          redeemData.user = match[1];
        }
      }

      // Extract vault tokens to redeem
      if (log.includes("🪙 Vault tokens to redeem:")) {
        const match = log.match(/🪙 Vault tokens to redeem: (\d+) raw units/);
        if (match) {
          redeemData.vaultTokensToRedeem = match[1];
        }
      }

      // Extract exit fee
      if (log.includes("Exit fee:")) {
        const match = log.match(/Exit fee: (\d+) raw units/);
        if (match) {
          redeemData.exitFee = match[1];
        }
      }

      // Extract management fee
      if (log.includes("Management fee:")) {
        const match = log.match(/Management fee: (\d+) raw units/);
        if (match) {
          redeemData.managementFee = match[1];
        }
      }

      // Extract total fees
      if (log.includes("Total fees:")) {
        const match = log.match(/Total fees: (\d+) raw units/);
        if (match) {
          redeemData.totalFees = match[1];
        }
      }

      // Extract net stablecoin amount
      if (log.includes("Net stablecoin amount:")) {
        const match = log.match(/Net stablecoin amount: (\d+) raw units/);
        if (match) {
          redeemData.netStablecoinAmount = match[1];
        }
      }

      // Extract previous total assets
      if (log.includes("Previous total assets:")) {
        const match = log.match(/Previous total assets: (\d+)/);
        if (match) {
          redeemData.previousTotalAssets = match[1];
        }
      }

      // Extract previous total supply
      if (log.includes("Previous total supply:")) {
        const match = log.match(/Previous total supply: (\d+)/);
        if (match) {
          redeemData.previousTotalSupply = match[1];
        }
      }

      // Extract new total assets
      if (log.includes("New total assets:")) {
        const match = log.match(/New total assets: (\d+)/);
        if (match) {
          redeemData.newTotalAssets = match[1];
        }
      }

      // Extract new total supply
      if (log.includes("New total supply:")) {
        const match = log.match(/New total supply: (\d+)/);
        if (match) {
          redeemData.newTotalSupply = match[1];
        }
      }
    });

    // Set timestamp to current time if not found in logs
    redeemData.timestamp = Date.now().toString();
    redeemData.timestampDate = new Date().toISOString();

    // Debug logging for parsed data
    this.logger.debug(`Parsed redeem data: ${JSON.stringify(redeemData)}`);

    return redeemData;
  }

  /**
   * Independent method to handle redeem transactions from transaction signature
   * This method reads a transaction, extracts redeem program logs, and processes the redeem
   * @param updateRedeemTransactionDto - Contains the transaction signature to process
   * @returns Processed redeem data
   */
  async redeemTransaction(
    updateRedeemTransactionDto: UpdateVaultRedeemDto
  ): Promise<any> {
    try {
      const transactionSignature = (updateRedeemTransactionDto as any)
        .transactionSignature as string;
      const vaultAddressHint = (updateRedeemTransactionDto as any)
        .vaultAddress as string | undefined;
      const vaultIndexHint = (updateRedeemTransactionDto as any).vaultIndex as
        | number
        | undefined;
      const performedByProfileId = (updateRedeemTransactionDto as any)
        .performedByProfileId as string | undefined;
      const performedByWallet = (updateRedeemTransactionDto as any)
        .performedByWallet as string | undefined;
      const signatureArray = (updateRedeemTransactionDto as any)
        .signatureArray as string[] | undefined;
      console.log(
        `Processing transaction for redeem events: ${transactionSignature}`
      );
      console.log("performedByProfileId", performedByProfileId);
      console.log("performedByWallet", performedByWallet);
      console.log("signatureArray", signatureArray);
      // Fetch transaction details from Solana blockchain
      const transaction = await this.connection.getTransaction(
        transactionSignature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }
      );

      if (!transaction) {
        throw new BadRequestException("Transaction not found");
      }

      // Extract program logs
      const programLogs = this.extractProgramLogs(transaction);
      console.log("programLogs Logs", programLogs);

      // Parse redeem data from program logs
      const redeemData = this.parseRedeemProgramLogs(programLogs);
      // Apply optional hints from request to improve association accuracy
      if (vaultIndexHint !== undefined && vaultIndexHint !== null) {
        redeemData.vaultIndex = vaultIndexHint;
      }
      // Fall back to authenticated wallet if user is not present in logs
      if (!redeemData.user && performedByWallet) {
        redeemData.user = performedByWallet;
      }
      console.log("Parsed redeem data:", redeemData);

      // Check if this is a redeem transaction: must have amount; user can be from logs or auth
      if (!redeemData.vaultTokensToRedeem || !redeemData.user) {
        console.log("No redeem data found in transaction logs");
        return {
          events: [],
          message: "No redeem data found in transaction logs",
        };
      }

      // Resolve vault address using hints first, then fallbacks
      let vaultAddress = vaultAddressHint || "unknown";
      if (
        vaultAddress === "unknown" &&
        redeemData.vaultName &&
        redeemData.vaultSymbol
      ) {
        try {
          const vault = await this.vaultFactoryService.findByVaultNameAndSymbol(
            redeemData.vaultName,
            redeemData.vaultSymbol
          );
          if (vault && vault.vaultAddress) {
            vaultAddress = vault.vaultAddress;
          }
        } catch (error) {
          console.log(
            `Could not find vault by name and symbol: ${error.message}`
          );
        }
      }

      // Process the redeem transaction
      const processedEvents = [];

      try {
        // Validate required redeem data
        if (
          !redeemData.netStablecoinAmount ||
          redeemData.netStablecoinAmount === "null" ||
          redeemData.netStablecoinAmount === "undefined"
        ) {
          console.log(
            `Invalid netStablecoinAmount: ${redeemData.netStablecoinAmount}`
          );
          throw new Error(
            `Invalid netStablecoinAmount: ${redeemData.netStablecoinAmount}`
          );
        }

        if (
          !redeemData.vaultTokensToRedeem ||
          redeemData.vaultTokensToRedeem === "null" ||
          redeemData.vaultTokensToRedeem === "undefined"
        ) {
          console.log(
            `Invalid vaultTokensToRedeem: ${redeemData.vaultTokensToRedeem}`
          );
          throw new Error(
            `Invalid vaultTokensToRedeem: ${redeemData.vaultTokensToRedeem}`
          );
        }

        // Update vault redeem using the parsed data
        const updatedVaultDeposit =
          await this.vaultDepositService.updateVaultRedeemFromEvent(
            {
              event_type: "VaultRedeemed",
              vault: vaultAddress,
              user: redeemData.user,
              shares: redeemData.vaultTokensToRedeem,
              tokens_received: redeemData.netStablecoinAmount,
              exit_fee: redeemData.exitFee || "0",
              management_fee: redeemData.managementFee || "0",
              total_assets: redeemData.newTotalAssets,
              total_shares: redeemData.newTotalSupply,
              timestamp: redeemData.timestamp,
              timestamp_date: redeemData.timestampDate,
            },
            redeemData.user,
            vaultAddress,
            transactionSignature,
            transaction.slot
          );

        // Update the event with the updated vault deposit ID
        redeemData.updatedVaultDepositId = (updatedVaultDeposit as any)._id;

        // Create history record for redeem transaction (use resolved vault address)
        try {
          const vaultFactory =
            vaultAddress && vaultAddress !== "unknown"
              ? await this.vaultFactoryService.findByAddress(vaultAddress)
              : null;
          // Prefer authenticated profile id if provided, otherwise resolve by on-chain wallet
          const userProfileId = performedByProfileId
            ? performedByProfileId.toString()
            : (
                await this.vaultDepositService[
                  "profileService"
                ].getByWalletAddress(performedByWallet || redeemData.user)
              )?._id?.toString();

          if (vaultFactory && userProfileId) {
            await this.historyService.createTransactionHistory(
              "redeem_completed",
              `Redeem completed: ${redeemData.vaultTokensToRedeem} vault tokens redeemed from ${redeemData.vaultName} (${redeemData.vaultSymbol})`,
              userProfileId,
              vaultFactory._id.toString(),
              {
                vaultTokensRedeemed: redeemData.vaultTokensToRedeem,
                netStablecoinAmount: redeemData.netStablecoinAmount,
                exitFee: redeemData.exitFee,
                managementFee: redeemData.managementFee,
                totalFees: redeemData.totalFees,
                vaultName: redeemData.vaultName,
                vaultSymbol: redeemData.vaultSymbol,
                vaultIndex: redeemData.vaultIndex,
                userAddress: redeemData.user,
                timestamp: redeemData.timestamp,
                blockNumber: transaction.slot,
              },
              transactionSignature,
              signatureArray
            );
            console.log(
              `History record created for redeem transaction: ${transactionSignature}`
            );
            console.log(
              `History record created for redeem transaction: ${transactionSignature}`
            );
          }
        } catch (historyError) {
          console.log(
            `Failed to create history record for redeem: ${historyError.message}`
          );
        }
      } catch (error) {
        console.log(
          `Failed to update vault redeem: ${error.message}`,
          error.stack
        );
        redeemData.vaultRedeemUpdateError = error.message;
      }

      // Create response with processed data
      const processedEvent = {
        eventType: "VaultRedeemed",
        vaultName: redeemData.vaultName,
        vaultSymbol: redeemData.vaultSymbol,
        vaultIndex: redeemData.vaultIndex,
        user: redeemData.user,
        vaultTokensRedeemed: redeemData.vaultTokensToRedeem,
        exitFee: redeemData.exitFee,
        managementFee: redeemData.managementFee,
        totalFees: redeemData.totalFees,
        netStablecoinAmount: redeemData.netStablecoinAmount,
        previousTotalAssets: redeemData.previousTotalAssets,
        previousTotalSupply: redeemData.previousTotalSupply,
        newTotalAssets: redeemData.newTotalAssets,
        newTotalSupply: redeemData.newTotalSupply,
        timestamp: redeemData.timestamp,
        timestampDate: redeemData.timestampDate,
        updatedVaultDepositId: redeemData.updatedVaultDepositId,
        vaultRedeemUpdateError: redeemData.vaultRedeemUpdateError,
      };

      processedEvents.push(processedEvent);

      // Return the processed data
      this.clearCache();
      return {
        events: processedEvents,
      };
    } catch (error) {
      console.log(
        `Error processing redeem transaction: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Enhanced decodeFactoryFeesUpdated method to handle the complete fee structure
   * This is an independent clone that doesn't modify the existing decodeFactoryFeesUpdated method
   * @param buffer - The raw buffer containing the FactoryFeesUpdated event data
   * @returns Complete decoded FactoryFeesUpdated event data
   */
  private decodeFactoryFeesUpdatedEnhanced(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Factory address (32 bytes)
      const factory = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Updated by address (32 bytes)
      const updatedBy = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Old entry fee (u16)
      const oldEntryFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // New entry fee (u16)
      const newEntryFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // Old exit fee (u16)
      const oldExitFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // New exit fee (u16)
      const newExitFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // Old vault creation fee (u64)
      const oldVaultCreationFeeUsdc = buffer.readBigUInt64LE(offset);
      offset += 8;

      // New vault creation fee (u64)
      const newVaultCreationFeeUsdc = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Old min management fee (u16)
      const oldMinManagementFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // New min management fee (u16)
      const newMinManagementFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // Old max management fee (u16)
      const oldMaxManagementFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // New max management fee (u16)
      const newMaxManagementFeeBps = buffer.readUInt16LE(offset);
      offset += 2;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      const decodedEvent = {
        eventType: "FactoryFeesUpdated",
        factory: factory.toString(),
        updatedBy: updatedBy.toString(),
        oldEntryFeeBps,
        newEntryFeeBps,
        oldExitFeeBps,
        newExitFeeBps,
        oldVaultCreationFeeUsdc: oldVaultCreationFeeUsdc.toString(),
        newVaultCreationFeeUsdc: newVaultCreationFeeUsdc.toString(),
        oldMinManagementFeeBps,
        newMinManagementFeeBps,
        oldMaxManagementFeeBps,
        newMaxManagementFeeBps,
        timestamp: timestamp.toString(),
        updatedAt: date.toISOString(),
      };

      return decodedEvent;
    } catch (error) {
      console.log(
        `Error decoding enhanced FactoryFeesUpdated: ${error.message}`
      );
      return this.decodeGeneric(buffer, "FactoryFeesUpdated");
    }
  }

  private decodeVaultDeposited(buffer: Buffer): any {
    let offset = 8; // Skip discriminator

    try {
      // Vault address (32 bytes)
      const vault = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // User address (32 bytes)
      const user = new PublicKey(buffer.slice(offset, offset + 32));
      offset += 32;

      // Amount (u64)
      const amount = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Shares minted (u64)
      const sharesMinted = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Entry fee (u64)
      const entryFee = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Net amount (u64)
      const netAmount = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Total assets (u64)
      const totalAssets = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Total shares (u64)
      const totalShares = buffer.readBigUInt64LE(offset);
      offset += 8;

      // Timestamp (i64)
      const timestamp = buffer.readBigInt64LE(offset);
      const date = new Date(Number(timestamp) * 1000);

      const decodedEvent = {
        event_type: "VaultDeposited",
        vault: vault.toString(),
        user: user.toString(),
        amount: amount.toString(),
        shares_minted: sharesMinted.toString(),
        entry_fee: entryFee.toString(),
        net_amount: netAmount.toString(),
        total_assets: totalAssets.toString(),
        total_shares: totalShares.toString(),
        timestamp: timestamp.toString(),
        timestamp_date: date.toISOString(),
      };

      return decodedEvent;
    } catch (error) {
      console.log(`Error decoding VaultDeposited: ${error.message}`);
      return this.decodeGeneric(buffer, "VaultDeposited");
    }
  }

  /**
   * Clear all vault-related cache entries
   */
  private async clearCache(): Promise<void> {
    try {
      // Clear cache with pattern matching for vault-factory keys
      const keys = await this.redisService.keys("vaults:*");
      if (keys.length > 0) {
        for (const key of keys) {
          await this.redisService.delDirect(key);
        }
        // Cache cleared successfully
        this.redisService.delDirect("dashboard:vault-stats");
        this.redisService.delDirect("vault-deposit:*");
        this.redisService.delDirect("history:findTransactionHistory:*");
      } else {
        // No cache entries found to clear
      }
    } catch (error) {
      console.log("❌ Error clearing vault cache:", error);
    }
  }
}
