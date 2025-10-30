# Helius Stream Module - Vault Creation Events

This module handles Helius webhook events specifically for **vault creation** on the Solana blockchain. It processes `vault_created` events and logs detailed information about new vault deployments.

## Overview

The Helius Stream module is designed to:
- Receive webhooks from Helius for vault creation events
- Process and log vault creation details
- Verify webhook signatures for security
- Provide a foundation for vault-related business logic

## Features

### ✅ **Vault Creation Event Processing**
- Automatically detects `vault_created` event types
- Logs comprehensive vault information
- Extracts vault metadata, accounts, and configuration
- Skips non-vault events gracefully

### ✅ **Security**
- Webhook signature verification
- Multiple authentication header support
- Configurable webhook secret

### ✅ **Comprehensive Logging**
- Detailed vault creation event logs
- Asset allocation breakdowns
- Account information tracking
- Network and metadata details

## API Endpoints

### Webhook Endpoint
```http
POST /helius-stream/webhook
```

**Headers Required:**
- `x-signature` OR `x-webhook-auth` OR `authorization`

**Body:** Helius webhook payload (JSON)

## Event Types Handled

### 🏦 **Vault Created** (`vault_created`)
The primary event type that this module processes.

**Event Structure:**
```json
{
  "type": "vault_created",
  "description": "Vault creation event",
  "signature": "transaction_signature",
  "slot": 404991589,
  "timestamp": 1733159674,
  "vault_data": {
    "vault_name": "Blue Chip Portfolio",
    "vault_symbol": "BCP",
    "management_fee_bps": 150,
    "underlying_assets": [
      {
        "mint": "So11111111111111111111111111111111111111112",
        "pct_bps": 4000,
        "name": "Solana",
        "symbol": "SOL"
      }
    ]
  },
  "accounts": {
    "factory": "factory_address",
    "vault": "vault_address",
    "creator": "creator_address",
    "etf_vault_program": "etf_program_address",
    "system_program": "system_program_address"
  },
  "metadata": {
    "network": "devnet",
    "instruction_name": "CreateVault",
    "compute_units_consumed": 15659,
    "fee": 5000
  }
}
```

## Configuration

### Environment Variables
```bash
HELIUS_WEBHOOK_SECRET=your_webhook_secret_here
```

## Logging Output

When a vault creation event is received, the module logs:

```
🏦 ===== VAULT CREATION EVENT DETAILS =====
🏦 Event Type: vault_created
🏦 Description: Vault creation event
🏦 Slot: 404991589
🏦 Signature: transaction_signature
🏦 Timestamp: 1733159674
🏦 Vault Data:
   Vault Name: Blue Chip Portfolio
   Vault Symbol: BCP
   Management Fee (bps): 150
   Underlying Assets Count: 3
   Asset 1:
     Mint: So11111111111111111111111111111111111111112
     Name: Solana
     Symbol: SOL
     Percentage (bps): 4000
🏦 Accounts:
   Factory: factory_address
   Vault: vault_address
   Creator: creator_address
   ETF Vault Program: etf_program_address
   System Program: system_program_address
🏦 Metadata:
   Network: devnet
   Instruction Name: CreateVault
   Compute Units Consumed: 15659
   Fee: 5000
🏦 ======================================
```

## Integration Points

### Vault Factory Module
This module can be integrated with the Vault Factory module to:
- Automatically create vault records in the database
- Trigger vault initialization processes
- Update vault statuses

### Business Logic Extensions
You can extend the `processVaultCreationEvent` method to:
- Store vault data to external databases
- Send notifications to stakeholders
- Update analytics and reporting systems
- Trigger downstream processes

## Security Considerations

### Webhook Verification
The module supports multiple signature verification methods:
1. **Direct Secret Comparison**: If Helius sends the secret directly
2. **HMAC SHA256**: Standard webhook signature verification
3. **MD5 Hash**: Alternative hash verification method

### Authentication Headers
The module checks for signatures in multiple header locations:
- `x-signature`
- `x-webhook-auth`
- `authorization`

## Error Handling

The module includes comprehensive error handling for:
- Invalid webhook signatures
- Missing authentication headers
- Malformed webhook data
- Processing failures

## Development

### Adding New Vault Event Types
To add support for additional vault-related events:

1. **Update the interface** in `helius-stream.service.ts`:
```typescript
if (webhookData.type === 'vault_created' || webhookData.type === 'vault_updated') {
  // Handle vault events
}
```

2. **Add processing methods** for new event types
3. **Update logging** to include new event details

### Testing
The module includes unit tests for:
- Webhook signature verification
- Event processing logic
- Error handling scenarios

## Example Usage

### Webhook Configuration
Configure your Helius webhook to point to:
```
https://your-domain.com/helius-stream/webhook
```

### Event Filtering
In your Helius dashboard, filter for:
- **Event Types**: `vault_created`
- **Program IDs**: Your vault factory program ID
- **Networks**: devnet/mainnet as needed

## Monitoring

### Log Monitoring
Monitor the application logs for:
- Webhook receipt confirmations
- Vault creation event details
- Processing success/failure rates
- Authentication verification results

### Metrics to Track
- Webhook volume
- Event processing success rate
- Response times
- Error rates by event type
