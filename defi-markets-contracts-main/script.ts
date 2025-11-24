import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Connection, Keypair, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAccount, getMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getOrCreateAssociatedTokenAccount, createAssociatedTokenAccount } from "@solana/spl-token";
import { VaultMvp } from "./target/types/vault_mvp";
import idl from "./target/idl/vault_mvp.json";
import { readFileSync } from 'fs';
import { join } from 'path';

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const WALLET_ADDRESS = "CfPWebeQs8HqdUx1Y7bjsywAwAQmnmRYHo5eQstbQAgY";
// Example token mint addresses (replace with actual token mints)
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC

// Store created stablecoin mint address
let CREATED_STABLECOIN_MINT: PublicKey | null = null;

const PRIVATE_KEY = readFileSync(join(__dirname, 'keypairs/admin-keypair.json'), 'utf8');

// Hardcoded stablecoin mint address (created earlier)
const STABLECOIN_MINT = new PublicKey("E1QTr64giwB8pbPSx2Cj64fNi5sUriEAViAu1F6kQD4m");

// Random generation functions
function generateRandomVaultName(): string {
  const prefixes = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa"];
  const suffixes = ["Vault", "Fund", "Pool", "Strategy", "Index", "Portfolio", "Capital", "Assets", "Growth", "Yield"];
  const numbers = Math.floor(Math.random() * 9999) + 1;

  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

  return `${prefix} ${suffix} ${numbers}`;
}

function generateRandomVaultSymbol(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = Math.floor(Math.random() * 99) + 1;

  let symbol = "";
  for (let i = 0; i < 3; i++) {
    symbol += letters[Math.floor(Math.random() * letters.length)];
  }

  return `${symbol}${numbers}`;
}

// Create keypair from hardcoded private key
const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(PRIVATE_KEY)));

// Provider + connection
const RPC_URL = "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

// Create wallet from the keypair
const wallet = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, {
  preflightCommitment: "processed"
});
anchor.setProvider(provider);

// Program ID from deployed program
const programId = new PublicKey("CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs");

// Create program instance using the actual IDL
const program = new anchor.Program<VaultMvp>(
  idl as anchor.Idl,
  provider
) as anchor.Program<VaultMvp>;

// Helper function to create stablecoin token
async function createStablecoinToken() {
  console.log("🪙 Creating Stablecoin Token (like USDC)...");

  try {
    // Create mint with 6 decimals (like USDC)
    const mint = await createMint(
      connection,
      keypair, // payer
      keypair.publicKey, // mint authority
      keypair.publicKey, // freeze authority
      6 // decimals
    );

    console.log("✅ Stablecoin mint created:", mint.toBase58());

    // Create token account for the admin wallet
    const tokenAccount = await createAccount(
      connection,
      keypair, // payer
      mint, // mint
      keypair.publicKey // owner
    );

    console.log("✅ Token account created:", tokenAccount.toBase58());

    // Mint 100,000,000 tokens (100M with 6 decimals = 100,000,000,000,000 raw units)
    const mintAmount = 100_000_000 * Math.pow(10, 6); // 100M tokens with 6 decimals
    const mintTx = await mintTo(
      connection,
      keypair, // payer
      mint, // mint
      tokenAccount, // destination
      keypair, // authority
      mintAmount // amount
    );

    console.log("✅ Minted 100,000,000 tokens! tx:", mintTx);

    // Verify the mint
    const mintInfo = await getMint(connection, mint);
    console.log("📊 Mint Info:", {
      address: mint.toBase58(),
      decimals: mintInfo.decimals,
      supply: mintInfo.supply.toString(),
    });

    // Verify the token account
    const accountInfo = await getAccount(connection, tokenAccount);
    console.log("💳 Token Account Info:", {
      address: tokenAccount.toBase58(),
      mint: accountInfo.mint.toBase58(),
      owner: accountInfo.owner.toBase58(),
      amount: accountInfo.amount.toString(),
    });

    // Store the mint address for later use
    CREATED_STABLECOIN_MINT = mint;

    console.log("🎉 Stablecoin token creation completed!");
    console.log("📋 Mint Address:", mint.toBase58());
    console.log("📋 Token Account:", tokenAccount.toBase58());
    console.log("💰 Total Supply: 100,000,000 tokens");

    return { mint, tokenAccount };
  } catch (err) {
    console.error("❌ Stablecoin creation error:", err);
    throw err;
  }
}

// Helper function to initialize factory
async function initializeFactory() {
  console.log("🏭 Initializing Factory...");

  const [factoryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("factory_v2")], // Using v2 to avoid conflict with old factory
    program.programId
  );

  try {
    // Check if factory already exists
    const factoryInfo = await connection.getAccountInfo(factoryPDA);
    if (factoryInfo) {
      console.log("⚠️ Factory already initialized");
      const factory = await program.account.factory.fetch(factoryPDA);
      console.log("📦 Existing Factory:", factory);
      return factoryPDA;
    }

    // Initialize factory
    const tx = await program.methods
      .initializeFactory(
        25, // entry_fee_bps
        25, // exit_fee_bps
        new anchor.BN(10_000_000), // vault_creation_fee_usdc (10 USDC assuming 6 decimals)
        50, // min_management_fee_bps
        300, // max_management_fee_bps
        7000, // vault_creator_fee_ratio_bps
        3000, // platform_fee_ratio_bps

      )
      .accountsStrict({
        admin: wallet.publicKey,
        factory: factoryPDA,
        feeRecipient: new PublicKey(WALLET_ADDRESS),
        systemProgram: SystemProgram.programId
      })
      .rpc();

    console.log("✅ Factory initialized! tx:", tx);
    await connection.confirmTransaction(tx, "confirmed");

    const factory = await program.account.factory.fetch(factoryPDA);
    console.log("📦 Factory:", factory);
    return factoryPDA;
  } catch (err) {
    console.error("❌ Factory initialization error:", err);
    throw err;
  }
}

/**
 * Upload metadata JSON to IPFS using Pinata
 * You can also use NFT.Storage, Web3.Storage, or any other IPFS service
 * 
 * @param metadata - The metadata object to upload
 * @param logoUrl - URL to the token logo (can be IPFS URL or HTTP URL)
 * @returns IPFS URI (e.g., "ipfs://Qm...")
 */
