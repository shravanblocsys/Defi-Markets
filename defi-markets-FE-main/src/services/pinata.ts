/**
 * Pinata IPFS Service
 * Handles uploading metadata to IPFS via backend API
 * The backend securely handles Pinata API calls with JWT token
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

// ============================================================================
// OLD DIRECT PINATA API IMPLEMENTATION (COMMENTED OUT - NOW USING BACKEND)
// ============================================================================

// // Pinata gateway URL (from script.ts)
// const PINATA_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY_API
//   ? `https://${import.meta.env.VITE_PINATA_GATEWAY_API}`
//   : "https://red-late-constrictor-193.mypinata.cloud";

// /**
//  * Get Pinata JWT token from environment variables
//  * Supports both PINATA_JWT_TOKEN and PINATA_JWT for backward compatibility
//  */
// function getPinataJWT(): string | null {
//   return (
//     import.meta.env.VITE_PINATA_JWT_TOKEN ||
//     import.meta.env.VITE_PINATA_JWT ||
//     null
//   );
// }

// /**
//  * Convert IPFS URI to HTTP gateway URL
//  */
// function convertToGatewayUrl(logoUrl: string): string {
//   if (logoUrl.startsWith("ipfs://")) {
//     const ipfsHash = logoUrl.replace("ipfs://", "");
//     return `${PINATA_GATEWAY}/ipfs/${ipfsHash}`;
//   } else if (
//     !logoUrl.startsWith("http://") &&
//     !logoUrl.startsWith("https://")
//   ) {
//     // If it's just a hash without ipfs:// prefix, add gateway
//     return `${PINATA_GATEWAY}/ipfs/${logoUrl}`;
//   }
//   // Already an HTTP URL, use as-is
//   return logoUrl;
// }

// /**
//  * Create metadata JSON object following Metaplex Token Metadata standard
//  */
// function createMetadataObject(params: UploadMetadataParams): VaultMetadata {
//   const {
//     vaultName,
//     vaultSymbol,
//     logoUrl,
//     managementFees,
//     underlyingAssets,
//     vaultMintAddress,
//   } = params;

//   // Convert logo URL to gateway URL for browser compatibility
//   const imageUrl = convertToGatewayUrl(logoUrl);

//   const metadata: VaultMetadata = {
//     name: vaultName,
//     symbol: vaultSymbol,
//     description: `A DeFi vault token representing shares in ${vaultName}. Management fee: ${
//       managementFees / 100
//     }%`,
//     image: imageUrl, // Use gateway HTTP URL (not ipfs://) so browsers can load it
//     attributes: [
//       {
//         trait_type: "Management Fee",
//         value: `${managementFees / 100}%`,
//       },
//       {
//         trait_type: "Underlying Assets",
//         value: underlyingAssets.length.toString(),
//       },
//     ],
//     properties: {
//       category: "DeFi Vault",
//       vault_type: "Multi-Asset",
//     },
//   };

//   // Add Token Extensions format if mint address is provided
//   if (vaultMintAddress) {
//     metadata.additionalMetadata = [
//       {
//         mint: vaultMintAddress,
//         name: vaultName,
//         symbol: vaultSymbol,
//         updateAuthority: null,
//         uri: "", // Will be set after upload
//       },
//     ];
//   }

//   return metadata;
// }

// /**
//  * OLD IMPLEMENTATION: Upload metadata JSON to IPFS using Pinata API directly
//  * This was replaced with backend API call for security (JWT token no longer exposed)
//  */
// export async function uploadMetadataToIPFS_OLD(
//   params: UploadMetadataParams
// ): Promise<string> {
//   const pinataJWT = getPinataJWT();

//   if (!pinataJWT) {
//     throw new Error(
//       "Pinata JWT token not configured. Please set VITE_PINATA_JWT_TOKEN or VITE_PINATA_JWT environment variable."
//     );
//   }

//   try {
//     // Create metadata object
//     const metadata = createMetadataObject(params);

//     // Create a sanitized filename from vault name
//     const sanitizedVaultName = params.vaultName
//       .replace(/[^a-zA-Z0-9]/g, "_")
//       .substring(0, 50);
//     const fileName = `${sanitizedVaultName}_${params.vaultSymbol}_metadata.json`;

//     // Prepare Pinata upload data
//     const pinataData = {
//       pinataMetadata: {
//         name: fileName,
//         keyvalues: {
//           vaultName: params.vaultName,
//           vaultSymbol: params.vaultSymbol,
//           type: "vault_metadata",
//         },
//       },
//       pinataContent: metadata,
//     };

