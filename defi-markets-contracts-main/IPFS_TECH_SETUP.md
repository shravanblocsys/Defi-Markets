# IPFS.tech Setup Guide

This guide explains how to set up and use IPFS HTTP API (including ipfs.tech) for uploading token metadata.

## What is IPFS HTTP API?

IPFS HTTP API allows you to interact with an IPFS node programmatically. You can use:
- Your own local IPFS node
- A remote IPFS node (like ipfs.tech)
- Any IPFS gateway that supports the HTTP API

## Setup Options

### Option 1: Using ipfs.tech (Remote IPFS Node)

**ipfs.tech** is a public IPFS gateway that may provide HTTP API access. However, most public gateways don't allow direct uploads via API for security reasons.

**If ipfs.tech provides API access:**
```bash
export IPFS_API_URL="https://ipfs.tech"
# or
export IPFS_API_URL="https://api.ipfs.tech"
```

**Note:** You'll need to check ipfs.tech documentation for their specific API endpoint and authentication requirements.

### Option 2: Using Your Own Local IPFS Node (Recommended)

#### Step 1: Install IPFS

**macOS (using Homebrew):**
```bash
brew install ipfs
```

**Linux:**
```bash
# Download from https://dist.ipfs.tech/#kubo
# Or use package manager
sudo apt-get install ipfs  # Ubuntu/Debian
```

**Windows:**
- Download from https://dist.ipfs.tech/#kubo
- Or use Chocolatey: `choco install ipfs`

#### Step 2: Initialize IPFS Node

```bash
ipfs init
```

This creates your IPFS configuration and generates a key pair.

#### Step 3: Start IPFS Daemon

```bash
ipfs daemon
```

This starts the IPFS node and makes it available at `http://localhost:5001` by default.

**Keep this terminal running!** The daemon needs to stay active.

#### Step 4: Configure CORS (Important!)

To allow your application to access the IPFS API, you need to enable CORS:

```bash
# In a new terminal (while daemon is running)
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "GET", "POST"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Credentials '["true"]'
```

Then restart the daemon:
```bash
# Stop the daemon (Ctrl+C) and restart
ipfs daemon
```

#### Step 5: Set Environment Variable

```bash
export IPFS_API_URL="http://localhost:5001"
```

Or add to your `.env` file:
```
IPFS_API_URL=http://localhost:5001
```

### Option 3: Using IPFS Desktop (Easier GUI Option)

1. Download IPFS Desktop from https://docs.ipfs.tech/install/ipfs-desktop/
2. Install and launch IPFS Desktop
3. It automatically starts the IPFS daemon
4. The API will be available at `http://localhost:5001`
5. Set environment variable: `export IPFS_API_URL="http://localhost:5001"`

## Usage in Your Code

Once set up, the code will automatically use IPFS HTTP API if `IPFS_API_URL` is set:

```bash
# Set the environment variable
export IPFS_API_URL="http://localhost:5001"

# Run your script
npx ts-node ipfsCreateVault.ts create
```

## How It Works

1. **Upload**: The code converts your metadata JSON to a file and uploads it via IPFS HTTP API `/api/v0/add` endpoint
2. **Get CID**: IPFS returns a Content Identifier (CID/Hash)
3. **Pin**: The code automatically pins the file to ensure it stays available
4. **Return URI**: Returns `ipfs://<CID>` format

## Important Notes

### Pinning Files

- Files uploaded to IPFS are cached but not permanently stored unless pinned
- The code automatically pins files after upload
- To manually pin: `ipfs pin add <CID>`
- To unpin: `ipfs pin rm <CID>`

### File Persistence

- **Local Node**: Files are stored on your machine. If you stop the node, files may become unavailable to others
- **For Production**: Consider using:
  - IPFS Cluster for distributed pinning
  - Pinata or NFT.Storage for reliable pinning
  - Multiple IPFS nodes

### Gateway Access

After uploading, your files are accessible via:
- Your local gateway: `http://localhost:8080/ipfs/<CID>`
- Public gateways: 
  - `https://ipfs.io/ipfs/<CID>`
  - `https://gateway.pinata.cloud/ipfs/<CID>`
  - `https://cloudflare-ipfs.com/ipfs/<CID>`

## Troubleshooting

### "Connection refused" Error

**Problem**: Can't connect to IPFS API

**Solution**:
1. Make sure IPFS daemon is running: `ipfs daemon`
2. Check the API is accessible: `curl http://localhost:5001/api/v0/version`
3. Verify `IPFS_API_URL` is set correctly

### CORS Errors

**Problem**: Browser/Node.js CORS errors when accessing API

**Solution**:
1. Configure CORS as shown in Step 4 above
2. Restart the IPFS daemon after configuring CORS

### Files Not Accessible

**Problem**: Files uploaded but can't be accessed via gateway

**Solution**:
1. Make sure files are pinned: `ipfs pin ls <CID>`
2. Check your node is connected: `ipfs swarm peers`
3. Wait a few minutes for IPFS network propagation
4. Try accessing via different gateways

### Port Already in Use

**Problem**: Port 5001 is already in use

**Solution**:
1. Find what's using the port: `lsof -i :5001` (macOS/Linux)
2. Change IPFS API port: `ipfs config Addresses.API /ip4/127.0.0.1/tcp/5002`
3. Update `IPFS_API_URL` to use the new port

## Testing Your Setup

Test if IPFS is working:

```bash
# Check IPFS version
curl http://localhost:5001/api/v0/version

# Add a test file
echo "Hello IPFS" > test.txt
curl -F file=@test.txt http://localhost:5001/api/v0/add

# You should get a JSON response with a Hash (CID)
```

## Priority Order

The code checks IPFS services in this order:
1. **IPFS_API_URL** (IPFS HTTP API - highest priority)
2. **PINATA_JWT_TOKEN** (Pinata)
3. **NFT_STORAGE_API_KEY** (NFT.Storage)

Set `IPFS_API_URL` to use IPFS directly instead of Pinata or NFT.Storage.

## Production Considerations

For production use:
- Use a dedicated IPFS node (not localhost)
- Set up IPFS Cluster for redundancy
- Consider using Pinata or NFT.Storage for reliable pinning
- Monitor your IPFS node's disk space
- Set up proper backup and pinning strategies