async function uploadMetadataToIPFS(
  vaultName: string,
  vaultSymbol: string,
  logoUrl: string,
  managementFees: number,
  underlyingAssets: any[],
  vaultMintAddress?: string
): Promise<string> {
  // Pinata gateway URL
  const PINATA_GATEWAY = "https://red-late-constrictor-193.mypinata.cloud";
  
  // Option 1: Using Pinata (requires PINATA_JWT_TOKEN environment variable)
  // Get your JWT from https://app.pinata.cloud/
  // Support both PINATA_JWT_TOKEN and PINATA_JWT for backward compatibility
  const PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIyYTdjMzJkZi1iNGRiLTQ0NDQtYWExMC0zNzI0YmFmNzg2ZTkiLCJlbWFpbCI6ImJsb2NkZXY0QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJkOGU5NDQ1ZDU2NmM3NzViMDdhNiIsInNjb3BlZEtleVNlY3JldCI6ImU4NWJiNWRiYzVmNWU1NzFmNjIxYWIxODkzYzIwY2I4ZjkyZmEyYWJkNWE4NmNiNDNmNDA4NzAxYWE1MjA4ZTIiLCJleHAiOjE3OTQ2MzU0OTB9.oJiNM_YXiQy5LkVU3rKSsOtdjRBpZatISNv9jsDZHJo";
  
  if (PINATA_JWT) {
    try {
      // Convert IPFS URI to HTTP URL using Pinata gateway if needed
      // Always use gateway URL for image field so browsers can load it
      let imageUrl = logoUrl;
      if (logoUrl.startsWith('ipfs://')) {
        const ipfsHash = logoUrl.replace('ipfs://', '');
        imageUrl = `${PINATA_GATEWAY}/ipfs/${ipfsHash}`;
        console.log(`🖼️ Converted IPFS image URI to gateway URL: ${imageUrl}`);
      } else if (!logoUrl.startsWith('http://') && !logoUrl.startsWith('https://')) {
        // If it's just a hash without ipfs:// prefix, add gateway
        imageUrl = `${PINATA_GATEWAY}/ipfs/${logoUrl}`;
        console.log(`🖼️ Added gateway to image hash: ${imageUrl}`);
      } else if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
        // Already an HTTP URL, use as-is
        console.log(`🖼️ Using provided HTTP image URL: ${imageUrl}`);
      }

      // Standard NFT metadata format
      const metadata = {
        name: vaultName,
        symbol: vaultSymbol,
        description: `A DeFi vault token representing shares in ${vaultName}. Management fee: ${managementFees / 100}%`,
        image: imageUrl, // Use gateway HTTP URL (not ipfs://) so browsers can load it
        attributes: [
          {
            trait_type: "Management Fee",
            value: `${managementFees / 100}%`
          },
          {
            trait_type: "Underlying Assets",
            value: underlyingAssets.length.toString()
          }
        ],
        properties: {
          category: "DeFi Vault",
          vault_type: "Multi-Asset"
        },
        // Token Extensions format in additionalMetadata
        additionalMetadata: [
          {
            mint: vaultMintAddress || "", // Will be set after mint creation
            name: vaultName,
            symbol: vaultSymbol,
            updateAuthority: null,
            uri: "" // Will be set after upload
          }
        ]
      };

      // Create a sanitized filename from vault name
      const sanitizedVaultName = vaultName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const fileName = `${sanitizedVaultName}_${vaultSymbol}_metadata.json`;
      console.log(`📤 Uploading metadata to Pinata with name: ${fileName}`);
      
      const pinataData = {
        pinataMetadata: {
          name: fileName,
          keyvalues: {
            vaultName: vaultName,
            vaultSymbol: vaultSymbol,
            type: 'vault_metadata'
          }
        },
        pinataContent: metadata
      };

      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PINATA_JWT}`
        },
        body: JSON.stringify(pinataData)
      });

      if (!response.ok) {
        throw new Error(`Pinata upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      const ipfsHash = result.IpfsHash;
      const ipfsUri = `ipfs://${ipfsHash}`;
      const gatewayUri = `${PINATA_GATEWAY}/ipfs/${ipfsHash}`;
      
      // Update metadata with the actual URI and mint address if provided
      if (vaultMintAddress) {
        const updatedMetadata = {
          ...metadata,
          // Preserve the gateway URL for image (not ipfs://) so browsers can load it
          image: imageUrl, // Keep the gateway HTTP URL
          additionalMetadata: [
            {
              mint: vaultMintAddress,
              name: vaultName,
              symbol: vaultSymbol,
              updateAuthority: null,
              uri: gatewayUri // Use gateway URL in additionalMetadata
            }
          ]
        };
        
        // Re-upload with complete metadata
        const updatedFileName = `${sanitizedVaultName}_${vaultSymbol}_metadata_complete.json`;
        console.log(`📤 Re-uploading complete metadata to Pinata with name: ${updatedFileName}`);
        const updatedPinataData = {
          pinataMetadata: {
            name: updatedFileName,
            keyvalues: {
              vaultName: vaultName,
              vaultSymbol: vaultSymbol,
              mintAddress: vaultMintAddress,
              type: 'vault_metadata_complete'
            }
          },
          pinataContent: updatedMetadata
        };
        
        const updateResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PINATA_JWT}`
          },
          body: JSON.stringify(updatedPinataData)
        });
        
        if (updateResponse.ok) {
          const updateResult = await updateResponse.json();
          const updatedIpfsHash = updateResult.IpfsHash;
          const updatedGatewayUri = `${PINATA_GATEWAY}/ipfs/${updatedIpfsHash}`;
          console.log("✅ Metadata uploaded to IPFS with Token Extensions format");
          console.log(`📝 IPFS URI: ipfs://${updatedIpfsHash}`);
          console.log(`🌐 Gateway URL: ${updatedGatewayUri}`);
          console.log(`🖼️ Image URL in JSON metadata: ${imageUrl} (gateway HTTP URL for browser compatibility)`);
          console.log(`📋 On-chain URI will be: ${updatedGatewayUri} (gateway HTTP URL)`);
          return updatedGatewayUri; // Return gateway URL for on-chain storage
        }
      }
      
      console.log("✅ Metadata uploaded to IPFS");
      console.log(`📝 IPFS URI: ${ipfsUri}`);
      console.log(`🌐 Gateway URL: ${gatewayUri}`);
      console.log(`🖼️ Image URL in JSON metadata: ${imageUrl} (gateway HTTP URL for browser compatibility)`);
      console.log(`📋 On-chain URI will be: ${gatewayUri} (gateway HTTP URL)`);
      return gatewayUri; // Return gateway URL for on-chain storage
    } catch (error) {
      console.error("❌ Pinata upload error:", error);
      throw error;
    }
  }

  // Option 2: Using NFT.Storage (requires NFT_STORAGE_API_KEY environment variable)
  const NFT_STORAGE_API_KEY = process.env.NFT_STORAGE_API_KEY;
  
  if (NFT_STORAGE_API_KEY) {
    try {
      // Convert IPFS URI to HTTP URL using Pinata gateway if needed
      // Always use gateway URL for image field so browsers can load it
      let imageUrl = logoUrl;
      if (logoUrl.startsWith('ipfs://')) {
        const ipfsHash = logoUrl.replace('ipfs://', '');
        imageUrl = `${PINATA_GATEWAY}/ipfs/${ipfsHash}`;
        console.log(`🖼️ Converted IPFS image URI to gateway URL: ${imageUrl}`);
      } else if (!logoUrl.startsWith('http://') && !logoUrl.startsWith('https://')) {
        // If it's just a hash without ipfs:// prefix, add gateway
        imageUrl = `${PINATA_GATEWAY}/ipfs/${logoUrl}`;
        console.log(`🖼️ Added gateway to image hash: ${imageUrl}`);
      } else if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
        // Already an HTTP URL, use as-is
        console.log(`🖼️ Using provided HTTP image URL: ${imageUrl}`);
      }

      const metadata = {
        name: vaultName,
        symbol: vaultSymbol,
        description: `A DeFi vault token representing shares in ${vaultName}. Management fee: ${managementFees / 100}%`,
        image: imageUrl, // Use gateway HTTP URL (not ipfs://) so browsers can load it
        attributes: [
          {
            trait_type: "Management Fee",
            value: `${managementFees / 100}%`
          },
          {
            trait_type: "Underlying Assets",
            value: underlyingAssets.length.toString()
          }
        ],
        // Token Extensions format in additionalMetadata
        additionalMetadata: [
          {
            mint: vaultMintAddress || "",
            name: vaultName,
            symbol: vaultSymbol,
            updateAuthority: null,
            uri: ""
          }
        ]
      };

      const response = await fetch('https://api.nft.storage/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NFT_STORAGE_API_KEY}`
        },
        body: JSON.stringify(metadata)
      });

      if (!response.ok) {
        throw new Error(`NFT.Storage upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      const ipfsHash = result.value.cid;
      const ipfsUri = `ipfs://${ipfsHash}`;
      const gatewayUri = `${PINATA_GATEWAY}/ipfs/${ipfsHash}`;
      
      // Update metadata with the actual URI and mint address if provided
      if (vaultMintAddress) {
        const updatedMetadata = {
          ...metadata,
          // Preserve the gateway URL for image (not ipfs://) so browsers can load it
          image: imageUrl, // Keep the gateway HTTP URL
          additionalMetadata: [
            {
              mint: vaultMintAddress,
              name: vaultName,
              symbol: vaultSymbol,
              updateAuthority: null,
              uri: gatewayUri // Use gateway URL in additionalMetadata
            }
          ]
        };
        
        // Re-upload with complete metadata
        const updateResponse = await fetch('https://api.nft.storage/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NFT_STORAGE_API_KEY}`
          },
          body: JSON.stringify(updatedMetadata)
        });
        
        if (updateResponse.ok) {
          const updateResult = await updateResponse.json();
          const updatedIpfsHash = updateResult.value.cid;
          const updatedGatewayUri = `${PINATA_GATEWAY}/ipfs/${updatedIpfsHash}`;
          console.log("✅ Metadata uploaded to IPFS with Token Extensions format");
          console.log(`📝 IPFS URI: ipfs://${updatedIpfsHash}`);
          console.log(`🌐 Gateway URL: ${updatedGatewayUri}`);
          console.log(`🖼️ Image URL in JSON metadata: ${imageUrl} (gateway HTTP URL for browser compatibility)`);
          console.log(`📋 On-chain URI will be: ${updatedGatewayUri} (gateway HTTP URL)`);
          return updatedGatewayUri; // Return gateway URL for on-chain storage
        }
      }
      
      console.log("✅ Metadata uploaded to IPFS");
      console.log(`📝 IPFS URI: ${ipfsUri}`);
      console.log(`🌐 Gateway URL: ${gatewayUri}`);
      console.log(`🖼️ Image URL in JSON metadata: ${imageUrl} (gateway HTTP URL for browser compatibility)`);
      console.log(`📋 On-chain URI will be: ${gatewayUri} (gateway HTTP URL)`);
      return gatewayUri; // Return gateway URL for on-chain storage  
    } catch (error) {
      console.error("❌ NFT.Storage upload error:", error);
      throw error;
    }
  }

  // Fallback: Return empty string if no IPFS service is configured
  // You can manually upload the metadata and provide the URI
  console.warn("⚠️ No IPFS service configured. Set PINATA_JWT_TOKEN (or PINATA_JWT) or NFT_STORAGE_API_KEY environment variable.");
  console.warn("⚠️ Using empty metadata URI. You can update it later using UpdateMetadataAccountV2 instruction.");
  return "";
}

