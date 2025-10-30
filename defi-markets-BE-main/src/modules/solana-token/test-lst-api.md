# LST API Testing Guide

## Available Endpoints

### 1. Get LST Tokens from Jupiter API
```bash
GET /api/v1/solana-tokens/lst
```

### 2. Create or Update Single LST Token
```bash
POST /api/v1/solana-tokens/lst
Content-Type: application/json

{
  "mintAddress": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  "name": "Jito Staked SOL",
  "symbol": "JitoSOL",
  "decimals": 9,
  "logoUrl": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
  "active": true,
  "twitter": "https://twitter.com/jito_sol",
  "website": "https://jito.network",
  "dev": "EDGARWktv3nDxRYjufjdbZmryqGXceaFPoPpbUzdpqED",
  "tokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "mintAuthority": "6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS",
  "isVerified": true,
  "tags": ["lst", "community", "verified"]
}
```

**Note:** If the token already exists, it will be updated with type `LSTS` and any new information provided.

### 3. Create or Update Multiple LST Tokens (Batch)
```bash
POST /api/v1/solana-tokens/lst/batch
Content-Type: application/json

{
  "lstTokens": [
    {
      "mintAddress": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      "name": "Jito Staked SOL",
      "symbol": "JitoSOL",
      "decimals": 9,
      "logoUrl": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
      "active": true
    },
    {
      "mintAddress": "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
      "name": "Jupiter Staked SOL",
      "symbol": "JupSOL",
      "decimals": 9,
      "logoUrl": "https://static.jup.ag/jupSOL/icon.png",
      "active": true
    }
  ]
}
```

### 4. Fetch and Create/Update LST Tokens from Jupiter API
```bash
POST /api/v1/solana-tokens/lst/fetch-and-create
```

**Note:** This endpoint will fetch all LST tokens from Jupiter API and either create new ones or update existing ones with type `LSTS`.

## Sample Response

### Single LST Creation/Update Response
```json
{
  "_id": "64f8b2c1d4e5f6a7b8c9d0e1",
  "mintAddress": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  "name": "Jito Staked SOL",
  "symbol": "JitoSOL",
  "type": "LSTs",
  "decimals": 9,
  "logoUrl": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
  "active": true,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

### Batch Creation/Update Response
```json
{
  "successCount": 2,
  "createdCount": 1,
  "updatedCount": 1,
  "errorCount": 0,
  "results": [
    {
      "_id": "64f8b2c1d4e5f6a7b8c9d0e1",
      "mintAddress": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      "name": "Jito Staked SOL",
      "symbol": "JitoSOL",
      "type": "LSTs",
      "decimals": 9,
      "logoUrl": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
      "active": true
    },
    {
      "_id": "64f8b2c1d4e5f6a7b8c9d0e2",
      "mintAddress": "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
      "name": "Jupiter Staked SOL",
      "symbol": "JupSOL",
      "type": "LSTs",
      "decimals": 9,
      "logoUrl": "https://static.jup.ag/jupSOL/icon.png",
      "active": true
    }
  ],
  "errors": []
}
```

## Testing with cURL

### Test Single LST Creation/Update
```bash
curl -X POST http://localhost:3000/api/v1/solana-tokens/lst \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "mintAddress": "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    "name": "Jito Staked SOL",
    "symbol": "JitoSOL",
    "decimals": 9,
    "logoUrl": "https://storage.googleapis.com/token-metadata/JitoSOL-256.png",
    "active": true
  }'
```

### Test Fetch and Create/Update from Jupiter API
```bash
curl -X POST http://localhost:3000/api/v1/solana-tokens/lst/fetch-and-create \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Notes

1. All LST tokens are automatically assigned the type `LSTS` in the asset allocation system
2. The API includes proper error handling and validation
3. Batch operations include progress logging and error reporting
4. The `fetch-and-create` endpoint automatically fetches all LST tokens from Jupiter API and creates/updates them in the asset allocation system
5. **Existing tokens are automatically updated** with type `LSTS` instead of failing with duplicate errors
6. The API now provides detailed reporting showing how many tokens were created vs updated
7. All existing tokens with matching mint addresses will have their type changed to `LSTS`
