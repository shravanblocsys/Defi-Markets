#!/bin/bash

# Deploy Solana Program using Ledger Nano X via Solana CLI
# 
# This script uses the Solana CLI configured to use Ledger for signing
# transactions, which is the most reliable method for deployment.
#
# Prerequisites:
# - Ledger Nano X connected and unlocked
# - Solana app installed and open on Ledger
# - Solana CLI installed
# - anchor build completed successfully
#
# Usage:
#   ./deploy-with-ledger-cli.sh [cluster]
#
# Examples:
#   ./deploy-with-ledger-cli.sh devnet
#   ./deploy-with-ledger-cli.sh mainnet-beta

set -e  # Exit on error

# Configuration
CLUSTER=${1:-devnet}
PROGRAM_SO="target/deploy/vault_mvp.so"
PROGRAM_KEYPAIR="target/deploy/vault_mvp-keypair.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Deploying Solana Program with Ledger Nano X${NC}\n"

# Step 1: Check prerequisites
echo -e "${BLUE}📋 Step 1: Checking prerequisites...${NC}"

# Check if Ledger is accessible
if ! solana address --keypair usb://ledger > /dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to Ledger device${NC}"
    echo -e "${YELLOW}   Make sure:${NC}"
    echo -e "${YELLOW}   1. Ledger is connected via USB${NC}"
    echo -e "${YELLOW}   2. Ledger is unlocked${NC}"
    echo -e "${YELLOW}   3. Solana app is open on Ledger${NC}"
    echo -e "${YELLOW}   4. Ledger Live is closed (it blocks CLI access)${NC}"
    exit 1
fi

LEDGER_ADDRESS=$(solana address --keypair usb://ledger)
echo -e "${GREEN}✅ Ledger connected: ${LEDGER_ADDRESS}${NC}"

# Check if program binary exists
if [ ! -f "$PROGRAM_SO" ]; then
    echo -e "${RED}❌ Program binary not found: $PROGRAM_SO${NC}"
    echo -e "${YELLOW}   Run 'anchor build' first${NC}"
    exit 1
fi

PROGRAM_SIZE=$(du -h "$PROGRAM_SO" | cut -f1)
echo -e "${GREEN}✅ Program binary found: $PROGRAM_SIZE${NC}\n"

# Step 2: Set cluster
echo -e "${BLUE}📡 Step 2: Setting cluster to ${CLUSTER}...${NC}"
solana config set --url $CLUSTER
echo -e "${GREEN}✅ Cluster set to ${CLUSTER}${NC}\n"

# Step 3: Check balance
echo -e "${BLUE}💰 Step 3: Checking balance...${NC}"
BALANCE=$(solana balance --keypair usb://ledger | awk '{print $1}')
BALANCE_SOL=$(echo "$BALANCE / 1000000000" | bc -l)

echo -e "${GREEN}   Balance: ${BALANCE_SOL} SOL${NC}"

# Estimate deployment cost (rough estimate: ~3.5 SOL for 483KB program)
REQUIRED_SOL=3.5
if (( $(echo "$BALANCE_SOL < $REQUIRED_SOL" | bc -l) )); then
    echo -e "${YELLOW}⚠️  Warning: Low balance! Deployment may require ~${REQUIRED_SOL} SOL${NC}"
    if [ "$CLUSTER" = "devnet" ]; then
        echo -e "${YELLOW}   Get devnet SOL: solana airdrop 5 ${LEDGER_ADDRESS}${NC}"
    fi
else
    echo -e "${GREEN}✅ Sufficient balance for deployment${NC}"
fi
echo ""

# Step 4: Get program ID
echo -e "${BLUE}🔑 Step 4: Getting program ID...${NC}"
PROGRAM_ID=$(solana address --keypair "$PROGRAM_KEYPAIR")
echo -e "${GREEN}✅ Program ID: ${PROGRAM_ID}${NC}\n"

# Step 5: Check if program exists
echo -e "${BLUE}🔍 Step 5: Checking existing program...${NC}"
PROGRAM_INFO=$(solana program show "$PROGRAM_ID" 2>/dev/null || echo "")

if [ -n "$PROGRAM_INFO" ]; then
    echo -e "${YELLOW}⚠️  Program already deployed. This will be an upgrade.${NC}"
    echo -e "${YELLOW}   Confirm upgrade on your Ledger when prompted.${NC}"
else
    echo -e "${GREEN}✅ New deployment${NC}"
fi
echo ""

# Step 6: Deploy program
echo -e "${BLUE}🚀 Step 6: Deploying program...${NC}"
echo -e "${YELLOW}   This will require approval on your Ledger device.${NC}"
echo -e "${YELLOW}   Please review the transaction details on your Ledger screen.${NC}"
echo ""

# Deploy using Solana CLI with Ledger
if solana program deploy "$PROGRAM_SO" \
    --program-id "$PROGRAM_KEYPAIR" \
    --keypair usb://ledger \
    --url "$CLUSTER"; then
    echo ""
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo ""
    echo -e "${GREEN}📋 Deployment Summary:${NC}"
    echo -e "${GREEN}   Network: ${CLUSTER}${NC}"
    echo -e "${GREEN}   Program ID: ${PROGRAM_ID}${NC}"
    echo -e "${GREEN}   Deployer: ${LEDGER_ADDRESS}${NC}"
    echo ""
    
    # Verify deployment
    echo -e "${BLUE}🔍 Verifying deployment...${NC}"
    if solana program show "$PROGRAM_ID" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Program verified on-chain${NC}"
        solana program show "$PROGRAM_ID"
    else
        echo -e "${YELLOW}⚠️  Could not verify program (may need a moment to propagate)${NC}"
    fi
else
    echo ""
    echo -e "${RED}❌ Deployment failed${NC}"
    echo -e "${YELLOW}   Check:${NC}"
    echo -e "${YELLOW}   1. Ledger is still connected and unlocked${NC}"
    echo -e "${YELLOW}   2. Solana app is open on Ledger${NC}"
    echo -e "${YELLOW}   3. You approved the transaction on Ledger${NC}"
    echo -e "${YELLOW}   4. You have sufficient SOL balance${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"