/**
 * Upload logo image to IPFS (optional - you can also host it elsewhere)
 * @param imagePath - Path to the image file
 * @returns IPFS URL of the uploaded image
 * 
 * Note: This requires the 'form-data' package. Install it with: npm install form-data
 * Or use a simpler approach: upload the image manually to IPFS and use the URL
 */
async function uploadLogoToIPFS(imagePath: string): Promise<string> {
  // Support both PINATA_JWT_TOKEN and PINATA_JWT for backward compatibility
  const PINATA_JWT = process.env.PINATA_JWT_TOKEN || process.env.PINATA_JWT;
  
  if (!PINATA_JWT) {
    throw new Error("PINATA_JWT_TOKEN or PINATA_JWT not set. Cannot upload logo to IPFS.");
  }

  try {
    const fs = require('fs');
    const FormData = require('form-data');
    const imageBuffer = fs.readFileSync(imagePath);
    
    const formData = new FormData();
    formData.append('file', imageBuffer, {
      filename: 'logo.png',
      contentType: 'image/png'
    });

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Pinata image upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    const ipfsHash = result.IpfsHash;
    const ipfsUrl = `ipfs://${ipfsHash}`;
    console.log("✅ Logo uploaded to IPFS:", ipfsUrl);
    return ipfsUrl;
  } catch (error) {
    console.error("❌ Logo upload error:", error);
    throw error;
  }
}

