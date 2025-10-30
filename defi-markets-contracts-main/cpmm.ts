import { Connection, PublicKey } from '@solana/web3.js';
import { struct, u8, publicKey, u64 } from '@project-serum/borsh';

const CPMMPoolLayout = struct([
  u8('status'),
  publicKey('ammConfig'),
  publicKey('token0Mint'),
  publicKey('token1Mint'),
  publicKey('token0Vault'),
  publicKey('token1Vault'),
  publicKey('lpMint'),
  u64('observationId'),
  // ... rest of fields from SDK layout
]);

async function getCpmmPool(connection: Connection, poolId: string) {
  const accountInfo = await connection.getAccountInfo(new PublicKey(poolId));
  if (!accountInfo) throw new Error('Pool not found');
  return CPMMPoolLayout.decode(accountInfo.data);
}

(async () => {
  const connection = new Connection('https://api.devnet.solana.com');
  const pool = await getCpmmPool(connection, 'FXAXqgjNK6JVzVV2frumKTEuxC8hTEUhVTJTRhMMwLmM');
  console.log('Decoded CPMM pool:', pool);
})();
