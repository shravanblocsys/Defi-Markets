# Ledger Nano X Setup Guide for Solana Deployment

This guide will walk you through setting up your Ledger Nano X wallet for deploying Solana programs.

## 📋 Prerequisites

- Ledger Nano X device
- USB-C cable (included with device)
- Computer with macOS, Windows, or Linux
- Node.js 18+ installed
- Solana CLI tools installed

## 🔧 Step 1: Initial Ledger Setup

### 1.1 Unbox and Verify
- Ensure the packaging is sealed and contains:
  - Ledger Nano X device
  - USB-C cable
  - Recovery sheets
  - User manual

### 1.2 Download Ledger Live
1. Visit [https://www.ledger.com/start](https://www.ledger.com/start)
2. Download and install Ledger Live for your operating system
3. Open Ledger Live and follow the setup wizard

### 1.3 Initialize Your Ledger Device
1. **Connect** your Ledger Nano X to your computer using the USB-C cable
2. **Power on** the device by pressing both buttons
3. **Choose** "Set up as new device"
4. **Create a PIN** (4-8 digits) - Choose a secure PIN and remember it!
5. **Write down your 24-word recovery phrase**:
   - The device will display 24 words one at a time
   - Write them down on the recovery sheet in the exact order shown
   - **CRITICAL**: Store this securely offline - never share it or take photos
   - Verify the recovery phrase when prompted

## 📱 Step 2: Install Solana App on Ledger

### 2.1 Enable Developer Mode (Required for Solana)
1. Open **Ledger Live**
2. Go to **Settings** (gear icon in top right)
3. Navigate to **Experimental features**
4. **Enable "Developer mode"** - This allows you to install apps in development mode

### 2.2 Install Solana App
1. In Ledger Live, click **Manager** in the left sidebar
2. Connect and unlock your Ledger device
3. Search for **"Solana"** in the app catalog
4. Click **Install** on the Solana app
5. Wait for installation to complete (may take a few minutes)
6. The Solana app should now appear on your Ledger device

### 2.3 Verify Installation
1. On your Ledger device, navigate to the Solana app
2. Open it - you should see "Solana" displayed on the screen
3. The app is ready when you see the Solana logo/main screen

## 💻 Step 3: Install Required NPM Packages

In your project directory, install the Ledger integration packages:

```bash
npm install @ledgerhq/hw-app-solana @ledgerhq/hw-transport-node-hid
```

Or if using yarn:
```bash
yarn add @ledgerhq/hw-app-solana @ledgerhq/hw-transport-node-hid
```

## 🔐 Step 4: Configure Solana CLI for Ledger

### 4.1 Set Solana CLI to Use Ledger

The Solana CLI can use your Ledger device as a wallet. Configure it:

```bash
# Set the cluster (devnet/mainnet-beta)
solana config set --url devnet

# Set wallet to use Ledger
solana config set --keypair usb://ledger
```

### 4.2 Verify Ledger Connection

Check if Solana CLI can see your Ledger:

```bash
# This will prompt you to confirm on your Ledger device
solana address

# Check balance
solana balance
```

**Note**: When you run these commands, your Ledger will:
- Display a prompt asking you to approve
- Show the public key/address on the device screen
- Require you to press both buttons to confirm

## 🚀 Step 5: Deploy Program Using Ledger

### 5.1 Build Your Program

First, build the program:

```bash
anchor build
```

### 5.2 Deploy with Ledger

You have two options:

#### Option A: Using Anchor CLI (if configured)
```bash
# Make sure Anchor.toml has wallet set to Ledger
anchor deploy --provider.cluster devnet
```

#### Option B: Using Custom Deployment Script
```bash
# Use the provided deployment script
npx ts-node deploy-with-ledger.ts
```

### 5.3 Confirm on Ledger Device

When deploying:
1. Your Ledger will display transaction details
2. Review the transaction on the device screen:
   - Program ID
   - Amount (rent for program deployment)
   - Network (devnet/mainnet)
3. **Approve** by pressing both buttons on the Ledger
4. Wait for deployment confirmation

## 🔍 Step 6: Verify Deployment

After deployment completes:

```bash
# Check program ID
solana address --keypair target/deploy/vault_mvp-keypair.json

# Verify program is deployed
solana program show <PROGRAM_ID>
```

## 📝 Step 7: Update Configuration Files

### Update Anchor.toml

Edit `Anchor.toml` to use Ledger:

```toml
[provider]
cluster = "devnet"  # or "mainnet-beta"
wallet = "usb://ledger"  # Use Ledger instead of keypair file
```

### Alternative: Use Ledger Public Key

If you want to specify the Ledger account by public key:

```bash
# Get your Ledger public key
LEDGER_PUBKEY=$(solana address)

# Use it in scripts
export LEDGER_PUBKEY=$LEDGER_PUBKEY
```

## 🛠️ Troubleshooting

### Issue: "Ledger device not found"
**Solution**:
- Ensure Ledger is connected via USB
- Unlock your Ledger device
- Open the Solana app on your Ledger
- Try disconnecting and reconnecting
- On Linux, you may need to install udev rules

### Issue: "Transaction rejected on device"
**Solution**:
- Check that you have enough SOL in your Ledger wallet
- Verify the transaction details on the Ledger screen
- Ensure you're on the correct network (devnet/mainnet)
- Try increasing the transaction timeout

### Issue: "Cannot connect to Ledger"
**Solution**:
- Close Ledger Live (it can block CLI access)
- Try a different USB port/cable
- Restart your computer
- Check if other apps are using the Ledger

### Issue: "App not found" when deploying
**Solution**:
- Ensure Solana app is installed on Ledger
- Make sure Developer mode is enabled in Ledger Live
- Verify the app is open on your Ledger device

### Issue: "Insufficient funds"
**Solution**:
- Airdrop SOL to your Ledger address (devnet):
  ```bash
  solana airdrop 2 $(solana address)
  ```
- For mainnet, transfer SOL to your Ledger address

## 📚 Additional Resources

- [Ledger Solana Documentation](https://support.ledger.com/hc/en-us/articles/360016265659)
- [Solana CLI Documentation](https://docs.solana.com/cli)
- [Anchor Framework Documentation](https://www.anchor-lang.com/docs)

## 🔒 Security Best Practices

1. **Never share your recovery phrase** - Store it securely offline
2. **Always verify transactions** on your Ledger device screen before approving
3. **Use a strong PIN** for your Ledger device
4. **Keep Ledger firmware updated** through Ledger Live
5. **Only approve transactions you understand** - Review all details on the device
6. **For mainnet deployments**, double-check all addresses and amounts

## ✅ Quick Checklist

Before deploying:
- [ ] Ledger Nano X initialized and secured
- [ ] Solana app installed on Ledger
- [ ] Developer mode enabled in Ledger Live
- [ ] NPM packages installed (`@ledgerhq/hw-app-solana`, etc.)
- [ ] Solana CLI configured to use Ledger (`solana config set --keypair usb://ledger`)
- [ ] Ledger connection verified (`solana address` works)
- [ ] Sufficient SOL balance in Ledger wallet
- [ ] Anchor.toml configured for Ledger wallet
- [ ] Program built successfully (`anchor build`)
- [ ] Ready to deploy!

## 🎯 Next Steps

After successful setup:
1. Test deployment on devnet first
2. Verify program functionality
3. Only then proceed to mainnet deployment
4. Keep your recovery phrase safe!

