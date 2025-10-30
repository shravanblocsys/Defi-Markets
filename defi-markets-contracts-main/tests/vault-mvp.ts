import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VaultMvp } from "../target/types/vault_mvp";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";

describe("vault-mvp", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.vaultMvp as Program<VaultMvp>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = provider.wallet;
  
  // Helper function to deploy the program
  async function deployProgram() {
    try {
      // Initialize the program
      const tx = await program.methods.initialize().rpc();
      console.log("Program initialized with tx:", tx);
      return tx;
    } catch (error) {
      console.error("Error deploying program:", error);
      throw error;
    }
  }

  // Constants from the program
  const DEFAULT_ENTRY_EXIT_FEE_BPS = 25; // 0.25%
  const DEFAULT_MIN_MANAGEMENT_FEE_BPS = 50; // 0.5%
  const DEFAULT_MAX_MANAGEMENT_FEE_BPS = 300; // 3%
  const DEFAULT_VAULT_CREATION_FEE_USDC = 10_000_000; // $10 with 6 decimals

  // Factory PDA
  const [factoryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("factory_v2")],
    program.programId
  );

  it("Is initialized!", async () => {
    // Deploy the program
    const tx = await deployProgram();
    console.log("Your transaction signature", tx);
  });
  
  it("Create vault", async () => {
    // Make sure the factory is initialized first
    await deployProgram();
    
    // Initialize factory if not already done
    try {
      // Create a fee recipient account (using wallet for simplicity)
      const feeRecipient = wallet.publicKey;
      
      // Use the program's own ID as the etf_vault_program for testing
      const etfVaultProgram = program.programId;

      // Initialize factory
      await program.methods
        .initializeFactory(
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          DEFAULT_VAULT_CREATION_FEE_USDC,
          DEFAULT_MIN_MANAGEMENT_FEE_BPS,
          DEFAULT_MAX_MANAGEMENT_FEE_BPS
        )
        .accounts({
          admin: wallet.publicKey,
          factory: factoryPDA,
          feeRecipient: feeRecipient,
          etfVaultProgram: etfVaultProgram,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });

      // Create vault parameters
      const vaultName = "Test Vault";
      const vaultSymbol = "TVLT";
      
      // Get factory account to determine vault count
      const factoryAccount = await program.account.factory.fetch(factoryPDA);
      const vaultCount = factoryAccount.vault_count;
      
      // Calculate vault PDA
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultCount + 1).toArrayLike(Buffer, 'be', 4)],
        program.programId
      );
      
      // Create vault
      const createVaultTx = await program.methods
        .createVault(vaultName, vaultSymbol)
        .accounts({
          admin: wallet.publicKey,
          factory: factoryPDA,
          vaultAccount: vaultPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });
        
      console.log("Vault created! Transaction signature:", createVaultTx);
      
      // Fetch the vault account to verify creation
      const vaultAccount = await program.account.vaultInfo.fetch(vaultPDA);
      console.log("Vault account:", {
        factory: vaultAccount.factory.toString(),
        vaultName: vaultAccount.vault_name,
        vaultSymbol: vaultAccount.vault_symbol,
        creator: vaultAccount.creator.toString(),
        creationTime: vaultAccount.creation_time.toString(),
      });
      
      // Verify the vault was created correctly
      expect(vaultAccount.factory.toString()).to.equal(factoryPDA.toString());
      expect(vaultAccount.vault_name).to.equal(vaultName);
      expect(vaultAccount.vault_symbol).to.equal(vaultSymbol);
      expect(vaultAccount.creator.toString()).to.equal(wallet.publicKey.toString());
      
      // Verify factory vault count was incremented
      const updatedFactoryAccount = await program.account.factory.fetch(factoryPDA);
      expect(updatedFactoryAccount.vault_count).to.equal(vaultCount + 1);
      
    } catch (error) {
      console.error("Error creating vault:", error);
      throw error;
    }
  });

  it("Initialize factory", async () => {
    // Make sure the program is initialized first
    await deployProgram();
    // Create a fee recipient account (using wallet for simplicity)
    const feeRecipient = wallet.publicKey;
    
    // Use the program's own ID as the etf_vault_program for testing
    const etfVaultProgram = program.programId;

    try {
      // Build the transaction
      const tx = await program.methods
        .initializeFactory(
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          DEFAULT_ENTRY_EXIT_FEE_BPS,
          DEFAULT_VAULT_CREATION_FEE_USDC,
          DEFAULT_MIN_MANAGEMENT_FEE_BPS,
          DEFAULT_MAX_MANAGEMENT_FEE_BPS
        )
        .accounts({
          admin: wallet.publicKey,
          factory: factoryPDA,
          feeRecipient: feeRecipient,
          etfVaultProgram: etfVaultProgram,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([]) // No additional signers needed as wallet is already the default signer
        .rpc({ commitment: 'confirmed' }); // Use confirmed commitment for better reliability

      console.log("Factory initialized! Transaction signature:", tx);

      // Wait for transaction confirmation
      await provider.connection.confirmTransaction(tx, 'confirmed');

      // Fetch the factory account to verify initialization
      const factoryAccount = await program.account.factory.fetch(factoryPDA);
      console.log("Factory account:", {
        admin: factoryAccount.admin.toString(),
        feeRecipient: factoryAccount.fee_recipient.toString(),
        entryFeeBps: factoryAccount.entry_fee_bps,
        exitFeeBps: factoryAccount.exit_fee_bps,
        vaultCreationFeeUsdc: factoryAccount.vault_creation_fee_usdc.toString(),
        minManagementFeeBps: factoryAccount.min_management_fee_bps,
        maxManagementFeeBps: factoryAccount.max_management_fee_bps,
        vaultCount: factoryAccount.vault_count,
        state: factoryAccount.state,
        etfVaultProgram: factoryAccount.etf_vault_program.toString(),
      });

      // Verify the factory was initialized correctly
      expect(factoryAccount.admin.toString()).to.equal(wallet.publicKey.toString());
      expect(factoryAccount.fee_recipient.toString()).to.equal(feeRecipient.toString());
      expect(factoryAccount.entry_fee_bps).to.equal(DEFAULT_ENTRY_EXIT_FEE_BPS);
      expect(factoryAccount.exit_fee_bps).to.equal(DEFAULT_ENTRY_EXIT_FEE_BPS);
      expect(factoryAccount.vault_creation_fee_usdc.toString()).to.equal(DEFAULT_VAULT_CREATION_FEE_USDC.toString());
      expect(factoryAccount.min_management_fee_bps).to.equal(DEFAULT_MIN_MANAGEMENT_FEE_BPS);
      expect(factoryAccount.max_management_fee_bps).to.equal(DEFAULT_MAX_MANAGEMENT_FEE_BPS);
      expect(factoryAccount.vault_count).to.equal(0);
    } catch (error) {
      console.error("Error initializing factory:", error);
      throw error;
    }
  });
});