// Helper function to create vault
async function createVault(factoryPDA: PublicKey) {
  console.log("🏦 Creating Vault...");

  try {
    // Get factory account to get current vault count
    const factory = await program.account.factory.fetch(factoryPDA);
    const vaultIndex = factory.vaultCount;

    console.log(`📊 Creating vault #${vaultIndex + 1}`);

    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    // Calculate vault mint PDA
    const [vaultMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
      program.programId
    );

    // Calculate vault token account PDA
    const [vaultTokenAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_token_account"), vaultPDA.toBuffer()],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());
    console.log("🪙 Vault Mint PDA:", vaultMintPDA.toBase58());
    console.log("💳 Vault Token Account PDA:", vaultTokenAccountPDA.toBase58());

    // Calculate metadata account PDA
    // Metadata PDA seeds: ["metadata", TOKEN_METADATA_PROGRAM_ID, mint]
    const [metadataAccountPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        vaultMintPDA.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    console.log("📝 Metadata Account PDA:", metadataAccountPDA.toBase58());

    // Define underlying assets (50% TUSDT, 50% TETH)
    const TUSDT_MINT = new PublicKey("EnPkqHCtuwUKusntsvAhvCp27SEuqZbAHTgbL16oLcNN");
    const TETH_MINT = new PublicKey("7JLSv65QBmLfkCQrSYPgW8qezH5L8wC9gw5X38DrAgGk");
    const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const BTC_MINT = new PublicKey("9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E");
    const ETH_MINT = new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs");
    const USDT_MINT = new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
    const WETH_MINT = new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs");
    const WBTC_MINT = new PublicKey("9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E");
    // Note: These wrapped tokens from other chains may not exist on Solana
    // If you need them, replace with valid Solana token mint addresses
    // For now, using placeholder Solana addresses - replace with actual mints if needed
    const WBNB_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Placeholder - replace with actual WBNB mint if exists
    const WMATIC_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Placeholder - replace with actual WMATIC mint if exists
    const WAVAX_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Placeholder - replace with actual WAVAX mint if exists
    const WFTM_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Placeholder - replace with actual WFTM mint if exists
    const WONE_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Placeholder - replace with actual WONE mint if exists
    const WXRP_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Placeholder - replace with actual WXRP mint if exists
    
    // 16 assets with equal distribution (10000 / 16 = 625 BPS each)
    const underlyingAssets = [
      {
        mintAddress: TUSDT_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: TETH_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: SOL_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: USDC_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: WSOL_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: BTC_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: ETH_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: USDT_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: WETH_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: WBTC_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: WBNB_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: WMATIC_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: WAVAX_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: WFTM_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: WONE_MINT,
        mintBps: 625 // 6.25%
      },
      {
        mintAddress: WXRP_MINT,
        mintBps: 625 // 6.25%
      }
    ];

    console.log("📋 Underlying Assets:", underlyingAssets);

    // Generate random vault name and symbol
    const vaultName = generateRandomVaultName();
    const vaultSymbol = generateRandomVaultSymbol();

    console.log("🎲 Generated Vault Name:", vaultName);
    console.log("🎲 Generated Vault Symbol:", vaultSymbol);

    // Upload metadata to IPFS (including logo)
    // Option 1: Use a publicly accessible logo URL
    // Option 2: Upload logo to IPFS first, then use that URL in metadata
    // Default logo: IPFS-hosted vault logo
    const DEFAULT_LOGO_IPFS_CID = "bafkreigiksodcqfilcu447plm36gdhiv5espk4rv4j2iyqpyj3gpng6mfa";
    const DEFAULT_LOGO_URL = `https://red-late-constrictor-193.mypinata.cloud/ipfs/${DEFAULT_LOGO_IPFS_CID}`;
    const logoUrl = DEFAULT_LOGO_URL;
    console.log("🖼️ Using logo URL:", logoUrl);
    
    // Upload metadata with mint address for Token Extensions format
    let metadataUri = "";
    try {
      metadataUri = await uploadMetadataToIPFS(
        vaultName,
        vaultSymbol,
        logoUrl,
        200, // management fees
        underlyingAssets,
        vaultMintPDA.toBase58() // Pass mint address for Token Extensions format
      );
      console.log("📝 Metadata URI to be stored on-chain:", metadataUri);
    } catch (error) {
      console.warn("⚠️ Failed to upload metadata to IPFS, using empty URI:", error);
      metadataUri = ""; // Will use empty URI if upload fails
    }

    // Prepare stablecoin accounts for creation fee (10 USDC)
    // Use STABLECOIN_MINT as the USDC-equivalent mint
    const stablecoinMintForFee = STABLECOIN_MINT;

    // Admin's stablecoin (payer) ATA
    console.log("💳 Ensuring admin stablecoin account exists...");
    const adminStablecoinAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      stablecoinMintForFee,
      keypair.publicKey
    );
    console.log("✅ Admin stablecoin account:", adminStablecoinAccount.address.toBase58());

    // Factory admin's stablecoin (recipient) ATA
    console.log("💳 Ensuring factory admin stablecoin account exists...");
    const factoryAdminStablecoinAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      stablecoinMintForFee,
      factory.admin
    );
    console.log("✅ Factory admin stablecoin account:", factoryAdminStablecoinAccount.address.toBase58());
    
    // Verify accounts exist before proceeding - retry a few times if needed
    let adminAccountInfo = await connection.getAccountInfo(adminStablecoinAccount.address);
    let factoryAdminAccountInfo = await connection.getAccountInfo(factoryAdminStablecoinAccount.address);
    
    // Retry up to 3 times if accounts don't exist yet (network delay)
    let retries = 0;
    while ((!adminAccountInfo || !factoryAdminAccountInfo) && retries < 3) {
      console.log(`⏳ Waiting for accounts to be confirmed (attempt ${retries + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      adminAccountInfo = await connection.getAccountInfo(adminStablecoinAccount.address);
      factoryAdminAccountInfo = await connection.getAccountInfo(factoryAdminStablecoinAccount.address);
      retries++;
    }
    
    if (!adminAccountInfo) {
      throw new Error(`Admin stablecoin account was not created: ${adminStablecoinAccount.address.toBase58()}`);
    }
    if (!factoryAdminAccountInfo) {
      throw new Error(`Factory admin stablecoin account was not created: ${factoryAdminStablecoinAccount.address.toBase58()}`);
    }
    
    console.log("✅ Both token accounts verified and ready");

    // Create vault
    const tx = await program.methods
      .createVault(
        vaultName,        // vault_name (randomly generated)
        vaultSymbol,      // vault_symbol (randomly generated)
        underlyingAssets,
        200,             // management_fees (2%) - within current factory limits
        metadataUri      // metadata_uri (IPFS URI)
      )
      .accountsStrict({
        admin: wallet.publicKey,
        factory: factoryPDA,
        vault: vaultPDA,
        vaultMint: vaultMintPDA,
        vaultTokenAccount: vaultTokenAccountPDA,
        stablecoinMint: stablecoinMintForFee,
        adminStablecoinAccount: adminStablecoinAccount.address,
        factoryAdminStablecoinAccount: factoryAdminStablecoinAccount.address,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        metadataAccount: metadataAccountPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("✅ Vault created! tx:", tx);
    await connection.confirmTransaction(tx, "confirmed");

    // Fetch and display vault details
    const vault = await program.account.vault.fetch(vaultPDA);
    console.log("🏦 Vault Details:", {
      vaultIndex: vault.vaultIndex,
      vaultName: vault.vaultName,
      vaultSymbol: vault.vaultSymbol,
      underlyingAssets: vault.underlyingAssets,
      managementFees: vault.managementFees,
      state: vault.state,
      totalAssets: vault.totalAssets.toString(),
      totalSupply: vault.totalSupply.toString(),
      createdAt: new Date(vault.createdAt.toNumber() * 1000).toISOString()
    });

    // Verify metadata account was created correctly
    console.log("\n🔍 Verifying Token Metadata Account...");
    try {
      const metadataAccountInfo = await connection.getAccountInfo(metadataAccountPDA);
      if (metadataAccountInfo) {
        console.log("✅ Metadata account exists");
        console.log("📝 Metadata Account PDA:", metadataAccountPDA.toBase58());
        console.log("📏 Account size:", metadataAccountInfo.data.length, "bytes");
        
        // Try to parse metadata (simplified - just check if URI is there)
        // Metaplex V3 structure is more complex, but we can at least verify the account exists
        console.log("💡 View metadata on Solscan:");
        console.log(`   https://solscan.io/token/${vaultMintPDA.toBase58()}?cluster=devnet`);
        console.log("💡 View metadata on Solana Explorer:");
        console.log(`   https://explorer.solana.com/address/${vaultMintPDA.toBase58()}?cluster=devnet`);
        console.log("💡 View IPFS metadata:");
        if (metadataUri) {
          // metadataUri is now already a gateway URL
          console.log(`   ${metadataUri}`);
          // Also show the IPFS URI for reference
          if (metadataUri.includes('/ipfs/')) {
            const ipfsHash = metadataUri.split('/ipfs/')[1];
            console.log(`   IPFS URI: ipfs://${ipfsHash}`);
          }
        } else {
          console.log("   ⚠️ No metadata URI was set");
        }
      } else {
        console.log("❌ Metadata account not found!");
      }
    } catch (error) {
      console.warn("⚠️ Could not verify metadata account:", error);
    }

    console.log("\n📋 Summary:");
    console.log("   Vault Mint:", vaultMintPDA.toBase58());
    console.log("   Token Account:", vaultTokenAccountPDA.toBase58());
    console.log("   Metadata Account:", metadataAccountPDA.toBase58());
    console.log("   Metadata URI:", metadataUri || "(empty)");

    return vaultPDA;
  } catch (err) {
    console.error("❌ Vault creation error:", err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
      if (err.message.includes("Error Number:")) {
        console.error("Anchor error details:", err);
      }
    }
    throw err;
  }
}

