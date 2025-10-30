# Testing: Deposit Share-Price Minting (No Swaps)

This guide verifies ETF share minting using the simple on-chain `deposit` path (no Jupiter swaps) via `script.ts`.

## Prereqs
- Devnet RPC access
- Program deployed (IDL at `target/idl/vault_mvp.json`)

## One-time setup
```bash
# 1) Create devnet stablecoin mint and fund admin ATA
npx ts-node script.ts create-token

# 2) Initialize the factory
npx ts-node script.ts init

# 3) Create a vault (uses the minted stablecoin for creation fee)
npx ts-node script.ts create
```

## Run tests

### A) First deposit (price discovery)
- When `total_supply == 0`, the program mints 1:1 after fees and ignores price.
```bash
# 10 USDC raw, price=0
npx ts-node script.ts deposit-simple <vault_index> 10000000 0
```
Expected:
- Entry fee: `amount * entry_fee_bps / 10000`
- Net deposit: `amount - fee`
- Minted shares: `net_deposit` (e.g., 10_000_000 @25bps → 9_975_000 shares)

### B) Subsequent deposit (share-price minting)
- After the first deposit: `minted = floor(net_deposit * 10^decimals / price)`.
```bash
# price = 0.5635 USDC/share → 563500 raw
npx ts-node script.ts deposit-simple <vault_index> 10000000 563500
```
Example math (25 bps entry fee):
- Net deposit: 9_975_000
- Minted: floor(9_975_000 * 1_000_000 / 563_500) = 17_701_863

### C) Different price
```bash
# price = 0.4635 USDC/share → 463500 raw
npx ts-node script.ts deposit-simple <vault_index> 10000000 463500
```
- Lower price → more shares minted; confirm in explorer logs.

## Notes
- `create-token` saves the devnet mint in `stablecoin.json`; `deposit-simple` reuses it.
- `deposit-simple` provides `jupiterProgram` in accounts, but no swaps are executed.
- Confirm on explorer:
  - Fee transfer (user → fee recipient)
  - Net stablecoin transfer (user → vault USDC PDA)
  - Mint to user vault ATA with expected amount

## Examples & analysis (devnet)

All examples deposit 10 USDC (raw: 10,000,000), entry fee = 25 bps.

- First deposit (price = 0)
  - Tx: `4VKpnXcaSctazzs4j57j5nqQV2BFsCU14KJWY7gbaRPVApcsP34ynuSD8XpcKiHjViZNBDzXzoDXBCT21CD3FXdX`
  - Net deposit: 10,000,000 − 25,000 = 9,975,000
  - Expected minted (1:1): 9,975,000 → 9.975000 shares
  - Explorer shows mint: 9.975000 — matches expectation

- Subsequent deposit (price = 0.5635 USDC/share → 563,500)
  - Tx: `4PXqpGVEfHcoHFrcddFLmpZsRaPwSbdE69jGEeR6g1Nr9hej8J9o6HvjUJfWJZftUYgpoRuspbQWqMSvNgYd1NPx`
  - Net deposit: 9,975,000
  - Expected minted: floor(9,975,000 × 1,000,000 / 563,500) = 17,701,863 → 17.701863 shares
  - Explorer shows mint: 17.701863 — matches expectation

- Subsequent deposit (price = 0.4635 USDC/share → 463,500)
  - Tx: `3XASiVUqrnYts7Hm5VLQtZtoUPssRDVieh73GeaRz7ZSfKkFz7Cv1GMdzAFyHopbQRZYCFHcKiBYszm93ZTXQ12S`
  - Net deposit: 9,975,000
  - Expected minted: floor(9,975,000 × 1,000,000 / 463,500) = 21,521,035 → 21.521035 shares
  - Explorer shows mint: 21.521035 — matches expectation

## Troubleshooting
- Invalid public key: ensure Jupiter program ID in `script.ts` is `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`.
- TokenAccountNotFound: run `create-token` first so the admin has a funded stablecoin ATA, then `create`.
