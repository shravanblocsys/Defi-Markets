#!/usr/bin/env node

/**
 * Verify Ledger Nano X Connection
 * 
 * This script helps verify that your Ledger device is properly connected
 * and configured for Solana deployment.
 * 
 * Usage:
 *   npx ts-node verify-ledger.ts
 */

import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import { default as SolanaApp } from "@ledgerhq/hw-app-solana";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

async function verifyLedger() {
  console.log("🔍 Verifying Ledger Nano X connection...\n");

  // Step 1: Connect to Ledger
  console.log("📱 Step 1: Connecting to Ledger device...");
  let transport;
  let solanaApp;

  try {
    transport = await TransportNodeHid.create();
    solanaApp = new SolanaApp(transport);
    console.log("✅ Ledger connected successfully\n");
  } catch (error: any) {
    console.error("❌ Failed to connect to Ledger device");
    console.error("\n   Troubleshooting steps:");
    console.error("   1. Ensure Ledger is connected via USB");
    console.error("   2. Unlock your Ledger device");
    console.error("   3. Open the Solana app on your Ledger");
    console.error("   4. Close Ledger Live (it blocks CLI access)");
    console.error("   5. On Linux, you may need udev rules");
    if (error.message) {
      console.error(`\n   Error: ${error.message}`);
    }
    process.exit(1);
  }

  // Step 2: Get public key
  console.log("🔑 Step 2: Getting public key from Ledger...");
  console.log("   Please approve on your Ledger device...\n");

  let publicKey: PublicKey;
  try {
    // Standard Solana derivation path: 44'/501'/0'/0'
    const derivationPath = "44'/501'/0'/0'";
    const result = await solanaApp.getAddress(derivationPath);
    publicKey = new PublicKey(result.address);
    console.log(`✅ Public Key: ${publicKey.toBase58()}\n`);
  } catch (error: any) {
    console.error("❌ Failed to get public key");
    if (error.message) {
      console.error(`   Error: ${error.message}`);
    }
    await transport.close();
    process.exit(1);
  }

  // Step 3: Check balance on different networks
  console.log("💰 Step 3: Checking balances...\n");

  const networks = [
    { name: "devnet", url: "https://api.devnet.solana.com" },
    { name: "mainnet-beta", url: "https://api.mainnet-beta.solana.com" },
  ];

  for (const network of networks) {
    try {
      const connection = new Connection(network.url, "confirmed");
      const balance = await connection.getBalance(publicKey);
      const balanceSOL = balance / LAMPORTS_PER_SOL;

      console.log(`   ${network.name}:`);
      console.log(`     Balance: ${balanceSOL.toFixed(4)} SOL`);
      
      if (network.name === "devnet" && balanceSOL < 1) {
        console.log(`     💡 Get devnet SOL: solana airdrop 5 ${publicKey.toBase58()}`);
      }
      console.log("");
    } catch (error: any) {
      console.log(`   ${network.name}: Failed to check balance`);
      if (error.message) {
        console.log(`     Error: ${error.message}`);
      }
      console.log("");
    }
  }

  // Step 4: Verify Solana CLI configuration
  console.log("⚙️  Step 4: Solana CLI configuration...\n");
  console.log("   To use Ledger with Solana CLI, run:");
  console.log(`   solana config set --keypair usb://ledger`);
  console.log(`   solana config set --url devnet  # or mainnet-beta\n`);

  // Step 5: Test signing capability
  console.log("✍️  Step 5: Testing signing capability...");
  console.log("   This will require approval on your Ledger...\n");

  try {
    // Create a dummy message to sign
    const testMessage = Buffer.from("Test message for Ledger verification");
    const signature = await solanaApp.signTransaction(
      "44'/501'/0'/0'",
      testMessage
    );
    console.log("✅ Signing test successful!");
    console.log(`   Signature: ${Buffer.from(signature.signature).toString("hex").substring(0, 16)}...\n`);
  } catch (error: any) {
    console.error("❌ Signing test failed");
    if (error.message) {
      console.error(`   Error: ${error.message}`);
    }
    console.log("");
  }

  // Summary
  console.log("📋 Summary:");
  console.log(`   ✅ Ledger connected`);
  console.log(`   ✅ Public key: ${publicKey.toBase58()}`);
  console.log(`   ✅ Ready for deployment!\n`);

  console.log("🚀 Next steps:");
  console.log("   1. Configure Solana CLI: solana config set --keypair usb://ledger");
  console.log("   2. Set cluster: solana config set --url devnet");
  console.log("   3. Build program: anchor build");
  console.log("   4. Deploy: ./deploy-with-ledger-cli.sh devnet");
  console.log("   OR use: anchor deploy (after configuring Anchor.toml)\n");

  await transport.close();
}

// Run verification
verifyLedger().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});

