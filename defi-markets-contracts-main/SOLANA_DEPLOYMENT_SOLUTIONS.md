# Solana Program Deployment Solutions

This document outlines two solutions for handling Solana program deployment issues when the program size exceeds the allocated space.

## Problem Statement

When deploying an updated Solana program, you may encounter the error:
```
Error: Error processing Instruction 2: custom program error: 0x1
```

This error typically occurs when:
- The new program binary is larger than the existing program data account
- The program data account doesn't have sufficient space to accommodate the updated program
- The program has grown in size due to new features, dependencies, or code additions

## Solution 1: Extend Program Memory

### Overview
Extend the program data account to accommodate larger program binaries without losing the existing program state.

### Steps

1. **Check current program size and data account size:**
   ```bash
   # Check program binary size
   ls -la target/deploy/vault_mvp.so
   
   # Check on-chain program data account size
   solana program show <PROGRAM_ID>
   ```

2. **Extend the program data account:**
   ```bash
   # Extend by additional bytes (example: 100,000 bytes)
   solana program extend <PROGRAM_ID> 100000
   ```

3. **Verify the extension:**
   ```bash
   solana program show <PROGRAM_ID>
   ```

4. **Deploy the updated program:**
   ```bash
   anchor deploy
   ```

### Pros
- ✅ Preserves existing program state and data
- ✅ Maintains the same program ID
- ✅ No need to reinitialize existing accounts
- ✅ Seamless upgrade for existing users

### Cons
- ❌ Consumes additional SOL for rent
- ❌ Increases program data account size permanently
- ❌ May require more SOL than available in upgrade authority account

### Cost Analysis
- **Rent Cost**: Approximately 0.696 SOL for 100,000 bytes extension
- **Deployment Cost**: Additional SOL required for the actual deployment transaction

### Example Transaction
```
Extended Program Id 2LcW6FE3mhzpu43creSzyw1y43km7B8x8iZVrCx1CQVZ by 100000 bytes
```

## Solution 2: Close Program and Redeploy

### Overview
Close the existing program to reclaim all locked SOL, then deploy a fresh program with a new program ID.

### Steps

1. **Close the existing program:**
   ```bash
   solana program close <PROGRAM_ID> --bypass-warning
   ```

2. **Verify SOL recovery:**
   ```bash
   solana balance
   ```

3. **Generate new program ID:**
   ```bash
   solana-keygen new --outfile target/deploy/vault_mvp-keypair.json --no-bip39-passphrase
   ```

4. **Update program ID in code:**
   ```rust
   // In programs/vault-mvp/src/lib.rs
   declare_id!("<NEW_PROGRAM_ID>");
   ```

5. **Update Anchor.toml:**
   ```toml
   [programs.mainnet]
   vault_mvp = "<NEW_PROGRAM_ID>"
   ```

6. **Build and deploy:**
   ```bash
   anchor build
   anchor deploy
   ```

### Pros
- ✅ Recovers all locked SOL (full refund)
- ✅ Fresh start with clean program state
- ✅ No size limitations from previous deployments
- ✅ Lower deployment cost (no extension fees)

### Cons
- ❌ **Loses all existing program state and data**
- ❌ Requires new program ID
- ❌ Must reinitialize factory and all vaults
- ❌ Breaking change for existing integrations
- ❌ Users lose access to existing vault data

### Cost Analysis
- **Recovery**: Full SOL refund from program data account
- **New Deployment**: Standard deployment costs (~2-3 SOL)
- **Net Cost**: Lower than extension if you don't need existing state

### Example Transaction
```
Closed Program Id 2LcW6FE3mhzpu43creSzyw1y43km7B8x8iZVrCx1CQVZ, 4.74402648 SOL reclaimed
```

## Decision Matrix

| Factor | Extend Memory | Close & Redeploy |
|--------|---------------|------------------|
| **Existing Data** | Preserved | Lost |
| **Program ID** | Same | New |
| **SOL Cost** | Higher | Lower |
| **User Impact** | None | High |
| **Integration Impact** | None | Breaking |
| **Time to Deploy** | Fast | Slower |
| **Risk Level** | Low | High |

## Recommendations

### Use Extend Memory When:
- ✅ You have existing users and vault data
- ✅ The program is in production
- ✅ You have sufficient SOL for extension
- ✅ You want to maintain backward compatibility

### Use Close & Redeploy When:
- ✅ You're in development/testing phase
- ✅ No critical existing data to preserve
- ✅ You want to recover maximum SOL
- ✅ You're okay with breaking changes
- ✅ You need a completely fresh start

## Best Practices

1. **Monitor Program Size**: Regularly check program binary size during development
2. **Plan for Growth**: Consider future feature additions when sizing program data accounts
3. **Backup Critical Data**: Always backup important state before major changes
4. **Test Extensions**: Test program extensions on devnet before mainnet
5. **Document Changes**: Keep track of program ID changes for team coordination

## Troubleshooting

### Insufficient Funds Error
```
Error: Account has insufficient funds for spend (4.20515544 SOL) + fee (0.003165 SOL)
```
**Solution**: Add more SOL to the upgrade authority account or use a different funding account.

### Program Already Closed Error
```
Error: Program has been closed, use a new Program Id
```
**Solution**: Generate a new program ID and update all references in your code.

### Extension Size Issues
**Solution**: Calculate the exact size needed and extend accordingly:
```bash
# Calculate size difference
NEW_SIZE=$(stat -f%z target/deploy/vault_mvp.so)
CURRENT_SIZE=$(solana program show <PROGRAM_ID> | grep "Data Length" | awk '{print $3}')
EXTENSION_NEEDED=$((NEW_SIZE - CURRENT_SIZE))
solana program extend <PROGRAM_ID> $EXTENSION_NEEDED
```

## Conclusion

Both solutions have their place in Solana program development. Choose based on your specific needs:
- **Production systems**: Prefer extending memory to preserve user data
- **Development/Testing**: Consider closing and redeploying for cost efficiency

Always weigh the trade-offs between cost, user impact, and development time when making this decision.