//     // Upload to Pinata
//     const response = await fetch(
//       "https://api.pinata.cloud/pinning/pinJSONToIPFS",
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${pinataJWT}`,
//         },
//         body: JSON.stringify(pinataData),
//       }
//     );

//     if (!response.ok) {
//       const errorText = await response.text();
//       throw new Error(
//         `Pinata upload failed: ${response.statusText}. ${errorText}`
//       );
//     }

//     const result = await response.json();
//     const ipfsHash = result.IpfsHash;
//     const gatewayUri = `${PINATA_GATEWAY}/ipfs/${ipfsHash}`;

//     // If vault mint address is provided, update metadata with complete info and re-upload
//     if (params.vaultMintAddress) {
//       const updatedMetadata: VaultMetadata = {
//         ...metadata,
//         image: convertToGatewayUrl(params.logoUrl), // Keep the gateway HTTP URL
//         additionalMetadata: [
//           {
//             mint: params.vaultMintAddress,
//             name: params.vaultName,
//             symbol: params.vaultSymbol,
//             updateAuthority: null,
//             uri: gatewayUri, // Use gateway URL in additionalMetadata
//           },
//         ],
//       };

//       const updatedFileName = `${sanitizedVaultName}_${params.vaultSymbol}_metadata_complete.json`;
//       const updatedPinataData = {
//         pinataMetadata: {
//           name: updatedFileName,
//           keyvalues: {
//             vaultName: params.vaultName,
//             vaultSymbol: params.vaultSymbol,
//             mintAddress: params.vaultMintAddress,
//             type: "vault_metadata_complete",
//           },
//         },
//         pinataContent: updatedMetadata,
//       };

//       const updateResponse = await fetch(
//         "https://api.pinata.cloud/pinning/pinJSONToIPFS",
//         {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${pinataJWT}`,
//           },
//           body: JSON.stringify(updatedPinataData),
//         }
//       );

//       if (!updateResponse.ok) {
//         const errorText = await updateResponse.text();
//         throw new Error(
//           `Pinata re-upload failed: ${updateResponse.statusText}. ${errorText}. The initial metadata was uploaded, but the complete metadata with additionalMetadata.uri could not be uploaded.`
//         );
//       }

//       const updateResult = await updateResponse.json();
//       const updatedIpfsHash = updateResult.IpfsHash;
//       return `${PINATA_GATEWAY}/ipfs/${updatedIpfsHash}`;
//     }

//     // Return gateway URL for on-chain storage
//     return gatewayUri;
//   } catch (error) {
//     console.error("❌ Pinata upload error:", error);
//     throw error;
//   }
// }

// /**
//  * OLD: Check if Pinata is configured (checked for JWT token)
//  */
// export function isPinataConfigured_OLD(): boolean {
//   return getPinataJWT() !== null;
// }

// ============================================================================
// NEW BACKEND API IMPLEMENTATION (CURRENT)
// ============================================================================

export interface VaultMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
  properties: {
    category: string;
    vault_type: string;
  };
  additionalMetadata?: Array<{
    mint: string;
    name: string;
    symbol: string;
    updateAuthority: null;
    uri: string;
  }>;
}

export interface UploadMetadataParams {
  vaultName: string;
  vaultSymbol: string;
  logoUrl: string;
  managementFees: number; // in basis points
  underlyingAssets: Array<{ mintAddress: string; mintBps: number }>;
  vaultMintAddress?: string; // Optional, for Token Extensions format
}

interface BackendMetadataResponse {
  status: string;
  data: {
    ipfsHash: string;
    gatewayUrl: string;
  };
}

/**
 * Upload metadata JSON to IPFS via backend API
 * @param params - Metadata parameters
 * @returns Gateway URL (HTTP URL) for the uploaded metadata
 * @throws Error if upload fails
 */
export async function uploadMetadataToIPFS(
  params: UploadMetadataParams
): Promise<string> {
  try {
    // Get user authentication token
    const token = sessionStorage.getItem("token");
    console.log("token is metadata upload:", token);
    if (!token) {
      throw new Error(
        "User authentication required. Please log in to upload metadata."
      );
    }

    // Prepare request body for backend API
    const requestBody = {
      vaultName: params.vaultName,
      vaultSymbol: params.vaultSymbol,
      logoUrl: params.logoUrl,
      managementFees: params.managementFees,
      underlyingAssets: params.underlyingAssets,
      ...(params.vaultMintAddress && {
        vaultMintAddress: params.vaultMintAddress,
      }),
    };

    // Call backend API endpoint
    const response = await fetch(`${API_BASE_URL}/pinata/upload-metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message ||
          `Metadata upload failed: ${response.statusText} (${response.status})`
      );
    }

    const result: BackendMetadataResponse = await response.json();

    if (result.status !== "success" || !result.data?.gatewayUrl) {
      throw new Error(
        "Invalid response from server: Missing gateway URL in response"
      );
    }

    // Return the gateway URL from backend response
    return result.data.gatewayUrl;
  } catch (error) {
    console.error("❌ Metadata upload error:", error);
    throw error;
  }
}

/**
 * Check if Pinata is configured (now checks for user authentication)
 */
export function isPinataConfigured(): boolean {
  // Check if user is authenticated (has token)
  // The backend handles Pinata configuration
  return sessionStorage.getItem("token") !== null;
}
