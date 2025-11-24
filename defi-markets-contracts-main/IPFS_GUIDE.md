# IPFS Guide for Token Metadata and Logo

This guide explains how to use IPFS to store token metadata and logos for your vault tokens.

## Overview

When creating a vault, you can include token metadata (name, symbol, description, logo) by uploading it to IPFS. The metadata URI is stored in the Metaplex Token Metadata account and can be accessed by wallets and explorers to display your token information.

## Quick Start

### Option 1: Using Pinata (Recommended)

1. **Sign up for Pinata**
   - Go to https://app.pinata.cloud/
   - Create a free account
   - Navigate to API Keys section

2. **Get your JWT Token**
   - Click "New Key"
   - Give it a name (e.g., "Vault Metadata")
   - Copy the JWT token

3. **Set Environment Variable**
   ```bash
   export PINATA_JWT_TOKEN="your-jwt-token-here"
   ```
   
   Or if you prefer the shorter name:
   ```bash
   export PINATA_JWT="your-jwt-token-here"
   ```
   
   Both are supported for backward compatibility.

4. **Set Logo URL (Optional)**
   ```bash
   export VAULT_LOGO_URL="https://your-domain.com/logo.png"
   # Or use an IPFS URL: ipfs://QmYourHashHere
   ```

5. **Run Your Script**
   ```bash
   npx ts-node script.ts create
   ```

The script will automatically:
- Create metadata JSON with your vault information
- Upload it to IPFS via Pinata
- Use the IPFS URI when creating the vault

### Option 2: Using NFT.Storage

1. **Sign up for NFT.Storage**
   - Go to https://nft.storage/
   - Create a free account
   - Navigate to API Keys section

2. **Get your API Key**
   - Create a new API key
   - Copy the key

3. **Set Environment Variable**
   ```bash
   export NFT_STORAGE_API_KEY="your-api-key-here"
   ```

4. **Run Your Script**
   ```bash
   npx ts-node script.ts create
   ```

## Manual Upload Process

If you prefer to upload manually or want more control:

### Step 1: Prepare Your Logo

1. Create or obtain your vault logo image
   - Recommended size: 512x512 pixels or larger
   - Format: PNG, JPG, or SVG
   - Keep file size reasonable (< 1MB recommended)

2. Upload logo to IPFS:
   - **Using Pinata Web UI**: Go to https://app.pinata.cloud/pinmanager, click "Upload", select your logo
   - **Using Pinata API**: Use the `uploadLogoToIPFS()` function in script.ts
   - **Using NFT.Storage**: Go to https://nft.storage/, upload your file

3. Copy the IPFS URL (e.g., `ipfs://QmYourHashHere`)

### Step 2: Create Metadata JSON

Create a JSON file with the following structure:

```json
{
  "name": "Your Vault Name",
  "symbol": "VAULT",
  "description": "A DeFi vault token representing shares in Your Vault Name. Management fee: 2%",
  "image": "ipfs://QmYourLogoHashHere",
  "attributes": [
    {
      "trait_type": "Management Fee",
      "value": "2%"
    },
    {
      "trait_type": "Underlying Assets",
      "value": "16"
    }
  ],
  "properties": {
    "category": "DeFi Vault",
    "vault_type": "Multi-Asset"
  }
}
```

**Fields:**
- `name`: Your vault name
- `symbol`: Your vault symbol
- `description`: Description of your vault
- `image`: IPFS URL or HTTP URL to your logo
- `attributes`: Array of trait objects (optional)
- `properties`: Additional properties (optional)

### Step 3: Upload Metadata to IPFS

1. **Using Pinata Web UI**:
   - Go to https://app.pinata.cloud/pinmanager
   - Click "Upload"
   - Select your metadata JSON file
   - Copy the IPFS hash

2. **Using Pinata API**:
   ```bash
   curl -X POST https://api.pinata.cloud/pinning/pinJSONToIPFS \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_PINATA_JWT" \
     -d @metadata.json
   ```