// Helper function to get factory information
async function getFactoryInfo(factoryPDA: PublicKey) {
  console.log("📊 Getting Factory Information...");

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
}

// Helper function to get all vaults
async function getAllVaults(factoryPDA: PublicKey) {
  console.log("📋 Getting All Vaults Information...");

  try {
    // First get factory info to know how many vaults exist
    const factoryInfo = await getFactoryInfo(factoryPDA);
    const vaultCount = factoryInfo.vaultCount;

    console.log(`🔢 Found ${vaultCount} vaults in factory`);

    const allVaults = [];

    console.log(`✅ Successfully retrieved ${allVaults.length} vaults`);
    return allVaults;
  } catch (err) {
    console.error("❌ Get all vaults error:", err);
    throw err;
  }
}

// Helper function to get deposit details for a user and vault
async function getDepositDetails(factoryPDA: PublicKey, vaultIndex: number) {
  console.log(`📊 Getting Deposit Details for Vault #${vaultIndex}...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    // Calculate vault's stablecoin token account PDA
    const [vaultStablecoinAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_stablecoin_account"), vaultPDA.toBuffer()],
      program.programId
    );

    // Calculate vault mint PDA
    const [vaultMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
      program.programId
    );

    // Get or create user's vault token account
    const userVaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair, // payer
      vaultMintPDA, // mint
      keypair.publicKey // owner
    );

    const depositDetails = await program.methods
      .getDepositDetails(vaultIndex)
      .accountsStrict({
        user: keypair.publicKey,
        factory: factoryPDA,
        vault: vaultPDA,
        userVaultAccount: userVaultAccount.address,
        vaultStablecoinAccount: vaultStablecoinAccountPDA,
      })
      .view();

    console.log("📊 Deposit Details:", {
      vaultAddress: depositDetails.vaultAddress.toBase58(),
      vaultIndex: depositDetails.vaultIndex,
      vaultName: depositDetails.vaultName,
      vaultSymbol: depositDetails.vaultSymbol,
      userAddress: depositDetails.userAddress.toBase58(),
      userVaultTokenBalance: depositDetails.userVaultTokenBalance.toString(),
      vaultTotalAssets: depositDetails.vaultTotalAssets.toString(),
      vaultTotalSupply: depositDetails.vaultTotalSupply.toString(),
      vaultStablecoinBalance: depositDetails.vaultStablecoinBalance.toString(),
      stablecoinMint: depositDetails.stablecoinMint.toBase58(),
      vaultState: depositDetails.vaultState,
      createdAt: new Date(depositDetails.createdAt * 1000).toISOString(),
    });

    return depositDetails;
  } catch (err) {
    console.error("❌ Get deposit details error:", err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
    }
    throw err;
  }
}


// Helper to pause/resume a vault
async function setVaultPaused(factoryPDA: PublicKey, vaultIndex: number, paused: boolean) {
  console.log(`${paused ? "⏸️ Pausing" : "▶️ Resuming"} Vault #${vaultIndex}...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());

    const tx = await program.methods
      .setVaultPaused(vaultIndex, paused)
      .accountsStrict({
        admin: keypair.publicKey,
        factory: factoryPDA,
        vault: vaultPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✅ Vault ${paused ? "paused" : "resumed"}! tx:`, tx);
    await connection.confirmTransaction(tx, "confirmed");
  } catch (err) {
    console.error(`❌ Failed to ${paused ? "pause" : "resume"} vault:`, err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
    }
    throw err;
  }
}

// Helper function to get vault fees (factory fees + vault management fees)
async function getVaultFees(factoryPDA: PublicKey, vaultIndex: number) {
  console.log(`💰 Getting Vault #${vaultIndex} Fees...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    const vaultFees = await program.methods
      .getVaultFees(vaultIndex)
      .accountsStrict({
        factory: factoryPDA,
        vault: vaultPDA,
      })
      .view();

    console.log("💰 Vault Fees Information:", {
      // Factory fees
      entryFeeBps: vaultFees.entryFeeBps,
      exitFeeBps: vaultFees.exitFeeBps,
      vaultCreationFeeUsdc: vaultFees.vaultCreationFeeUsdc.toString(),
      minManagementFeeBps: vaultFees.minManagementFeeBps,
      maxManagementFeeBps: vaultFees.maxManagementFeeBps,
      
      // Vault-specific fees
      vaultManagementFees: vaultFees.vaultManagementFees,
      
      // Vault info
      vaultIndex: vaultFees.vaultIndex,
      vaultName: vaultFees.vaultName,
      vaultSymbol: vaultFees.vaultSymbol,
      vaultAdmin: vaultFees.vaultAdmin.toBase58(),
    });

    return vaultFees;
  } catch (err) {
    console.error("❌ Get vault fees error:", err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
    }
    throw err;
  }
}

// Helper function to update factory fees
async function updateFactoryFees(
  entryFeeBps: number,
  exitFeeBps: number,
  vaultCreationFeeUsdc: number,
  minManagementFeeBps: number,
  maxManagementFeeBps: number,
  vaultCreatorFeeRatioBps: number,
  platformFeeRatioBps: number
) {
  try {
    const [factoryPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("factory_v2")],
      program.programId
    );

    console.log("🏭 Factory PDA:", factoryPDA.toBase58());
    console.log("👤 Admin:", keypair.publicKey.toBase58());

    const tx = await program.methods
      .updateFactoryFees(
        entryFeeBps,
        exitFeeBps,
        new anchor.BN(vaultCreationFeeUsdc),
        minManagementFeeBps,
        maxManagementFeeBps,
        vaultCreatorFeeRatioBps,
        platformFeeRatioBps
      )
      .accountsStrict({
        admin: keypair.publicKey,
        factory: factoryPDA,
      })
      .rpc();

    console.log("✅ Factory fees updated! Transaction:", tx);
    await connection.confirmTransaction(tx, "confirmed");
    console.log("🎉 Transaction confirmed!");

  } catch (error) {
    console.error("❌ Error updating factory fees:", error.message);
    throw error;
  }
}

// Helper function to update vault management fees
async function updateVaultManagementFees(factoryPDA: PublicKey, vaultIndex: number, newManagementFees: number) {
  console.log(`💰 Updating Vault #${vaultIndex} Management Fees to ${newManagementFees} bps...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());
    console.log("👤 Admin:", keypair.publicKey.toBase58());

     // Note: updateVaultManagementFees method doesn't exist in the current program
     // This is a placeholder for future implementation
     throw new Error("updateVaultManagementFees method not implemented in current program version");
  } catch (error) {
    console.error("❌ Error updating vault management fees:", error.message);
    throw error;
  }
}

// Helper function to update vault underlying assets
async function updateVaultUnderlyingAssets(factoryPDA: PublicKey, vaultIndex: number, newUnderlyingAssets: any[]) {
  console.log(`🔄 Updating Vault #${vaultIndex} Underlying Assets...`);
  console.log("📊 New Underlying Assets:", newUnderlyingAssets);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());
    console.log("👤 Admin:", keypair.publicKey.toBase58());

     // Note: updateVaultUnderlyingAssets method doesn't exist in the current program
     // This is a placeholder for future implementation
     throw new Error("updateVaultUnderlyingAssets method not implemented in current program version");
  } catch (error) {
    console.error("❌ Error updating vault underlying assets:", error.message);
    throw error;
  }
}

