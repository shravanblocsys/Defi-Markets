# Ledger Nano X Deployment - Summary

This document summarizes all the files and steps needed to deploy your Solana program using Ledger Nano X.

## 📁 Files Created

1. **LEDGER_SETUP_GUIDE.md** - Comprehensive setup guide with step-by-step instructions
2. **LEDGER_QUICK_START.md** - Quick reference for experienced users
3. **deploy-with-ledger-cli.sh** - Shell script for deployment (recommended method)
4. **deploy-with-ledger.ts** - TypeScript verification/preparation script
5. **verify-ledger.ts** - Script to verify Ledger connection

## 🔧 Files Modified

1. **package.json** - Added Ledger dependencies:
   - `@ledgerhq/hw-app-solana`
   - `@ledgerhq/hw-transport-node-hid`

2. **Anchor.toml** - Added comments showing how to configure for Ledger

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Ledger
- Connect Ledger Nano X
- Install Solana app via Ledger Live
- Enable Developer Mode in Ledger Live
- Open Solana app on Ledger
- Close Ledger Live

### 3. Verify Connection
```bash
npx ts-node verify-ledger.ts
```

### 4. Configure Solana CLI
```bash
solana config set --keypair usb://ledger
solana config set --url devnet
```

### 5. Build & Deploy
```bash
anchor build
./deploy-with-ledger-cli.sh devnet
```

## 📋 Deployment Methods

### Method 1: Shell Script (Recommended) ⭐
```bash
./deploy-with-ledger-cli.sh devnet
```
**Pros**: Most reliable, uses Solana CLI directly, handles all edge cases

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

## 🔍 Verification Scripts

### Check Ledger Connection
```bash
npx ts-node verify-ledger.ts
```

### Prepare Deployment
```bash
npx ts-node deploy-with-ledger.ts devnet
```

## 📚 Documentation

- **Full Guide**: See `LEDGER_SETUP_GUIDE.md` for detailed instructions
- **Quick Start**: See `LEDGER_QUICK_START.md` for fast reference
- **Troubleshooting**: Both guides include troubleshooting sections

## ⚠️ Important Notes

1. **Always close Ledger Live** before using CLI tools
2. **Test on devnet first** before mainnet deployment
3. **Verify transaction details** on Ledger screen before approving
4. **Keep recovery phrase safe** - store it offline
5. **Ensure sufficient SOL** - deployment requires ~3.5 SOL for rent

## 🎯 Next Steps After Setup

1. ✅ Verify Ledger connection works
2. ✅ Build your program: `anchor build`
3. ✅ Test deployment on devnet
4. ✅ Verify program functionality
5. ✅ Deploy to mainnet (when ready)

## 💡 Tips

- Use `solana balance` to check your Ledger wallet balance
- Use `solana address` to confirm your Ledger address
- For devnet, use `solana airdrop 5 $(solana address)` to get SOL
- Monitor deployments with `solana program show <PROGRAM_ID>`

## 🆘 Need Help?

Refer to:
- `LEDGER_SETUP_GUIDE.md` - Detailed troubleshooting section
- `LEDGER_QUICK_START.md` - Quick troubleshooting
- Solana CLI docs: https://docs.solana.com/cli
- Ledger docs: https://support.ledger.com

