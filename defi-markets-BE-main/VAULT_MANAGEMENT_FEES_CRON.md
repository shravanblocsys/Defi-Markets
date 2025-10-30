# Vault Management Fees Cron Job

## Overview

This implementation adds an automated cron job that calculates and stores vault management fees for all vaults daily at midnight. The system integrates with Solana blockchain to fetch real-time vault data and calculate fees based on live token prices from Jupiter API.

## Features

- **Automated Daily Calculation**: Runs every day at midnight (00:00) to calculate vault management fees
- **Real-time Data**: Fetches live vault data from Solana blockchain
- **Live Price Integration**: Uses Jupiter API for real-time token prices
- **Comprehensive Fee Calculation**: Calculates NAV, GAV, AUM, and accrued management fees
- **Database Storage**: Stores calculated fees in MongoDB with detailed metadata
- **Manual Triggers**: Provides API endpoints for manual calculation and testing

## Architecture

### Components

1. **VaultFeesCalculationService**: Core service that handles Solana integration and fee calculations
2. **CronJobService**: Extended to include vault fees calculation cron job
3. **VaultManagementFeesService**: Database operations for storing and retrieving fee data
4. **VaultManagementFeesController**: API endpoints for manual operations

### Data Flow

```
Midnight Cron Trigger
    ↓
CronJobService.calculateVaultManagementFees()
    ↓
VaultFeesCalculationService.calculateAllVaultFees()
    ↓
For each vault:
    ├── Fetch vault data from Solana blockchain
    ├── Get live token prices from Jupiter API
    ├── Calculate GAV, NAV, and accrued fees
    ├── Store results in database
    └── Continue to next vault
```

## Environment Configuration

Ensure the following environment variables are set:

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_VAULT_FACTORY_ADDRESS=CtH2WicL6g2NkP3GPzc6aKyvkeeHxioiaiG8kXjCaHVs

# Jupiter API
JUPITER_API_BASE_URL=https://lite-api.jup.ag
```

## API Endpoints

### Manual Calculation Endpoints

#### Calculate All Vault Fees
```http
POST /vault-management-fees/calculate-all
```

#### Calculate Specific Vault Fees
```http
POST /vault-management-fees/calculate/{vaultIndex}
```

### Query Endpoints

#### Get All Fees
```http
GET /vault-management-fees?page=1&limit=10&vaultName=ABC&status=pending
```

#### Get Fees by Vault Index
```http
GET /vault-management-fees/vault-index/{vaultIndex}
```

#### Get Fee Statistics
```http
GET /vault-management-fees/statistics
```

## Fee Calculation Logic

### 1. Vault Data Retrieval
- Fetches vault account data from Solana blockchain
- Retrieves underlying assets and their allocations
- Gets raw token balances for each underlying asset
- Gets current stablecoin balance
- **Note**: Does not use `total_assets` from contract - calculates live GAV from raw balances

### 2. Live Price Fetching
- Fetches real-time token prices from Jupiter API
- Handles multiple tokens in batch requests
- Includes error handling for missing prices

### 3. GAV Calculation (from Raw Balances)
```typescript
// Add stablecoin balance (convert to USD value using live USDC price)
stablecoinBalanceInTokens = rawBalance / 10^stablecoinDecimals (get decimals from contract)
stablecoinValueUsd = stablecoinBalanceInTokens * liveUsdcPrice (from Jupiter API)
stablecoinValueScaled = stablecoinValueUsd * 1_000_000 (convert to 6-decimal USD format)
liveGav += stablecoinValueScaled

// Add underlying asset values (same logic as read_vault.ts)
for each asset:
  balanceInTokens = rawBalance / 10^tokenDecimals (get decimals from contract)
  valueUsd = balanceInTokens * priceUsd (from Jupiter API)
  valueUsdScaled = valueUsd * 1_000_000 (convert to 6-decimal USD format)
  liveGav += valueUsdScaled
