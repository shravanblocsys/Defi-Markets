# Transaction Event Management Module

This module provides functionality to read Solana blockchain transactions and extract their program logs.

## Features

- **Transaction Reading**: Fetch transaction details from Solana blockchain
- **Structured Event Decoding**: Parse Solana program events with proper field extraction
- **Event Type Detection**: Automatically identify event types using discriminators
- **Automatic Vault Creation**: Automatically create vault factory records for VaultCreated events
- **Console Logging**: Automatically log program logs to console for debugging
- **Validation**: Validate transaction signature format
- **Error Handling**: Comprehensive error handling for various failure scenarios

## API Endpoints

### POST /api/v1/tx-event-management/read-transaction

Reads a Solana transaction, processes VaultCreated events, and creates vault factory records.

**Request Body:**
```json
{
  "transactionSignature": "41xUTMn2bLsd2VKDZnkyXerFP8CWSBcEqZGW1eeudbLxxDYquFWcRx7E2UHEa45Rr1dnPi4QLFfNxzsBMEAmm4Tr"
}
```

**Response:**
```json
[
  {
    "eventType": "VaultCreated",
    "vault": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
      "vaultName": "Vault_1756982611845",
      "vaultSymbol": "VT7GD",
      "vaultAddress": "Dp9Jx5R8ZnHQPf8eyFLXsex1eNoqvHhvH598xFTWZnzs",
      "factoryAddress": "94e6XgPDWSCNENc6BPZHTUbMnziVPbEn8hvmdWog9cre",
      "creatorAddress": "AexZm9S565MmrLuJvNvtvfoAwB5z52Wcj6bgJ9xaHrA",
      "status": "active",
      "blockTime": "2025-09-04T10:43:32.000Z",
      "originalTimestamp": "1756982612"
    },
    "success": true,
    "message": "Vault Vault_1756982611845 created successfully"
  }
]
```

## Configuration

Set the following environment variable to configure the Solana RPC endpoint:

```bash
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

**Available RPC endpoints:**
- **Mainnet**: `https://api.mainnet-beta.solana.com`
- **Devnet**: `https://api.devnet.solana.com`
- **Testnet**: `https://api.testnet.solana.com`
- **Custom**: Your own RPC endpoint

## Usage Examples

### Using cURL

```bash
curl -X POST http://localhost:3000/tx-event-management/read-transaction \
  -H "Content-Type: application/json" \
  -d '{
    "transactionSignature": "41xUTMn2bLsd2VKDZnkyXerFP8CWSBcEqZGW1eeudbLxxDYquFWcRx7E2UHEa45Rr1dnPi4QLFfNxzsBMEAmm4Tr"
  }'
```

### Using JavaScript/TypeScript

```typescript
const response = await fetch('/tx-event-management/read-transaction', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    transactionSignature: '41xUTMn2bLsd2VKDZnkyXerFP8CWSBcEqZGW1eeudbLxxDYquFWcRx7E2UHEa45Rr1dnPi4QLFfNxzsBMEAmm4Tr'
  })
});

const result = await response.json();
console.log('Program Logs:', result.programLogs);
```

## Console Logging

The service automatically logs the structured decoded data to the console in the following format:

```
=== TRANSACTION DECODED DATA ===
Transaction: 41xUTMn2bLsd2VKDZnkyXerFP8CWSBcEqZGW1eeudbLxxDYquFWcRx7E2UHEa45Rr1dnPi4QLFfNxzsBMEAmm4Tr
Status: success
Structured Events:
1. {
  "eventType": "VaultCreated",
  "vault": "94e6XgPDWSCNENc6BPZHTUbMnziVPbEn8hvmdWog9cre",
  "factory": "5F6ecRpEcwpNhNiZTHcboNWDff1CPY6NfrAdvPYRM5ZQ",
  "creator": "AexZm9S565MmrLuJvNvtvfoAwB5z52Wcj6bgJ9xaHrA",
  "vaultName": "Vault_1756982611845",
  "vaultSymbol": "VT7GD",
  "managementFeeBps": 150,
  "managementFeePercent": "1.50",
  "underlyingAssetsCount": 3,
  "totalSupply": "0",
  "nav": "0",
  "timestamp": "1756982612",
  "createdAt": "2025-12-03T12:30:12.000Z"
}
=== END DECODED DATA ===
```

## Error Handling

The API handles various error scenarios:

- **Invalid Transaction Signature**: Returns 400 if the signature format is invalid
- **Transaction Not Found**: Returns 400 if the transaction doesn't exist on the blockchain
- **RPC Errors**: Returns 500 for network or RPC-related errors

## Dependencies

- `@solana/web3.js`: Solana blockchain interaction
- `@nestjs/common`: NestJS framework
- `class-validator`: Request validation
- `@nestjs/swagger`: API documentation

## Notes

- The service uses the 'confirmed' commitment level for transaction fetching
- Program logs are filtered to show only relevant program execution logs
- Program data is extracted from logs that start with "Program data:"
- Program data is automatically decoded from base64 to UTF-8 text
- The service supports both legacy and versioned transactions
- Console logging is performed for every transaction read request

## Supported Event Types

The service automatically detects and decodes the following Solana program events:

- **VaultCreated** (`751978fe4bec4e73`): Vault creation events with vault details
- **FactoryAssetsUpdated** (`ed363f30d7c928d7`): Factory asset configuration updates
- **FactoryInitialized** (`145688f675618ff0`): Factory initialization events
- **FactoryFeesUpdated** (`978890413dd89840`): Factory fee updates
- **VaultFeesUpdated** (`fbdd7e1809d86367`): Vault fee updates
- **ProtocolFeesCollected** (`a5227d54fb89a39b`): Protocol fee collection events
- **FactoryStateChanged** (`ca0c99be7ba73f0e`): Factory state changes

Unknown event types are decoded generically with potential public key extraction.

## Automatic Vault Creation

When a `VaultCreated` event is detected in a transaction, the service automatically:

1. **Creates a vault factory record** in the database
2. **Populates all available fields** from the blockchain event
3. **Sets default values** for missing required fields
4. **Attempts to resolve creator profile** from blockchain address
5. **Sets default payment tokens** (SOL, USDC, etc.)
6. **Updates vault status** to 'active' when all data is populated
7. **Converts Unix timestamps** to proper UTC timezone dates

The vault record starts with status 'pending' and is automatically updated to 'active' once all required data is populated.

### Timestamp Handling

- **Unix Timestamp**: Original blockchain timestamp (e.g., "1756982612")
- **UTC Date**: Converted to proper UTC timezone (e.g., "2025-09-04T10:43:32.000Z")
- **Database Storage**: Both values are stored for reference and querying
- **Automatic Conversion**: Unix timestamps are automatically converted to UTC dates
