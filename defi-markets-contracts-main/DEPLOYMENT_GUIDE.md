# Vault MVP - Deployment Cost Analysis

## 📋 Overview

This document provides the exact cost breakdown for deploying the Vault MVP program to Solana, based on verified deployment data.

## 🏗️ Program Details

- **Program Name**: `vault-mvp`
- **Program ID**: `CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs`
- **File Size**: 494,768 bytes (483.2 KB)
- **Network**: Solana Devnet (verified deployment)

## 💰 Deployment Cost Analysis

### Verified Deployment Data

**Program Size**: 494,768 bytes (483.2 KB)  
**Rent Exemption**: 3,444,476,160 lamports (3.444476 SOL)  
**Cost in USD** (at $224/SOL): $771.56  
**Transaction Signature**: `Awy1Q15uGZhzDfaMa6h6Nu28xWepYdj8SWXcVCXAkkMnq4aac5Eays7tFYehs1qeHwcHpCykhfuBctFRMM3TpSF`

### Cost Breakdown

| Component | Cost (SOL) |
|-----------|------------|
| Program Rent | 3.444476 |
| Transaction Fee | ~0.000005 |
| **Total Required** | **3.444481** |
| **Recommended Buffer** | **4.0** |

### Cost Per Unit

| Unit | Cost (SOL) | Cost (USD at $224/SOL) |
|------|------------|------------------------|
| **Per Byte** | **0.0000069618** | **$0.00156** |
| **Per KB** | **0.007129** | **$1.60** |
| **Per MB** | **7.13** | **$1,597** |

### **Quick Reference: Per-Byte Costs**

**Deployment**: 0.0000069618 SOL per byte  
**Upgrades**: Same rate, but only for additional size  
**Your Program**: 494,768 bytes = 3.444476 SOL ($771.56)

### Cost Formula

```
Deployment Cost = File Size (bytes) × 0.0000069618 SOL
```

**Example**: 494,768 bytes × 0.0000069618 = 3.444476 SOL

### **Practical Examples**

| Size Change | Cost (SOL) | Cost (USD) |
|-------------|------------|------------|
| +1 KB | 0.007129 | $1.60 |
| +10 KB | 0.07129 | $15.97 |
| +50 KB | 0.35645 | $79.84 |
| +100 KB | 0.7129 | $159.69 |
| +1 MB | 7.13 | $1,597.12 |

**Your Program Context**: 494,768 bytes (483.2 KB) = 3.444476 SOL ($771.56)

## 🔄 Program Upgrade Costs

### **Upgrade Cost Structure**

1. **Same Size or Smaller Program**: 
   - **Cost**: ~0.000005 SOL (transaction fee only)
   - **No additional rent exemption needed**

2. **Larger Program**: 
   - **Cost**: Additional rent exemption for the size difference + transaction fee
   - **Formula**: `(New Size - Current Size) × 0.0000069618 SOL`

### **Upgrade Cost Scenarios**

Based on current program size of **494,768 bytes (483.2 KB)**:

| Scenario | Size Change | Additional Cost | Total Upgrade Cost |
|----------|-------------|-----------------|-------------------|
| Same size | 0 bytes | 0 SOL | ~0.000005 SOL |
| 20% larger | +98,954 bytes | 0.722281 SOL | 0.722286 SOL |
| 50% larger | +247,384 bytes | 1.805702 SOL | 1.805707 SOL |

### **Upgrade Cost Formula**

```
Upgrade Cost = (New Size - Current Size) × 0.0000069618 SOL + Transaction Fees
```

**Example**: If you increase your program by 100KB:
- Additional cost: 100,000 × 0.0000069618 = 0.69618 SOL
- Total upgrade cost: 0.69618 + 0.000005 = 0.696185 SOL

## 📊 Financial Summary

### **Total Deployment Cost**
- **Initial Deployment**: 3.444476 SOL ($771.56)
- **Recommended Buffer At Initial Deploy**: 4.0 SOL ($896.00)
- **Transaction Signature**: `Awy1Q15uGZhzDfaMa6h6Nu28xWepYdj8SWXcVCXAkkMnq4aac5Eays7tFYehs1qeHwcHpCykhfuBctFRMM3TpSF`

### **Testing Requirements**

#### **USDC for Deposit/Redeem Testing**
- **USDC Amount**: 100-500 USDC recommended for comprehensive testing
- **Purpose**: Testing vault deposit and redemption functionality
- **Network**: Devnet USDC (test tokens)
- **Source**: Airdrop from Solana devnet faucet or testnet exchanges

#### **Additional Testing Costs**
- **Transaction Fees**: ~0.000005 SOL per transaction
- **Estimated Testing**: 50-100 transactions = 0.00025-0.0005 SOL
- **Total Testing Budget**: 0.5 SOL + USDC test tokens

#### **How to Get USDC Test Tokens**

**Option 1: Solana Devnet Faucet**
```bash
# Get USDC test tokens from devnet faucet
solana airdrop 100 USDC --url devnet
```

**Option 2: Jupiter Testnet**
- Visit Jupiter's testnet interface
- Connect your devnet wallet
- Swap SOL for USDC test tokens

**Option 3: Manual Token Creation**
- Create USDC mint on devnet
- Mint test tokens to your wallet
- Use for vault testing

**USDC Mint Address (Devnet)**: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

### **Cost Verification**
- **Initial Balance**: 11.719500048 SOL
- **Final Balance**: 8.270969248 SOL
- **Actual Cost**: 3.4485308 SOL
- **Difference**: 0.0040548 SOL (due to transaction fees)

---

**Last Updated**: December 2024  
**Program Version**: v0.1.0  
**Deployment Cost**: 3.44 SOL (verified on devnet)  
**Program ID**: `CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs`  
**Network**: Solana Devnet (example deployment)  
**Transaction**: `Awy1Q15uGZhzDfaMa6h6Nu28xWepYdj8SWXcVCXAkkMnq4aac5Eays7tFYehs1qeHwcHpCykhfuBctFRMM3TpSF`