```

### 4. Fee Accrual Calculation
```typescript
// Calculate newly accrued fees (all in 6-decimal USD format)
elapsedSeconds = currentTimestamp - lastFeeAccrualTs
newlyAccruedFees = (liveGav * managementFeeBps * elapsedSeconds) / (10_000 * SECONDS_PER_YEAR)
// previouslyAccruedFees is already in 6-decimal USD format from contract
totalAccruedFees = previouslyAccruedFees + newlyAccruedFees
```

### 5. NAV Calculation
```typescript
// All values in 6-decimal USD format
nav = liveGav - totalAccruedFees
```

### 6. Fee Distribution
```typescript
// All fees in 6-decimal USD format
etfCreatorFee = totalAccruedFees * 0.7  // 70% to vault admin
platformOwnerFee = totalAccruedFees * 0.3  // 30% to platform
```

## Contract Decimal Formats

The Solana contract uses specific decimal formats for different data types:

- **total_supply**: `u64` - 9-decimal format (like SOL tokens)
- **accrued_management_fees_usdc**: `u64` - 6-decimal USD format
- **Asset balances**: Raw token amounts (not converted to USD)
- **Price calculations**: All done in 6-decimal USD format

**Note**: We do not use `total_assets` from the contract. Instead, we calculate live GAV by:
1. Getting raw token balances for each underlying asset
2. Getting token decimals dynamically from the contract (not hardcoded)
3. Converting to human-readable format using token decimals
4. Multiplying by live prices from Jupiter API to get USD values (including live USDC price)
5. Summing everything up to get the total GAV

## Database Schema

### VaultManagementFee Entity

```typescript
{
  date: string,                    // YYYY-MM-DD format
  vaultName: string,               // Vault name
  vaultSymbol: string,             // Vault symbol
  vaultIndex: number,              // Vault index from contract
  etfCreatorFee: number,           // Fee amount for ETF creator (70%)
  platformOwnerFee: number,        // Fee amount for platform owner (30%)
  todaysAum: number,               // Today's Assets Under Management
  status: FeeStatus,               // pending, allocated, in_process, completed
  metadata: object,                // Additional calculation details
  transactionSignature?: string,   // Blockchain transaction if applicable
  notes?: string                   // Additional notes
}
```

## Cron Job Schedule

- **Schedule**: `0 0 * * *` (Every day at midnight)
- **Timezone**: Server timezone
- **Duration**: Varies based on number of vaults (typically 1-5 minutes)

## Error Handling

### Rate Limiting
- Implements delays between vault calculations
- Handles Jupiter API rate limits gracefully
- Continues processing other vaults if one fails

### Missing Data
- Skips vaults without vault index
- Handles missing token accounts gracefully
- Logs warnings for missing price data

### Blockchain Errors
- Retries failed blockchain calls
- Continues with other vaults on individual failures
- Comprehensive error logging

## Monitoring and Logging

### Log Levels
- **INFO**: Normal operation, successful calculations
- **WARN**: Missing data, rate limits, non-critical issues
- **ERROR**: Critical failures, blockchain errors

### Key Metrics
- Number of vaults processed
- Success/failure rates
- Calculation duration
- Fee amounts calculated

## Testing

### Manual Testing
```bash
# Test specific vault calculation
curl -X POST http://localhost:3000/vault-management-fees/calculate/15

# Test all vaults calculation
curl -X POST http://localhost:3000/vault-management-fees/calculate-all
```

### Automated Testing
```bash
# Run the test script
npx ts-node test-vault-fees.ts
```

## Performance Considerations

### Optimization Strategies
- Batch price fetching for multiple tokens
- Parallel processing where possible
- Efficient database queries
- Caching of frequently accessed data

### Scalability
- Handles large numbers of vaults
- Configurable batch sizes
- Rate limiting to prevent API overload
- Database indexing for fast queries

## Security Considerations

### API Security
- Rate limiting on manual endpoints
- Input validation for vault indices
- Error message sanitization

### Data Integrity
- Validation of blockchain data
- Duplicate prevention (one calculation per day per vault)
- Transaction rollback on failures

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   - Ensure `SOLANA_VAULT_FACTORY_ADDRESS` is set
   - Verify `SOLANA_RPC_URL` is accessible

2. **Jupiter API Rate Limits**
   - Check logs for rate limit errors
   - Verify API key if using authenticated endpoints

3. **Blockchain Connection Issues**
   - Verify RPC endpoint is accessible
   - Check network connectivity
   - Validate factory address

4. **Database Connection Issues**
   - Verify MongoDB connection
   - Check database permissions
   - Validate schema compatibility

### Debug Mode
Enable detailed logging by setting log level to DEBUG in your environment configuration.

## Future Enhancements

### Planned Features
- Real-time fee calculation updates
- Historical fee trend analysis
- Automated fee collection
- Multi-network support
- Enhanced error recovery

### Performance Improvements
- Redis caching for price data
- Parallel vault processing
- Optimized database queries
- Background job processing