// Helper function to distribute accrued fees as vault tokens
async function distributeAccruedFees(factoryPDA: PublicKey, vaultIndex: number) {
  console.log(`💰 Distributing Accrued Fees for Vault #${vaultIndex}...`);

  try {
    // Calculate vault PDA
    const [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), factoryPDA.toBuffer(), new anchor.BN(vaultIndex).toArrayLike(Buffer, 'le', 4)],
      program.programId
    );

    // Calculate vault mint PDA
    const [vaultMintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
      program.programId
    );

    console.log("🔑 Vault PDA:", vaultPDA.toBase58());
    console.log("🪙 Vault Mint PDA:", vaultMintPDA.toBase58());

    // Get or create vault admin's vault token account
    const vaultAdminVaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair, // payer
      vaultMintPDA, // mint
      keypair.publicKey // owner (vault admin)
    );

    // Get or create fee recipient's vault token account
    const feeRecipientVaultAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair, // payer
      vaultMintPDA, // mint
      keypair.publicKey // owner (fee recipient - same as admin for now)
    );

    console.log("💳 Vault Admin Vault Account:", vaultAdminVaultAccount.address.toBase58());
    console.log("💳 Fee Recipient Vault Account:", feeRecipientVaultAccount.address.toBase58());

    // Distribute accrued fees
    const tx = await program.methods
      .distributeAccruedFees(vaultIndex, new anchor.BN(0))
      .accountsStrict({
        collector: keypair.publicKey,
        factory: factoryPDA,
        vault: vaultPDA,
        vaultMint: vaultMintPDA,
        vaultAdminVaultAccount: vaultAdminVaultAccount.address,
        feeRecipientVaultAccount: feeRecipientVaultAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Accrued fees distributed! tx:", tx);
    await connection.confirmTransaction(tx, "confirmed");

    // Check the token balances after distribution
    const adminBalance = await getAccount(connection, vaultAdminVaultAccount.address);
    const feeRecipientBalance = await getAccount(connection, feeRecipientVaultAccount.address);

    console.log("📊 Distribution Results:");
    console.log("  Vault Admin Vault Tokens:", adminBalance.amount.toString());
    console.log("  Fee Recipient Vault Tokens:", feeRecipientBalance.amount.toString());

    return tx;
  } catch (err) {
    console.error("❌ Distribute accrued fees error:", err);
    if (err instanceof Error) {
      console.error("Error message:", err.message);
    }
    throw err;
  }
}

