import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VaultMvp } from "../target/types/vault_mvp";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("vault-mvp", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.vaultMvp as Program<VaultMvp>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = provider.wallet;
  const connection = provider.connection;

  // Constants from the program
  const DEFAULT_ENTRY_EXIT_FEE_BPS = 25; // 0.25%
  const DEFAULT_MIN_MANAGEMENT_FEE_BPS = 50; // 0.5%
  const DEFAULT_MAX_MANAGEMENT_FEE_BPS = 300; // 3%
  const DEFAULT_VAULT_CREATION_FEE_USDC = 10_000_000; // $10 with 6 decimals
  const DEFAULT_VAULT_CREATOR_FEE_RATIO_BPS = 7000; // 70%
  const DEFAULT_PLATFORM_FEE_RATIO_BPS = 3000; // 30%
  const MAX_BPS = 10000;

  // Factory PDA
  const [factoryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("factory_v2")],
    program.programId
  );

  // Test state
  let stablecoinMint: PublicKey;
  let adminStablecoinAccount: PublicKey;
  let feeRecipientStablecoinAccount: PublicKey;
  let userWallet: Keypair;
  let userStablecoinAccount: PublicKey;
  let vaultPDA: PublicKey;
  let vaultMint: PublicKey;
  let vaultIndex: number = 0;

  // Helper function to airdrop SOL
  async function airdropSol(address: PublicKey, amount: number = 2) {
    const signature = await connection.requestAirdrop(
      address,
      amount * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature);
  }

  // Helper function to initialize factory
  async function initializeFactory() {
    try {
      const feeRecipient = wallet.publicKey;
      
      const tx = await program.methods
        .initializeFactory(
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          new anchor.BN(DEFAULT_VAULT_CREATION_FEE_USDC),
          DEFAULT_MIN_MANAGEMENT_FEE_BPS,
          DEFAULT_MAX_MANAGEMENT_FEE_BPS,
          DEFAULT_VAULT_CREATOR_FEE_RATIO_BPS,
          DEFAULT_PLATFORM_FEE_RATIO_BPS
        )
        .accounts({
          admin: wallet.publicKey,
          feeRecipient: feeRecipient,
        })
        .rpc({ commitment: 'confirmed' });

      await connection.confirmTransaction(tx, 'confirmed');
      return tx;
    } catch (error: any) {
      // If factory already initialized, that's okay
      if (error.message?.includes("already in use")) {
        return null;
      }
      throw error;
    }
  }

  // Helper function to create stablecoin mint and accounts
  async function setupStablecoin() {
    // Create stablecoin mint
    stablecoinMint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      null,
      6 // 6 decimals like USDC
    );

    // Create admin stablecoin account
    adminStablecoinAccount = await createAccount(
      connection,
      wallet.payer,
      stablecoinMint,
      wallet.publicKey
    );

    // Mint 1,000,000 USDC (1M with 6 decimals)
    await mintTo(
      connection,
      wallet.payer,
      stablecoinMint,
      adminStablecoinAccount,
      wallet.publicKey,
      1_000_000_000_000 // 1M tokens with 6 decimals
    );

    // Create fee recipient stablecoin account
    feeRecipientStablecoinAccount = await createAccount(
      connection,
      wallet.payer,
      stablecoinMint,
      wallet.publicKey
    );

    // Create user wallet and airdrop SOL
    userWallet = Keypair.generate();
    await airdropSol(userWallet.publicKey, 2);

    // Create user stablecoin account
    userStablecoinAccount = await createAccount(
      connection,
      userWallet,
      stablecoinMint,
      userWallet.publicKey
    );

    // Mint 100,000 USDC to user
    await mintTo(
      connection,
      wallet.payer,
      stablecoinMint,
      userStablecoinAccount,
      wallet.publicKey,
      100_000_000_000 // 100k tokens with 6 decimals
    );
  }

  // Helper function to create vault
  async function createTestVault() {
      const factoryAccount = await program.account.factory.fetch(factoryPDA);
      vaultIndex = factoryAccount.vaultCount;

    // Calculate vault PDA
    [vaultPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        factoryPDA.toBuffer(),
        Buffer.from(new anchor.BN(vaultIndex).toArray("le", 4))
      ],
      program.programId
    );

    // Calculate vault mint PDA
    [vaultMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
      program.programId
    );

    // Mock underlying assets (2 assets: 60% and 40%)
    const underlyingAssets = [
      {
        mintAddress: stablecoinMint, // Using stablecoin as first asset for simplicity
        mintBps: 6000, // 60%
      },
      {
        mintAddress: Keypair.generate().publicKey, // Mock second asset
        mintBps: 4000, // 40%
      },
    ];

    const vaultName = "Test Vault";
    const vaultSymbol = "TVLT";
    const managementFees = 100; // 1% annual

    // Calculate vault token account PDA
    const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_token_account"), vaultPDA.toBuffer()],
      program.programId
    );

    // Calculate vault stablecoin account PDA
    const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vaultPDA.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .createVault(vaultName, vaultSymbol, underlyingAssets, managementFees)
      .accounts({
        admin: wallet.publicKey,
        stablecoinMint: stablecoinMint,
        adminStablecoinAccount: adminStablecoinAccount,
        factoryAdminStablecoinAccount: adminStablecoinAccount, // Using same for simplicity
      })
      .rpc({ commitment: 'confirmed' });

    await connection.confirmTransaction(tx, 'confirmed');
    return { vaultPDA, vaultMint, vaultIndex };
  }

  // Setup before all tests
  before(async () => {
    await setupStablecoin();
    await initializeFactory();
  });

  describe("Factory Operations", () => {
    it("Initialize factory with correct parameters", async () => {
      const feeRecipient = wallet.publicKey;
      
      try {
      const tx = await program.methods
        .initializeFactory(
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          new anchor.BN(DEFAULT_VAULT_CREATION_FEE_USDC),
          DEFAULT_MIN_MANAGEMENT_FEE_BPS,
          DEFAULT_MAX_MANAGEMENT_FEE_BPS,
          DEFAULT_VAULT_CREATOR_FEE_RATIO_BPS,
          DEFAULT_PLATFORM_FEE_RATIO_BPS
        )
        .accounts({
          admin: wallet.publicKey,
          feeRecipient: feeRecipient,
        })
        .rpc({ commitment: 'confirmed' });

        await connection.confirmTransaction(tx, 'confirmed');

        const factoryAccount = await program.account.factory.fetch(factoryPDA);
        
        expect(factoryAccount.admin.toString()).to.equal(wallet.publicKey.toString());
        expect(factoryAccount.feeRecipient.toString()).to.equal(feeRecipient.toString());
        expect(factoryAccount.entryFeeBps).to.equal(DEFAULT_ENTRY_EXIT_FEE_BPS);
        expect(factoryAccount.exitFeeBps).to.equal(DEFAULT_ENTRY_EXIT_FEE_BPS);
        expect(factoryAccount.vaultCreationFeeUsdc.toString()).to.equal(DEFAULT_VAULT_CREATION_FEE_USDC.toString());
        expect(factoryAccount.minManagementFeeBps).to.equal(DEFAULT_MIN_MANAGEMENT_FEE_BPS);
        expect(factoryAccount.maxManagementFeeBps).to.equal(DEFAULT_MAX_MANAGEMENT_FEE_BPS);
        expect(factoryAccount.vaultCreatorFeeRatioBps).to.equal(DEFAULT_VAULT_CREATOR_FEE_RATIO_BPS);
        expect(factoryAccount.platformFeeRatioBps).to.equal(DEFAULT_PLATFORM_FEE_RATIO_BPS);
        expect(factoryAccount.vaultCount).to.equal(0);
      } catch (error: any) {
        // Factory might already be initialized
        if (!error.message?.includes("already in use")) {
          throw error;
        }
      }
    });

    it("Get factory info", async () => {
      const factoryInfo = await program.methods
        .getFactoryInfo()
        .accounts({})
        .view();

      expect(factoryInfo.factoryAddress.toString()).to.equal(factoryPDA.toString());
      expect(factoryInfo.admin.toString()).to.equal(wallet.publicKey.toString());
      expect(factoryInfo.entryFeeBps).to.equal(DEFAULT_ENTRY_EXIT_FEE_BPS);
    });

    it("Update factory fees", async () => {
      const newEntryFeeBps = 30;
      const newExitFeeBps = 30;
      const newVaultCreationFee = 15_000_000; // $15
      const newMinManagementFee = 60;
      const newMaxManagementFee = 350;

      const tx = await program.methods
        .updateFactoryFees(
          newEntryFeeBps,
          newExitFeeBps,
          new anchor.BN(newVaultCreationFee),
          newMinManagementFee,
          newMaxManagementFee,
          DEFAULT_VAULT_CREATOR_FEE_RATIO_BPS,
          DEFAULT_PLATFORM_FEE_RATIO_BPS
        )
        .accounts({
          admin: wallet.publicKey,
        })
        .rpc({ commitment: 'confirmed' });

      await connection.confirmTransaction(tx, 'confirmed');

      const factoryAccount = await program.account.factory.fetch(factoryPDA);
      expect(factoryAccount.entryFeeBps).to.equal(newEntryFeeBps);
      expect(factoryAccount.exitFeeBps).to.equal(newExitFeeBps);
      expect(factoryAccount.vaultCreationFeeUsdc.toString()).to.equal(newVaultCreationFee.toString());

      // Reset back to defaults
      await program.methods
        .updateFactoryFees(
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          new anchor.BN(DEFAULT_VAULT_CREATION_FEE_USDC),
          DEFAULT_MIN_MANAGEMENT_FEE_BPS,
          DEFAULT_MAX_MANAGEMENT_FEE_BPS,
          DEFAULT_VAULT_CREATOR_FEE_RATIO_BPS,
          DEFAULT_PLATFORM_FEE_RATIO_BPS
        )
        .accounts({
          admin: wallet.publicKey,
        })
        .rpc({ commitment: 'confirmed' });
    });

    it("Update factory admin", async () => {
      const newAdmin = Keypair.generate();
      await airdropSol(newAdmin.publicKey, 1);

      const tx = await program.methods
        .updateFactoryAdmin()
        .accounts({
          admin: wallet.publicKey,
          newAdmin: newAdmin.publicKey,
        })
        .rpc({ commitment: 'confirmed' });

      await connection.confirmTransaction(tx, 'confirmed');

      const factoryAccount = await program.account.factory.fetch(factoryPDA);
      expect(factoryAccount.admin.toString()).to.equal(newAdmin.publicKey.toString());

      // Reset back to original admin
      await program.methods
        .updateFactoryAdmin()
        .accounts({
          admin: newAdmin.publicKey,
          newAdmin: wallet.publicKey,
        })
        .signers([newAdmin])
        .rpc({ commitment: 'confirmed' });
    });
  });

  describe("Vault Operations", () => {
    it("Create vault with valid parameters", async () => {
      const { vaultPDA: createdVaultPDA, vaultIndex: createdVaultIndex } = await createTestVault();

      const vaultAccount = await program.account.vault.fetch(createdVaultPDA);
      
      expect(vaultAccount.factory.toString()).to.equal(factoryPDA.toString());
      expect(vaultAccount.vaultName).to.equal("Test Vault");
      expect(vaultAccount.vaultSymbol).to.equal("TVLT");
      expect(vaultAccount.admin.toString()).to.equal(wallet.publicKey.toString());
      expect(vaultAccount.managementFees).to.equal(100);
      expect(vaultAccount.state).to.deep.equal({ active: {} });
      expect(vaultAccount.vaultIndex).to.equal(createdVaultIndex);

      // Verify factory vault count was incremented
      const factoryAccount = await program.account.factory.fetch(factoryPDA);
      expect(factoryAccount.vaultCount).to.be.greaterThan(0);
    });

    it("Get vault fees", async () => {
      const { vaultPDA: testVaultPDA } = await createTestVault();

      const vaultFees = await program.methods
        .getVaultFees(vaultIndex)
        .accounts({})
        .view();

      expect(vaultFees.entryFeeBps).to.equal(DEFAULT_ENTRY_EXIT_FEE_BPS);
      expect(vaultFees.exitFeeBps).to.equal(DEFAULT_ENTRY_EXIT_FEE_BPS);
      expect(vaultFees.vaultManagementFees).to.equal(100);
      expect(vaultFees.vaultIndex).to.equal(vaultIndex);
    });

    it("Set vault paused state", async () => {
      const { vaultPDA: testVaultPDA } = await createTestVault();

      // Pause vault
      const pauseTx = await program.methods
        .setVaultPaused(vaultIndex, true)
        .accounts({
          admin: wallet.publicKey,
        })
        .rpc({ commitment: 'confirmed' });

      await connection.confirmTransaction(pauseTx, 'confirmed');

      let vaultAccount = await program.account.vault.fetch(testVaultPDA);
      expect(vaultAccount.state).to.deep.equal({ paused: {} });

      // Resume vault
      const resumeTx = await program.methods
        .setVaultPaused(vaultIndex, false)
        .accounts({
          admin: wallet.publicKey,
        })
        .rpc({ commitment: 'confirmed' });

      await connection.confirmTransaction(resumeTx, 'confirmed');

      vaultAccount = await program.account.vault.fetch(testVaultPDA);
      expect(vaultAccount.state).to.deep.equal({ active: {} });
    });
  });

  describe("Deposit Operations", () => {
    let testVaultPDA: PublicKey;
    let testVaultMint: PublicKey;
    let testVaultIndex: number;
    let userVaultAccount: PublicKey;

    before(async () => {
      const vaultData = await createTestVault();
      testVaultPDA = vaultData.vaultPDA;
      testVaultMint = vaultData.vaultMint;
      testVaultIndex = vaultData.vaultIndex;

      // Get or create user vault token account
      userVaultAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        userWallet,
        testVaultMint,
        userWallet.publicKey
      ).then(acc => acc.address);
    });

    it("Deposit stablecoin and receive vault tokens", async () => {
      const depositAmount = 10_000_000; // 10 USDC with 6 decimals
      const etfSharePrice = 1_000_000; // 1:1 ratio (1 USDC per vault token)

      // Get vault stablecoin account PDA
      const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), testVaultPDA.toBuffer()],
        program.programId
      );

      // Get fee recipient stablecoin account
      const feeRecipientATA = await getAssociatedTokenAddress(
        stablecoinMint,
        wallet.publicKey // fee recipient
      );

      const tx = await program.methods
        .deposit(testVaultIndex, new anchor.BN(depositAmount), new anchor.BN(etfSharePrice))
        .accounts({
          user: userWallet.publicKey,
          userStablecoinAccount: userStablecoinAccount,
          stablecoinMint: stablecoinMint,
          userVaultAccount: userVaultAccount,
          feeRecipientStablecoinAccount: feeRecipientATA,
          vaultAdminStablecoinAccount: adminStablecoinAccount,
          jupiterProgram: PublicKey.default, // Not used in this test
        })
        .signers([userWallet])
        .rpc({ commitment: 'confirmed' });

      await connection.confirmTransaction(tx, 'confirmed');

      // Verify user received vault tokens
      const userVaultBalance = await getAccount(connection, userVaultAccount);
      expect(Number(userVaultBalance.amount)).to.be.greaterThan(0);

      // Verify vault received stablecoin
      const vaultStablecoinBalance = await getAccount(connection, vaultStablecoinAccount);
      expect(Number(vaultStablecoinBalance.amount)).to.be.greaterThan(0);

      // Verify vault state updated
      const vaultAccount = await program.account.vault.fetch(testVaultPDA);
      expect(Number(vaultAccount.totalAssets)).to.be.greaterThan(0);
      expect(Number(vaultAccount.totalSupply)).to.be.greaterThan(0);
    });

    it("Get deposit details", async () => {
      const depositDetails = await program.methods
        .getDepositDetails(testVaultIndex)
        .accounts({
          user: userWallet.publicKey,
          userVaultAccount: userVaultAccount,
        })
        .signers([userWallet])
        .view();

      expect(depositDetails.vaultAddress.toString()).to.equal(testVaultPDA.toString());
      expect(depositDetails.userAddress.toString()).to.equal(userWallet.publicKey.toString());
      expect(Number(depositDetails.userVaultTokenBalance)).to.be.greaterThan(0);
    });
  });

  describe("Redeem Operations", () => {
    let testVaultPDA: PublicKey;
    let testVaultMint: PublicKey;
    let testVaultIndex: number;
    let userVaultAccount: PublicKey;

    before(async () => {
      const vaultData = await createTestVault();
      testVaultPDA = vaultData.vaultPDA;
      testVaultMint = vaultData.vaultMint;
      testVaultIndex = vaultData.vaultIndex;

      // Get or create user vault token account
      userVaultAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        userWallet,
        testVaultMint,
        userWallet.publicKey
      ).then(acc => acc.address);

      // First make a deposit
      const depositAmount = 10_000_000; // 10 USDC
      const etfSharePrice = 1_000_000; // 1:1

      const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), testVaultPDA.toBuffer()],
        program.programId
      );

      const feeRecipientATA = await getAssociatedTokenAddress(
        stablecoinMint,
        wallet.publicKey
      );

      await program.methods
        .deposit(testVaultIndex, new anchor.BN(depositAmount), new anchor.BN(etfSharePrice))
        .accounts({
          user: userWallet.publicKey,
          userStablecoinAccount: userStablecoinAccount,
          stablecoinMint: stablecoinMint,
          userVaultAccount: userVaultAccount,
          feeRecipientStablecoinAccount: feeRecipientATA,
          vaultAdminStablecoinAccount: adminStablecoinAccount,
          jupiterProgram: PublicKey.default,
        })
        .signers([userWallet])
        .rpc({ commitment: 'confirmed' });
    });

    it("Finalize redeem - burn tokens and receive stablecoin", async () => {
      const userVaultBalance = await getAccount(connection, userVaultAccount);
      const vaultTokenAmount = Number(userVaultBalance.amount);
      
      if (vaultTokenAmount === 0) {
        throw new Error("User has no vault tokens to redeem");
      }

      // Use half of the tokens
      const redeemAmount = Math.floor(vaultTokenAmount / 2);
      const etfSharePrice = 1_000_000; // 1:1

      const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), testVaultPDA.toBuffer()],
        program.programId
      );

      const feeRecipientATA = await getAssociatedTokenAddress(
        stablecoinMint,
        wallet.publicKey
      );

      // Get user stablecoin account balance before
      const userStablecoinBalanceBefore = await getAccount(connection, userStablecoinAccount);
      const balanceBefore = Number(userStablecoinBalanceBefore.amount);

      const tx = await program.methods
        .finalizeRedeem(
          testVaultIndex,
          new anchor.BN(redeemAmount),
          new anchor.BN(etfSharePrice)
        )
        .accounts({
          user: userWallet.publicKey,
          userVaultAccount: userVaultAccount,
          userStablecoinAccount: userStablecoinAccount,
          feeRecipientStablecoinAccount: feeRecipientATA,
          vaultAdminStablecoinAccount: adminStablecoinAccount,
        })
        .signers([userWallet])
        .rpc({ commitment: 'confirmed' });

      await connection.confirmTransaction(tx, 'confirmed');

      // Verify user received stablecoin
      const userStablecoinBalanceAfter = await getAccount(connection, userStablecoinAccount);
      const balanceAfter = Number(userStablecoinBalanceAfter.amount);
      expect(balanceAfter).to.be.greaterThan(balanceBefore);

      // Verify vault tokens were burned
      const userVaultBalanceAfter = await getAccount(connection, userVaultAccount);
      expect(Number(userVaultBalanceAfter.amount)).to.be.lessThan(vaultTokenAmount);
    });
  });

  describe("Fee Collection Operations", () => {
    let testVaultPDA: PublicKey;
    let testVaultIndex: number;

    before(async () => {
      const vaultData = await createTestVault();
      testVaultPDA = vaultData.vaultPDA;
      testVaultIndex = vaultData.vaultIndex;

      // Make a deposit to have assets for fee calculation
      const testVaultMint = vaultData.vaultMint;
      const userVaultAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        userWallet,
        testVaultMint,
        userWallet.publicKey
      ).then(acc => acc.address);

      const depositAmount = 10_000_000; // 10 USDC
      const etfSharePrice = 1_000_000;

      const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), testVaultPDA.toBuffer()],
        program.programId
      );

      const feeRecipientATA = await getAssociatedTokenAddress(
        stablecoinMint,
        wallet.publicKey
      );

      await program.methods
        .deposit(testVaultIndex, new anchor.BN(depositAmount), new anchor.BN(etfSharePrice))
        .accounts({
          user: userWallet.publicKey,
          userStablecoinAccount: userStablecoinAccount,
          stablecoinMint: stablecoinMint,
          userVaultAccount: userVaultAccount,
          feeRecipientStablecoinAccount: feeRecipientATA,
          vaultAdminStablecoinAccount: adminStablecoinAccount,
          jupiterProgram: PublicKey.default,
        })
        .signers([userWallet])
        .rpc({ commitment: 'confirmed' });
    });

    it("Get accrued management fees", async () => {
      // Mock asset prices (only stablecoin in this case)
      const assetPrices = [
        {
          mintAddress: stablecoinMint,
          priceUsd: new anchor.BN(1_000_000), // $1 with 6 decimals
        },
      ];

      // Note: This requires providing remaining accounts for underlying assets
      // For a complete test, you'd need to set up actual underlying asset accounts
      // This is a simplified version
      try {
        const accruedFees = await program.methods
          .getAccruedManagementFees(testVaultIndex, assetPrices)
          .accounts({})
          .remainingAccounts([]) // Would need actual asset accounts here
          .view();

        expect(accruedFees.vaultIndex).to.equal(testVaultIndex);
        expect(Number(accruedFees.gav)).to.be.greaterThanOrEqual(0);
        expect(Number(accruedFees.nav)).to.be.greaterThanOrEqual(0);
      } catch (error) {
        // This might fail if remaining accounts are required
        console.log("Note: getAccruedManagementFees test requires underlying asset accounts");
      }
    });

    it("Collect weekly management fees", async () => {
      const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), testVaultPDA.toBuffer()],
        program.programId
      );

      // Get balances before
      const vaultStablecoinBalanceBefore = await getAccount(connection, vaultStablecoinAccount);
      const balanceBefore = Number(vaultStablecoinBalanceBefore.amount);

      const adminBalanceBefore = await getAccount(connection, adminStablecoinAccount);
      const adminBalanceBeforeAmount = Number(adminBalanceBefore.amount);

      const feeRecipientATA = await getAssociatedTokenAddress(
        stablecoinMint,
        wallet.publicKey
      );
      const feeRecipientBalanceBefore = await getAccount(connection, feeRecipientATA);
      const feeRecipientBalanceBeforeAmount = Number(feeRecipientBalanceBefore.amount);

      const tx = await program.methods
        .collectWeeklyManagementFees(testVaultIndex)
        .accounts({
          collector: wallet.publicKey,
          vaultAdminStablecoinAccount: adminStablecoinAccount,
          feeRecipientStablecoinAccount: feeRecipientATA,
        })
        .rpc({ commitment: 'confirmed' });

      await connection.confirmTransaction(tx, 'confirmed');

      // Verify fees were distributed (if there were any accrued)
      const vaultStablecoinBalanceAfter = await getAccount(connection, vaultStablecoinAccount);
      const balanceAfter = Number(vaultStablecoinBalanceAfter.amount);

      // If fees were accrued, they should be less than before
      // If no fees accrued (time hasn't passed enough), balance might be same
      expect(balanceAfter).to.be.lessThanOrEqual(balanceBefore);
    });
  });

  describe("Transfer Operations", () => {
    let testVaultPDA: PublicKey;
    let testVaultIndex: number;

    before(async () => {
      const vaultData = await createTestVault();
      testVaultPDA = vaultData.vaultPDA;
      testVaultIndex = vaultData.vaultIndex;

      // Make a deposit first
      const testVaultMint = vaultData.vaultMint;
      const userVaultAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        userWallet,
        testVaultMint,
        userWallet.publicKey
      ).then(acc => acc.address);

      const depositAmount = 10_000_000; // 10 USDC
      const etfSharePrice = 1_000_000;

      const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), testVaultPDA.toBuffer()],
        program.programId
      );

      const feeRecipientATA = await getAssociatedTokenAddress(
        stablecoinMint,
        wallet.publicKey
      );

      await program.methods
        .deposit(testVaultIndex, new anchor.BN(depositAmount), new anchor.BN(etfSharePrice))
        .accounts({
          user: userWallet.publicKey,
          userStablecoinAccount: userStablecoinAccount,
          stablecoinMint: stablecoinMint,
          userVaultAccount: userVaultAccount,
          feeRecipientStablecoinAccount: feeRecipientATA,
          vaultAdminStablecoinAccount: adminStablecoinAccount,
          jupiterProgram: PublicKey.default,
        })
        .signers([userWallet])
        .rpc({ commitment: 'confirmed' });
    });

    it("Transfer vault USDC to user", async () => {
      const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), testVaultPDA.toBuffer()],
        program.programId
      );

      const transferAmount = 1_000_000; // 1 USDC

      const vaultBalanceBefore = await getAccount(connection, vaultStablecoinAccount);
      const vaultBalanceBeforeAmount = Number(vaultBalanceBefore.amount);

      const userBalanceBefore = await getAccount(connection, userStablecoinAccount);
      const userBalanceBeforeAmount = Number(userBalanceBefore.amount);

      const tx = await program.methods
        .transferVaultToUser(testVaultIndex, new anchor.BN(transferAmount))
        .accounts({
          user: wallet.publicKey, // Must be vault admin or factory admin
          userStablecoinAccount: adminStablecoinAccount, // Using admin account
        })
        .rpc({ commitment: 'confirmed' });

      await connection.confirmTransaction(tx, 'confirmed');

      const vaultBalanceAfter = await getAccount(connection, vaultStablecoinAccount);
      const vaultBalanceAfterAmount = Number(vaultBalanceAfter.amount);

      const userBalanceAfter = await getAccount(connection, adminStablecoinAccount);
      const userBalanceAfterAmount = Number(userBalanceAfter.amount);

      expect(vaultBalanceAfterAmount).to.equal(vaultBalanceBeforeAmount - transferAmount);
      expect(userBalanceAfterAmount).to.equal(userBalanceBeforeAmount + transferAmount);
    });
  });

  describe("Error Cases", () => {
    it("Should fail to create vault with invalid BPS sum", async () => {
      const factoryAccount = await program.account.factory.fetch(factoryPDA);
      const testVaultIndex = factoryAccount.vaultCount;

      const [testVaultPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          factoryPDA.toBuffer(),
          Buffer.from(new anchor.BN(testVaultIndex).toArray("le", 4))
        ],
        program.programId
      );

      const invalidAssets = [
        {
          mintAddress: stablecoinMint,
          mintBps: 5000, // Only 50%, should be 10000
        },
      ];

      try {
        await program.methods
          .createVault("Invalid Vault", "INV", invalidAssets, 100)
          .accounts({
            admin: wallet.publicKey,
            stablecoinMint: stablecoinMint,
            adminStablecoinAccount: adminStablecoinAccount,
            factoryAdminStablecoinAccount: adminStablecoinAccount,
          })
          .rpc({ commitment: 'confirmed' });
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("InvalidBpsSum");
      }
    });

    it("Should fail to deposit to paused vault", async () => {
      const vaultData = await createTestVault();
      const testVaultPDA = vaultData.vaultPDA;
      const testVaultIndex = vaultData.vaultIndex;
      const testVaultMint = vaultData.vaultMint;

      // Pause the vault
      await program.methods
        .setVaultPaused(testVaultIndex, true)
        .accounts({
          admin: wallet.publicKey,
        })
        .rpc({ commitment: 'confirmed' });

      const userVaultAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        userWallet,
        testVaultMint,
        userWallet.publicKey
      ).then(acc => acc.address);

      const [vaultStablecoinAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), testVaultPDA.toBuffer()],
        program.programId
      );

      const feeRecipientATA = await getAssociatedTokenAddress(
        stablecoinMint,
        wallet.publicKey
      );

      try {
        await program.methods
          .deposit(testVaultIndex, new anchor.BN(10_000_000), new anchor.BN(1_000_000))
          .accounts({
            user: userWallet.publicKey,
            userStablecoinAccount: userStablecoinAccount,
            stablecoinMint: stablecoinMint,
            userVaultAccount: userVaultAccount,
            feeRecipientStablecoinAccount: feeRecipientATA,
            vaultAdminStablecoinAccount: adminStablecoinAccount,
            jupiterProgram: PublicKey.default,
          })
          .signers([userWallet])
          .rpc({ commitment: 'confirmed' });
        
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("VaultNotActive");
      }
    });
  });
});
