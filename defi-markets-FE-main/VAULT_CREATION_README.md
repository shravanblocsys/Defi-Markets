# Vault Creation Contract Integration

This document explains how the vault creation contract call is implemented in the CreateVault component.

## Overview

The implementation allows users to create new ETF vaults by calling the `createVault` function from the Vault Factory program on Solana.

## Key Components

### 1. VaultFactoryProgram Class (`src/lib/solanaProgram.ts`)

This class handles all interactions with the Vault Factory program:

- **createCreateVaultInstruction**: Creates the instruction data for the createVault call
- **deriveFactoryPDA**: Derives the factory PDA (Program Derived Address)
- **deriveVaultPDA**: Derives the vault PDA based on creator and vault name
- **createCreateVaultTransaction**: Creates a complete transaction for vault creation

### 2. Program IDs (`src/components/solana/programIds/programids.ts`)

Contains the necessary program IDs and token mint addresses:

- `VAULT_FACTORY_PROGRAM_ID`: The main vault factory program
- `ETF_VAULT_PROGRAM_ID`: The ETF vault program that will manage the created vault
- `TOKEN_MINTS`: Common token mint addresses for devnet and mainnet

### 3. CreateVault Component (`src/pages/CreateVault.tsx`)

The main UI component that:
- Collects vault configuration from the user
- Maps user input to the contract's expected format
- Calls the contract through the useContract hook
- Handles success/error states

## How It Works

### 1. User Input Collection
The component collects:
- Vault name and symbol
- Management fee percentage
- Asset allocation with percentages

### 2. Data Transformation
User input is transformed to match the contract's expected format:
- Strings are converted to Uint8Array using `stringToUint8Array()`
- Percentages are converted to basis points using `percentageToBps()`
- Asset symbols are mapped to actual Solana mint addresses

### 3. Contract Call
The process follows these steps:
1. Create a VaultFactoryProgram instance
2. Build the vault parameters object
3. Create the transaction with proper account keys
4. Execute the transaction using the useContract hook
5. Handle the response (success/error)

### 4. Account Keys Required
The createVault instruction requires these accounts:
- `factory`: The factory PDA (derived)
- `vault`: The vault PDA (derived)
- `creator`: The user's wallet address (signer)
- `etfVaultProgram`: The ETF vault program ID
- `systemProgram`: Solana system program
- `rent`: Solana rent sysvar

## Configuration

### Environment Variables
Set these in your `.env` file:
```bash
VITE_VAULT_FACTORY_PROGRAM_ID=your_vault_factory_program_id
VITE_ETF_VAULT_PROGRAM_ID=your_etf_vault_program_id
```

### Token Mint Addresses
Update the `TOKEN_MINTS` object in `programids.ts` with the actual mint addresses for your tokens.

## Usage Example

```typescript
const handleDeployVault = async () => {
  try {
    const vaultFactoryProgram = new VaultFactoryProgram();
    
    const vaultParams = {
      vaultName: stringToUint8Array("My Vault"),
      vaultSymbol: stringToUint8Array("MVLT"),
      managementFeeBps: percentageToBps(2.5), // 2.5%
      underlyingAssets: [
        {
          mint: TOKEN_MINTS.DEVNET.SOL,
          pctBps: percentageToBps(60), // 60%
          name: stringToUint8Array("Solana"),
          symbol: stringToUint8Array("SOL")
        }
      ]
    };

    const transaction = await vaultFactoryProgram.createCreateVaultTransaction(
      userWalletAddress,
      vaultParams,
      ETF_VAULT_PROGRAM_ID
    );

    const signature = await callContract(
      VAULT_FACTORY_PROGRAM_ID.toString(),
      transaction
    );
    
    console.log("Vault created:", signature);
  } catch (error) {
    console.error("Failed to create vault:", error);
  }
};
```

## Error Handling

The implementation includes comprehensive error handling:
- Wallet connection validation
- Transaction execution errors
- User feedback through UI states
- Loading states during deployment

## Security Considerations

- Always validate user input before sending to the contract
- Use proper error handling for failed transactions
- Consider implementing rate limiting for vault creation
- Validate mint addresses and program IDs before use

## Testing

To test the implementation:
1. Ensure you're connected to the correct Solana network (devnet/mainnet)
2. Have sufficient SOL for transaction fees
3. Use valid program IDs and mint addresses
4. Test with small amounts first

## Future Improvements

- Add transaction simulation before execution
- Implement retry logic for failed transactions
- Add more comprehensive input validation
- Support for custom token mint addresses
- Integration with wallet adapters for better UX
