import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const RPC_URL = "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

// Function to calculate metadata PDA
function pdaMetadata(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

// Fetch and parse token metadata
async function verifyMetadata(mintAddress: string) {
  console.log("🔍 Verifying Token Metadata...");
  console.log("=".repeat(60));
  console.log("Mint Address:", mintAddress);
  console.log("");

  try {
    const mint = new PublicKey(mintAddress);
    const metadataPDA = pdaMetadata(mint);
    
    console.log("📝 Metadata Account PDA:", metadataPDA.toBase58());
    console.log("");

    // Get metadata account
    const metadataAccount = await connection.getAccountInfo(metadataPDA);
    
    if (!metadataAccount) {
      console.log("❌ Metadata account not found!");
      console.log("   This means the metadata was never created.");
      return;
    }

    console.log("✅ Metadata account exists");
    console.log("📏 Account size:", metadataAccount.data.length, "bytes");
    console.log("");

    // Try to parse metadata using Metaplex SDK or manual parsing
    // For V3 metadata, the structure is more complex
    // Let's try to read the basic fields manually
    
    const data = metadataAccount.data;
    let offset = 0;

    // Read key (1 byte) - V3 uses key = 33
    const key = data.readUInt8(offset);
    offset += 1;
    console.log("🔑 Metadata Key:", key, key === 33 ? "(V3)" : key === 4 ? "(V1)" : "(Unknown)");
    
    // Skip update authority (32 bytes)
    offset += 32;
    
    // Skip mint (32 bytes)
    offset += 32;
    
    // For V3, there's additional structure, but let's try to find the data
    // V3 has: key, update_authority, mint, name, symbol, uri, seller_fee_basis_points, etc.
    
    // Try to read name
    if (offset + 4 <= data.length) {
      const nameLength = data.readUInt32LE(offset);
      offset += 4;
      
      if (offset + nameLength <= data.length) {
        const name = data.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '');
        offset += nameLength;
        console.log("📛 Name:", name);
      }
    }
    
    // Try to read symbol
    if (offset + 4 <= data.length) {
      const symbolLength = data.readUInt32LE(offset);
      offset += 4;
      
      if (offset + symbolLength <= data.length) {
        const symbol = data.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '');
        offset += symbolLength;
        console.log("🏷️ Symbol:", symbol);
      }
    }
    
    // Try to read URI
    if (offset + 4 <= data.length) {
      const uriLength = data.readUInt32LE(offset);
      offset += 4;
      
      if (offset + uriLength <= data.length) {
        const uri = data.slice(offset, offset + uriLength).toString('utf8').replace(/\0/g, '');
        console.log("🔗 URI:", uri || "(empty)");
        console.log("");
        
        if (uri && uri.startsWith('ipfs://')) {
          const ipfsHash = uri.replace('ipfs://', '');
          console.log("💡 IPFS Links:");
          console.log(`   Pinata: https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
          console.log(`   IPFS.io: https://ipfs.io/ipfs/${ipfsHash}`);
          console.log(`   Cloudflare: https://cloudflare-ipfs.com/ipfs/${ipfsHash}`);
          console.log("");
          
          // Try to fetch the metadata JSON
          try {
            console.log("📥 Fetching metadata from IPFS...");
            const response = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
            if (response.ok) {
              const metadata = await response.json();
              console.log("✅ Metadata JSON:");
              console.log(JSON.stringify(metadata, null, 2));
            } else {
              console.log("⚠️ Could not fetch metadata from IPFS (status:", response.status, ")");
            }
          } catch (error) {
            console.log("⚠️ Error fetching metadata:", error);
          }
        }
      }
    }
    
    console.log("");
    console.log("💡 View on Explorers:");
    console.log(`   Solscan: https://solscan.io/token/${mintAddress}?cluster=devnet`);
    console.log(`   Solana Explorer: https://explorer.solana.com/address/${mintAddress}?cluster=devnet`);
    
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
    }
  }
}

// Main execution
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: npx ts-node verify-metadata.ts <mint_address>");
  console.log("Example: npx ts-node verify-metadata.ts 2DPYLEAXW3Gm7a3bVbkCkLjfYvYBNni6MrizqcgpTBxe");
  process.exit(1);
}

const mintAddress = args[0];
verifyMetadata(mintAddress);