3. **Using NFT.Storage**:
   - Go to https://nft.storage/
   - Upload your metadata JSON file
   - Copy the IPFS hash

### Step 4: Use the IPFS URI

The IPFS URI format is: `ipfs://QmYourHashHere`

You can use this URI in two ways:

1. **Automatic (via script.ts)**: Set `PINATA_JWT` or `NFT_STORAGE_API_KEY` and the script will handle it
2. **Manual**: Pass the URI directly when calling `createVault()`:

```typescript
const metadataUri = "ipfs://QmYourHashHere";
await program.methods.createVault(
  vaultName,
  vaultSymbol,
  underlyingAssets,
  managementFees,
  metadataUri  // Your IPFS URI here
);
```

## Accessing IPFS Content

IPFS content can be accessed via:

1. **IPFS Gateway URLs**:
   - Pinata: `https://gateway.pinata.cloud/ipfs/QmYourHashHere`
   - IPFS.io: `https://ipfs.io/ipfs/QmYourHashHere`
   - Cloudflare: `https://cloudflare-ipfs.com/ipfs/QmYourHashHere`

2. **IPFS Protocol**: `ipfs://QmYourHashHere` (requires IPFS client)

Most wallets and explorers will automatically resolve IPFS URIs using public gateways.

## Best Practices

1. **Logo Guidelines**:
   - Use high-quality images (512x512 minimum)
   - Keep file sizes reasonable (< 1MB)
   - Use PNG for transparency, JPG for photos
   - Ensure logo is recognizable at small sizes

2. **Metadata Guidelines**:
   - Keep descriptions concise but informative
   - Include relevant attributes
   - Ensure all URLs are accessible
   - Test metadata before deploying

3. **IPFS Pinning**:
   - Pin your content to ensure it stays available
   - Consider using multiple pinning services for redundancy
   - Monitor your pinning service account limits

4. **Testing**:
   - Test metadata URLs before creating vaults
   - Verify images load correctly
   - Check metadata JSON is valid

## Troubleshooting

### "No IPFS service configured" Warning

**Solution**: Set either `PINATA_JWT_TOKEN` (or `PINATA_JWT`) or `NFT_STORAGE_API_KEY` environment variable.

### Metadata Upload Fails

**Possible causes**:
- Invalid API key/JWT
- Network issues
- File too large
- Invalid JSON format

**Solution**: Check your API credentials, network connection, and file format.

### Logo Not Displaying

**Possible causes**:
- Invalid IPFS URL
- Content not pinned
- Gateway issues

**Solution**: 
- Verify IPFS hash is correct
- Ensure content is pinned
- Try different IPFS gateways
- Use HTTP URL as fallback

### Empty Metadata URI

If you create a vault without metadata, you can update it later using Metaplex's `UpdateMetadataAccountV2` instruction.

## Example Workflow

```bash
# 1. Set up Pinata
export PINATA_JWT_TOKEN="your-jwt-token-here"
# Or use: export PINATA_JWT="your-jwt-token-here"

# 2. (Optional) Set logo URL
export VAULT_LOGO_URL="ipfs://QmYourLogoHash"
# Or use an HTTP URL: export VAULT_LOGO_URL="https://your-domain.com/logo.png"

# 3. Create vault (metadata will be uploaded automatically)
npx ts-node script.ts create

# 4. Verify metadata
# Check the transaction logs for the IPFS URI
# Visit https://gateway.pinata.cloud/ipfs/YOUR_HASH to view metadata
```

## Additional Resources

- [Pinata Documentation](https://docs.pinata.cloud/)
- [NFT.Storage Documentation](https://nft.storage/docs/)
- [Metaplex Token Metadata Standard](https://docs.metaplex.com/programs/token-metadata/)
- [IPFS Documentation](https://docs.ipfs.io/)

## Support

If you encounter issues:
1. Check the error messages in the console
2. Verify your API credentials
3. Test IPFS URLs manually
4. Check network connectivity
5. Review the troubleshooting section above

