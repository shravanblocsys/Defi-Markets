## Jupiter Integration (Vault MVP)

This document explains how the Vault program integrates with Jupiter via CPI to swap between the vault’s stablecoin and its configured underlying assets during deposit and redeem flows.

### Where to look

- `src/services/jupiter.rs` — Jupiter CPI helpers
- `src/instructions.rs` — calls into the helpers from `deposit` and `redeem`

### High-level flow

- **Deposit**: After fees are taken and net funds are transferred to the vault’s stablecoin account, the program calls `swap_into_allocation(...)` to distribute the deposit across each underlying asset according to its BPS weight. Only after a successful swap does it mint vault tokens to the user.
- **Redeem**: Before burning the user’s vault tokens, the program calls `swap_out_of_allocation(...)` to convert each underlying asset back into the vault’s stablecoin, in proportion to the shares being redeemed. Fees are then taken, and vault tokens are burned.

### Remaining accounts layout per asset block

Jupiter routes are passed in via `ctx.remaining_accounts` as fixed-size blocks of accounts, one block per underlying asset. The block length is enforced by `JUP_BLOCK_LEN = 24`.

Per-asset block (indices relative to the start of the block):

1. Jupiter program (readonly)
2. Payer = Vault PDA (writable; signs via `invoke_signed`)
3. Input token account (writable)
4. Output token account (writable)
5. Input token program (readonly)
6. Output token program (readonly)
7..22 Route-specific accounts required by the Jupiter route (readonly/writable as provided)
23. Account holding serialized Jupiter instruction bytes (readonly)

Notes:
- The program builds `AccountMeta` from these accounts and performs a raw CPI `invoke_signed` using the provided `data` bytes. This keeps the program agnostic to the exact Jupiter route.
- The first account in each block is the program ID to be invoked for the route. A constant `JUPITER_PROGRAM_ID` is included for reference, but the CPI uses the account provided by the client.

### Stablecoin passthrough optimization

If an underlying asset mint equals the stablecoin mint, no swap is required. The code performs a direct SPL transfer from the vault’s input token account to the designated output token account for just that proportional `part`. This is signed by the Vault PDA using seeds:

- Seeds: `[b"vault", factory_key, vault_index.to_le_bytes(), [vault_bump]]`

### Proportional allocation math

For each asset with `mint_bps` in basis points, the program computes:

- Deposit: `part = amount_after_fees * mint_bps / 10_000`
- Redeem: `part = vault_token_amount * mint_bps / 10_000`

Assets with `part == 0` are skipped.

### How deposit uses Jupiter

- Transfers net deposit (after fees) into the vault’s stablecoin account.
- Calls `swap_into_allocation(...)`, iterating over blocks of `remaining_accounts` (one per asset). For non-stablecoin assets, it builds an `Instruction` from the block and CPIs to Jupiter.
- On success, updates vault accounting and mints vault tokens to the user.

### How redeem uses Jupiter

- Calls `swap_out_of_allocation(...)` first, iterating blocks and CPIs to Jupiter to convert each asset back into stablecoin. Stablecoin assets are skipped.
- Updates vault accounting, burns the user’s vault tokens, then transfers/charges fees from the user’s stablecoin received via the swap.

### Client responsibilities

The client must construct `remaining_accounts` as concatenated per-asset blocks (24 accounts each) in the exact order described above. Specifically:

- Provide the route-specific accounts for each asset’s desired Jupiter route between the vault’s stablecoin and the asset mint.
- Ensure the input/output token accounts are correct for the route direction:
  - Deposit: stablecoin → asset (output should be the asset destination account)
  - Redeem: asset → stablecoin (output should be the user’s stablecoin account)
- Include token program accounts for input and output mints.
- Provide an account whose data contains the serialized Jupiter instruction bytes for the route (the program reads these bytes and uses them as the CPI `data`).
- Pre-derive/know the Vault PDA to use as the payer in the block and make sure that account is included and marked writable.

Minimal TypeScript-like sketch for assembling blocks (conceptual; not a drop-in):

```ts
const blocks: AccountMetaLike[] = [];
for (const asset of underlyingAssets) {
  const route = await jupiterApi.buildRoute({
    inMint: stablecoinMint,
    outMint: asset.mint,
    amount: partForAsset,
    // ... route configuration ...
  });

  const ixDataAccount = await createIxDataAccount(connection, payer, route.ixDataBytes);

  blocks.push(
    jupiterProgramAccount,
    vaultPdaAccount, // writable
    inputTokenAccount, // writable
    outputTokenAccount, // writable
    inputTokenProgram,
    outputTokenProgram,
    ...route.extraAccounts,
    ixDataAccount
  );
}

// Pass as remaining accounts in the Anchor call
await program.methods.deposit(vaultIndex, amount)
  .accounts({ /* required accounts */ })
  .remainingAccounts(blocks)
  .rpc();
```

Tip: For assets where `asset.mint == stablecoinMint`, you can still provide a block and the program will short-circuit to a direct transfer, or you can skip the swap and ensure the block’s input/output token accounts reflect a straight SPL transfer expectation.

### Safety and checks in the program

- Verifies `underlying_assets` is non-empty.
- Ensures the `remaining_accounts` slice has enough accounts for each 24-account block; if not, logs and stops processing additional assets.
- Uses the Vault PDA as the CPI signer with deterministic seeds.
- For passthrough transfers, uses `anchor_spl::token::transfer` with signer seeds.

What the program does NOT validate (left to the client/route builder):

- The semantic correctness of the provided route accounts or the serialized instruction bytes.
- That the provided program ID equals the canonical Jupiter program ID (a `JUPITER_PROGRAM_ID` constant is provided for reference; you can enforce it on the client by asserting the first account equals that constant).

### Integration tips

- Build and verify each per-asset block independently before concatenating.
- Keep the same `JUP_BLOCK_LEN` to avoid off-by-one errors.
- On redeem, route outputs should typically credit the user’s destination stablecoin ATA directly, so no extra vault→user transfer is needed after the swap.
- If you change allocation weights, ensure their BPS sum remains 10,000.

### Related code entry points

- `instructions::deposit` calls `services::jupiter::swap_into_allocation` before minting vault tokens.
- `instructions::redeem` calls `services::jupiter::swap_out_of_allocation` before burning vault tokens.