// Command line argument handling
const args = process.argv.slice(2);
const command = args[0];

// Main execution
(async () => {
  console.log("🚀 Starting Vault MVP Script");
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Using hardcoded keypair");

  try {
    switch (command) {  
      case 'create-token':
        console.log("🪙 Creating Stablecoin Token...");
        const { mint, tokenAccount } = await createStablecoinToken();
        console.log("✅ Stablecoin token creation completed!");
        console.log("📋 Mint Address:", mint.toBase58());
        console.log("📋 Token Account:", tokenAccount.toBase58());
        break;

      case 'init':
        console.log("🏭 Initializing Factory...");
        const factoryPDA = await initializeFactory();
        console.log("✅ Factory initialization completed!");
        console.log("📋 Factory PDA:", factoryPDA.toBase58());
        break;

      case 'create':
        console.log("🏦 Creating Vault...");
        const [factoryPDAForCreate] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        const vaultPDA = await createVault(factoryPDAForCreate);
        console.log("✅ Vault creation completed!");
        console.log("📋 Vault PDA:", vaultPDA.toBase58());
        break;

      case 'list':
        console.log("📋 Listing All Vaults...");
        console.log("program.programId", program.programId.toBase58());
        const [factoryPDAForList] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        console.log("factorypdaforlist", factoryPDAForList.toBase58());
        const allVaults = await getAllVaults(factoryPDAForList);
        console.log("✅ Vault listing completed!");
        console.log(`📊 Total Vaults: ${allVaults.length}`);
        allVaults.forEach((vault, index) => {
          console.log(`  ${index + 1}. ${vault.vaultName} (${vault.vaultSymbol}) - ${vault.vaultAddress.toBase58()}`);
        });
        break;

      case 'info':
        console.log("📊 Getting Factory Information...");
        const [factoryPDAForInfo] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await getFactoryInfo(factoryPDAForInfo);
        console.log("✅ Factory info retrieved!");
        break;

      case 'deposit-details':
        const detailsVaultIndex = parseInt(args[1]);
        if (isNaN(detailsVaultIndex)) {
          console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts deposit-details <vault_index>");
          console.error("📝 Example: npx ts-node script.ts deposit-details 4");
          process.exit(1);
        }
        console.log(`📊 Getting deposit details for Vault #${detailsVaultIndex}...`);
        const [factoryPDAForDetails] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await getDepositDetails(factoryPDAForDetails, detailsVaultIndex);
        console.log("✅ Deposit details retrieved!");
        break;

      case 'check-mint':
        console.log("🔍 Checking stablecoin mint...");
        try {
          const mintInfo = await getMint(connection, STABLECOIN_MINT);
          console.log("✅ Stablecoin mint exists:", {
            address: STABLECOIN_MINT.toBase58(),
            decimals: mintInfo.decimals,
            supply: mintInfo.supply.toString()
          });
        } catch (error) {
          console.log("❌ Stablecoin mint error:", error.message);
        }
        break;

      case 'update-fees':
        const newEntryFee = parseInt(args[1]) || 50; // 0.5%
        const newExitFee = parseInt(args[2]) || 50; // 0.5%
        const newVaultCreationFee = parseInt(args[3]) || 20000000; // $20
        const newMinManagementFee = parseInt(args[4]) || 100; // 1%
        const newMaxManagementFee = parseInt(args[5]) || 500; // 5%
        const vaultCreatorFeeRatioBps = parseInt(args[6]) || 7000; // 70%
        const platformFeeRatioBps = parseInt(args[7]) || 3000; // 30%

        console.log("💰 Updating factory fees...");
        console.log(`📊 New fees: Entry=${newEntryFee}bps, Exit=${newExitFee}bps, Creation=${newVaultCreationFee}, MinMgmt=${newMinManagementFee}bps, MaxMgmt=${newMaxManagementFee}bps`);

        await updateFactoryFees(
          newEntryFee,
          newExitFee,
          newVaultCreationFee,
          newMinManagementFee,
          newMaxManagementFee,
          vaultCreatorFeeRatioBps,
          platformFeeRatioBps
        );
        console.log("✅ Factory fees updated successfully!");
        break;

      case 'pause':
        {
          const idx = parseInt(args[1]);
          if (isNaN(idx)) {
            console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts pause <vault_index>");
            process.exit(1);
          }
          const [factoryPDAForPause] = PublicKey.findProgramAddressSync(
            [Buffer.from("factory_v2")],
            program.programId
          );
          await setVaultPaused(factoryPDAForPause, idx, true);
        }
        break;

      case 'resume':
        {
          const idx = parseInt(args[1]);
          if (isNaN(idx)) {
            console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts resume <vault_index>");
            process.exit(1);
          }
          const [factoryPDAForResume] = PublicKey.findProgramAddressSync(
            [Buffer.from("factory_v2")],
            program.programId
          );
          await setVaultPaused(factoryPDAForResume, idx, false);
        }
        break;

      case 'fees':
        const feesVaultIndex = parseInt(args[1]);
        if (isNaN(feesVaultIndex)) {
          console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts fees <vault_index>");
          console.error("📝 Example: npx ts-node script.ts fees 0");
          process.exit(1);
        }
        console.log(`💰 Getting fees for Vault #${feesVaultIndex}...`);
        const [factoryPDAForFees] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await getVaultFees(factoryPDAForFees, feesVaultIndex);
        console.log("✅ Vault fees retrieved!");
        break;

      case 'update-vault-fees':
        const updateFeesVaultIndex = parseInt(args[1]);
        const newManagementFees = parseInt(args[2]);
        if (isNaN(updateFeesVaultIndex) || isNaN(newManagementFees)) {
          console.error("❌ Please provide valid vault index and management fees. Usage: npx ts-node script.ts update-vault-fees <vault_index> <new_management_fees_bps>");
          console.error("📝 Example: npx ts-node script.ts update-vault-fees 0 150");
          process.exit(1);
        }
        console.log(`💰 Updating Vault #${updateFeesVaultIndex} management fees to ${newManagementFees} bps...`);
        const [factoryPDAForUpdateFees] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await updateVaultManagementFees(factoryPDAForUpdateFees, updateFeesVaultIndex, newManagementFees);
        console.log("✅ Vault management fees updated!");
        break;

      case 'update-vault-assets':
        const updateAssetsVaultIndex = parseInt(args[1]);
        if (isNaN(updateAssetsVaultIndex)) {
          console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts update-vault-assets <vault_index>");
          console.error("📝 Example: npx ts-node script.ts update-vault-assets 0");
          process.exit(1);
        }
        
        // Define new underlying assets (example: 50% SOL, 30% USDC, 20% USDT)
        const newUnderlyingAssets = [
          {
            mintAddress: SOL_MINT,
            mintBps: 5000 // 50%
          },
          {
            mintAddress: USDC_MINT,
            mintBps: 3000 // 30%
          },
          {
            mintAddress: STABLECOIN_MINT, // Using our created stablecoin as USDT equivalent
            mintBps: 2000 // 20%
          }
        ];

        console.log(`🔄 Updating Vault #${updateAssetsVaultIndex} underlying assets...`);
        const [factoryPDAForUpdateAssets] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await updateVaultUnderlyingAssets(factoryPDAForUpdateAssets, updateAssetsVaultIndex, newUnderlyingAssets);
        console.log("✅ Vault underlying assets updated!");
        break;

      case 'distribute-fees':
        const distributeFeesVaultIndex = parseInt(args[1]);
        if (isNaN(distributeFeesVaultIndex)) {
          console.error("❌ Please provide a valid vault index. Usage: npx ts-node script.ts distribute-fees <vault_index>");
          console.error("📝 Example: npx ts-node script.ts distribute-fees 0");
          process.exit(1);
        }
        console.log(`💰 Distributing accrued fees for Vault #${distributeFeesVaultIndex}...`);
        const [factoryPDAForDistributeFees] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          program.programId
        );
        await distributeAccruedFees(factoryPDAForDistributeFees, distributeFeesVaultIndex);
        console.log("✅ Accrued fees distributed as vault tokens!");
        break;

      default:
        console.log("📖 Available Commands:");
        console.log("  npx ts-node script.ts create-token - Create stablecoin token (100M supply)");
        console.log("  npx ts-node script.ts init     - Initialize factory");
        console.log("  npx ts-node script.ts create   - Create a new vault");
        console.log("  npx ts-node script.ts list     - List all vaults");
        console.log("  npx ts-node script.ts info     - Get factory information");
        console.log("  npx ts-node script.ts vault <index> - Get specific vault info");
        console.log("  npx ts-node script.ts deposit <vault_index> <amount> - Deposit stablecoin into vault");
        console.log("  npx ts-node script.ts redeem <vault_index> <vault_token_amount> - Redeem vault tokens for stablecoin");
        console.log("  npx ts-node script.ts deposit-details <vault_index> - Get deposit details for user and vault");
        console.log("  npx ts-node script.ts fees <vault_index> - Get vault fees (factory + management fees)");
        console.log("  npx ts-node script.ts update-fees [entry] [exit] [creation] [min_mgmt] [max_mgmt] [vault_creator_ratio] [platform_ratio] - Update factory fees");
        console.log("  npx ts-node script.ts update-vault-fees <vault_index> <new_management_fees_bps> - Update vault management fees");
        console.log("  npx ts-node script.ts update-vault-assets <vault_index> - Update vault underlying assets");
        console.log("  npx ts-node script.ts distribute-fees <vault_index> - Distribute accrued fees as vault tokens");
        console.log("  npx ts-node script.ts check-mint - Check stablecoin mint status");
        console.log("  npx ts-node script.ts pause <vault_index>   - Pause a vault");
        console.log("  npx ts-node script.ts resume <vault_index>  - Resume a vault");
        console.log("");
        console.log("📝 Examples:");
        console.log("  npx ts-node script.ts create-token");
        console.log("  npx ts-node script.ts init");
        console.log("  npx ts-node script.ts create");
        console.log("  npx ts-node script.ts list");
        console.log("  npx ts-node script.ts vault 0");
        console.log("  npx ts-node script.ts deposit 0 1000");
        console.log("  npx ts-node script.ts redeem 0 500");
        console.log("  npx ts-node script.ts deposit-details 4");
        console.log("  npx ts-node script.ts fees 0");
        console.log("  npx ts-node script.ts update-fees 50 50 20000000 100 500 8000 2000");
        console.log("  npx ts-node script.ts update-vault-fees 0 150");
        console.log("  npx ts-node script.ts update-vault-assets 0");
        console.log("  npx ts-node script.ts distribute-fees 0");
        console.log("  npx ts-node script.ts check-mint");
        console.log("  npx ts-node script.ts pause 0   - Pause vault 0");
        console.log("  npx ts-node script.ts resume 0  - Resume vault 0");
        break;
    }

  } catch (err) {
    console.error("❌ Script failed:", err);
    process.exit(1);
  }
})();