#!/usr/bin/env node

/**
 * Deploy Solana Program using Ledger Nano X Hardware Wallet
 * 
 * This script deploys the vault-mvp program to Solana using a Ledger device
 * for transaction signing, providing enhanced security.
 * 
 * Prerequisites:
 * - Ledger Nano X connected and unlocked
 * - Solana app installed on Ledger
 * - Sufficient SOL balance in Ledger wallet
 * - npm packages: @ledgerhq/hw-app-solana @ledgerhq/hw-transport-node-hid
 * 
 * Usage:
 *   npx ts-node deploy-with-ledger.ts [cluster] [keypair-path]
 * 
 * Examples:
 *   npx ts-node deploy-with-ledger.ts devnet
 *   npx ts-node deploy-with-ledger.ts mainnet-beta
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { readFileSync } from "fs";
import { join } from "path";
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import { default as SolanaApp } from "@ledgerhq/hw-app-solana";

// Configuration
const CLUSTER = process.argv[2] || "devnet";
const PROGRAM_KEYPAIR_PATH = process.argv[3] || join(__dirname, "target/deploy/vault_mvp-keypair.json");

// RPC URLs
const RPC_URLS: Record<string, string> = {
  "devnet": "https://api.devnet.solana.com",
  "testnet": "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  "localnet": "http://127.0.0.1:8899",
};

// Note: This script focuses on verification and preparation.
// For actual deployment, use the shell script: ./deploy-with-ledger-cli.sh
// or configure Solana CLI: solana config set --keypair usb://ledger

// Main deployment function
async function deployWithLedger() {
  console.log("🚀 Starting deployment with Ledger Nano X...\n");

  // Step 1: Connect to Ledger
  console.log("📱 Step 1: Connecting to Ledger device...");
  let transport;
  let solanaApp;
  
  try {
    transport = await TransportNodeHid.create();
    solanaApp = new SolanaApp(transport);
    console.log("✅ Ledger connected successfully\n");
  } catch (error) {
    console.error("❌ Failed to connect to Ledger device:");
    console.error("   Make sure:");
    console.error("   1. Ledger is connected via USB");
    console.error("   2. Ledger is unlocked");
    console.error("   3. Solana app is open on Ledger");
    console.error("   4. Ledger Live is closed (it blocks CLI access)");
    process.exit(1);
  }

  // Step 2: Get Ledger public key
  console.log("📱 Step 2: Getting public key from Ledger...");
  console.log("   Please approve on your Ledger device...");
  
  let ledgerPublicKey: PublicKey;
  const derivationPath = "44'/501'/0'/0'"; // Standard Solana derivation path
  try {
    const result = await solanaApp.getAddress(derivationPath);
    ledgerPublicKey = new PublicKey(result.address);
    console.log(`✅ Ledger public key: ${ledgerPublicKey.toBase58()}\n`);
  } catch (error) {
    console.error("❌ Failed to get public key from Ledger:");
    console.error(error);
    await transport.close();
    process.exit(1);
  }

  // Step 3: Setup connection
  console.log("📡 Step 3: Connecting to Solana cluster...");
  const rpcUrl = RPC_URLS[CLUSTER] || RPC_URLS.devnet;
  const connection = new Connection(rpcUrl, "confirmed");
  console.log(`✅ Connected to ${CLUSTER} (${rpcUrl})\n`);

  // Step 4: Check balance
  console.log("💰 Step 4: Checking balance...");
  const balance = await connection.getBalance(ledgerPublicKey);
  const balanceSOL = balance / LAMPORTS_PER_SOL;
  console.log(`   Balance: ${balanceSOL.toFixed(4)} SOL`);
  
  if (balanceSOL < 3.5) {
    console.warn(`⚠️  Warning: Low balance! Deployment may require ~3.5 SOL`);
    console.warn(`   Please ensure you have sufficient funds for deployment.`);
    if (CLUSTER === "devnet") {
      console.log("\n   To get devnet SOL:");
      console.log(`   solana airdrop 5 ${ledgerPublicKey.toBase58()}\n`);
    }
  } else {
    console.log("✅ Sufficient balance for deployment\n");
  }

  // Step 5: Load program keypair
  console.log("🔑 Step 5: Loading program keypair...");
  let programKeypair: Keypair;
  
  try {
    const keypairData = JSON.parse(
      readFileSync(PROGRAM_KEYPAIR_PATH, "utf-8")
    );
    programKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    console.log(`✅ Program ID: ${programKeypair.publicKey.toBase58()}\n`);
  } catch (error) {
    console.error(`❌ Failed to load program keypair from ${PROGRAM_KEYPAIR_PATH}`);
    console.error("   Make sure you've run 'anchor build' first");
    await transport.close();
    process.exit(1);
  }

  // Step 6: Check if program already exists
  console.log("🔍 Step 6: Checking existing program...");
  const programInfo = await connection.getAccountInfo(programKeypair.publicKey);
  
  if (programInfo && programInfo.executable) {
    console.log("⚠️  Program already deployed. This will be an upgrade.");
    console.log("   Confirm upgrade on your Ledger when prompted.\n");
  } else {
    console.log("✅ New deployment detected\n");
  }

  // Step 7: Load program binary
  console.log("📦 Step 7: Loading program binary...");
  const programSoPath = join(__dirname, "target/deploy/vault_mvp.so");
  
  let programBuffer: Buffer;
  try {
    programBuffer = readFileSync(programSoPath);
    console.log(`✅ Program binary loaded (${(programBuffer.length / 1024).toFixed(2)} KB)\n`);
  } catch (error) {
    console.error(`❌ Failed to load program binary from ${programSoPath}`);
    console.error("   Make sure you've run 'anchor build' first");
    await transport.close();
    process.exit(1);
  }

  // Step 8: Summary and deployment instructions
  console.log("✅ Ledger connection verified and ready for deployment!");
  console.log(`\n📋 Deployment Summary:`);
  console.log(`   Network: ${CLUSTER}`);
  console.log(`   Program ID: ${programKeypair.publicKey.toBase58()}`);
  console.log(`   Deployer: ${ledgerPublicKey.toBase58()}`);
  console.log(`   Balance: ${balanceSOL.toFixed(4)} SOL`);
  console.log(`   Program Size: ${(programBuffer.length / 1024).toFixed(2)} KB`);
  
  // Close Ledger connection
  await transport.close();
  
  console.log("\n🚀 Deployment Methods:");
  console.log("\n   Method 1: Shell Script (Recommended)");
  console.log("   ./deploy-with-ledger-cli.sh " + CLUSTER);
  
  console.log("\n   Method 2: Solana CLI Direct");
  console.log("   solana config set --keypair usb://ledger");
  console.log("   solana config set --url " + CLUSTER);
  console.log("   solana program deploy target/deploy/vault_mvp.so \\");
  console.log("     --program-id target/deploy/vault_mvp-keypair.json \\");
  console.log("     --keypair usb://ledger");
  
  console.log("\n   Method 3: Anchor CLI (after configuring Anchor.toml)");
  console.log("   # Update Anchor.toml: wallet = \"usb://ledger\"");
  console.log("   anchor deploy");
  
  console.log("\n✅ Ready to deploy!");
}

// Run deployment
deployWithLedger().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

