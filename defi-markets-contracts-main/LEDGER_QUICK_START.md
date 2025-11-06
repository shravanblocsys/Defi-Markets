# Ledger Nano X Quick Start Guide

This is a quick reference guide for deploying your Solana program using Ledger Nano X.

## ⚡ Quick Setup (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Ledger Device
1. Connect Ledger Nano X via USB
2. Unlock device
3. Open **Ledger Live** → **Manager** → Install **Solana** app
4. **Enable Developer Mode** in Ledger Live Settings → Experimental features
5. Open Solana app on Ledger device
6. **Close Ledger Live** (it blocks CLI access)

### 3. Verify Connection
```bash
npx ts-node verify-ledger.ts
```

### 4. Configure Solana CLI
```bash
# Set Ledger as wallet
solana config set --keypair usb://ledger

# Set cluster (devnet or mainnet-beta)
solana config set --url devnet

# Verify it works
solana address
solana balance
```

### 5. Build Program
```bash
anchor build
```

### 6. Deploy with Ledger
```bash
# Option 1: Using shell script (recommended)
./deploy-with-ledger-cli.sh devnet

# Option 2: Using Anchor CLI
# First update Anchor.toml: wallet = "usb://ledger"
anchor deploy
```

## 📋 Deployment Methods

### Method 1: Shell Script (Recommended)
```bash
./deploy-with-ledger-cli.sh devnet
```
This is the most reliable method as it uses Solana CLI directly.

### Method 2: Anchor CLI
1. Update `Anchor.toml`:
   ```toml
   [provider]
   wallet = "usb://ledger"
   ```
2. Deploy:
   ```bash
   anchor deploy
   ```

### Method 3: Direct Solana CLI
```bash
solana program deploy target/deploy/vault_mvp.so \
  --program-id target/deploy/vault_mvp-keypair.json \
  --keypair usb://ledger \
  --url devnet
```

## 🔍 Troubleshooting

### "Cannot connect to Ledger"
- ✅ Ledger is connected via USB
- ✅ Ledger is unlocked
- ✅ Solana app is open on Ledger
- ✅ Ledger Live is **closed**

### "Insufficient funds"
For devnet:
```bash
solana airdrop 5 $(solana address)
```

### "Transaction rejected"
- Check transaction details on Ledger screen
- Ensure you have enough SOL
- Verify network matches (devnet/mainnet)

## 📚 Full Documentation

See [LEDGER_SETUP_GUIDE.md](./LEDGER_SETUP_GUIDE.md) for detailed instructions.

