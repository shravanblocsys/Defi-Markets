import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import * as fs from "fs";

// Use require for CommonJS module compatibility
const FormData = require("form-data");

export interface PinataUploadResult {
  ipfsHash: string;
  ipfsUri: string;
  gatewayUrl: string;
  pinSize: number;
  timestamp: string;
}

@Injectable()
export class PinataService {
  private readonly logger = new Logger(PinataService.name);
  private readonly pinataJwt: string;
  private readonly pinataApiKey: string;
  private readonly pinataSecretKey: string;
  private readonly pinataGateway: string;
  private readonly pinataApiUrl = "https://api.pinata.cloud";

  // Allowed image MIME types
  private readonly allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ];

  // Maximum file size (10MB)
  private readonly maxFileSize = 10 * 1024 * 1024;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.pinataJwt = this.configService.get("PINATA_JWT_TOKEN") || "";
    this.pinataApiKey = this.configService.get("PINATA_API_KEY") || "";
    this.pinataSecretKey = this.configService.get("PINATA_SECRET_KEY") || "";
    const gatewayFromConfig =
      this.configService.get("PINATA_GATEWAY_API") ||
      "https://gateway.pinata.cloud";
    // Ensure gateway URL has https:// protocol
    this.pinataGateway = this.ensureHttpsProtocol(gatewayFromConfig);

    if (!this.pinataJwt && (!this.pinataApiKey || !this.pinataSecretKey)) {
      this.logger.warn(
        "Pinata configuration is incomplete. Image upload will be disabled."
      );
    }
  }

  /**
   * Upload an image file to Pinata IPFS
   * @param file - The file buffer or file path to upload
   * @param fileName - Optional custom filename
   * @param metadata - Optional metadata to attach to the pin
   * @returns Pinata upload result with IPFS hash and URLs
   */
  async uploadImage(
    file: Buffer | string,
    fileName?: string,
    metadata?: Record<string, any>
  ): Promise<PinataUploadResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException("Pinata is not configured");
    }

    let fileBuffer: Buffer;
    let originalFileName: string;

    // Handle both file path (string) and buffer
    if (typeof file === "string") {
      if (!fs.existsSync(file)) {
        throw new BadRequestException(`File not found: ${file}`);
      }
      fileBuffer = fs.readFileSync(file);
      originalFileName = fileName || file.split("/").pop() || "image.png";
    } else {
      fileBuffer = file;
      originalFileName = fileName || "image.png";
    }

    // Validate file size
    if (fileBuffer.length > this.maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${
          this.maxFileSize / (1024 * 1024)
        }MB`
      );
    }

    // Validate MIME type based on file extension
    const contentType = this.getContentType(originalFileName);
    if (!this.allowedMimeTypes.includes(contentType)) {
      throw new BadRequestException(
        `File type ${contentType} is not allowed. Allowed types: ${this.allowedMimeTypes.join(
          ", "
        )}`
      );
    }

    // Validate file content matches expected MIME type (magic bytes validation)
    if (!this.validateFileContent(fileBuffer, contentType)) {
      throw new BadRequestException(
        `File content does not match the expected file type ${contentType}. The file may be corrupted or have an incorrect extension.`
      );
    }

    try {
      const formData = new FormData();
      formData.append("file", fileBuffer, {
        filename: originalFileName,
        contentType: contentType,
      });

      // Add metadata if provided
      if (metadata) {
        formData.append(
          "pinataMetadata",
          JSON.stringify({
            name: originalFileName,
            keyvalues: metadata,
          })
        );
      }

      // Add pinata options
      formData.append(
        "pinataOptions",
        JSON.stringify({
          cidVersion: 0,
        })
      );

      const headers: Record<string, string> = {
        ...formData.getHeaders(),
      };

      // Use JWT token if available, otherwise use API key/secret
      if (this.pinataJwt) {
        headers["Authorization"] = `Bearer ${this.pinataJwt}`;
        this.logger.debug("Using JWT token for Pinata authentication");
      } else if (this.pinataApiKey && this.pinataSecretKey) {
        headers["pinata_api_key"] = this.pinataApiKey;
        headers["pinata_secret_api_key"] = this.pinataSecretKey;
        this.logger.debug("Using API key/secret for Pinata authentication");
      } else {
        throw new BadRequestException(
          "Pinata authentication not configured. Please set PINATA_JWT_TOKEN or PINATA_API_KEY and PINATA_SECRET_KEY"
        );
      }

      this.logger.debug(
        `Uploading to Pinata - File: ${originalFileName}, Size: ${fileBuffer.length} bytes`
      );

      // Use axios for better FormData support in Node.js
      try {
        const response = await firstValueFrom(
          this.httpService.post(
            `${this.pinataApiUrl}/pinning/pinFileToIPFS`,
            formData,
            {
              headers: headers,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            }
          )
        );

        const result = response.data;
        const ipfsHash = result.IpfsHash;
        const ipfsUri = `ipfs://${ipfsHash}`;
        const gatewayUrl = `${this.pinataGateway}/ipfs/${ipfsHash}`;

        this.logger.log(`Image uploaded successfully to Pinata: ${ipfsHash}`);

        return {
          ipfsHash,
          ipfsUri,
          gatewayUrl,
          pinSize: result.PinSize || fileBuffer.length,
          timestamp: result.Timestamp || new Date().toISOString(),
        };
      } catch (axiosError: any) {
        // Handle axios errors
        if (axiosError.response) {
          const errorText = axiosError.response.data;
          let errorMessage = `Pinata upload failed: ${axiosError.response.statusText}`;

          try {
            const errorJson =
              typeof errorText === "string" ? JSON.parse(errorText) : errorText;
            errorMessage =
              errorJson.error?.details ||
              errorJson.error?.message ||
              errorJson.error ||
              errorText ||
              errorMessage;
          } catch (e) {
            // If error is not JSON, use the text as-is
            errorMessage =
              typeof errorText === "string"
                ? errorText
                : JSON.stringify(errorText) || errorMessage;
          }

          this.logger.error(
            `Pinata upload failed - Status: ${
              axiosError.response.status
            }, StatusText: ${
              axiosError.response.statusText
            }, Error: ${JSON.stringify(errorText)}`
          );
          throw new BadRequestException(errorMessage);
        } else if (axiosError.request) {
          this.logger.error(
            `Pinata upload failed - No response received: ${axiosError.message}`
          );
          throw new BadRequestException(
            `Failed to connect to Pinata: ${axiosError.message}`
          );
        } else {
          this.logger.error(`Pinata upload error: ${axiosError.message}`);
          throw new BadRequestException(
            `Failed to upload image to Pinata: ${axiosError.message}`
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error uploading image to Pinata: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to upload image to Pinata: ${error.message}`
      );
    }
  }

  /**
   * Upload an image from a file buffer (for use with multipart uploads)
   * @param fileBuffer - The file buffer
   * @param originalName - Original filename
   * @param mimetype - MIME type of the file
   * @param metadata - Optional metadata
   * @returns Pinata upload result
   */
  async uploadImageFromBuffer(
    fileBuffer: Buffer,
    originalName: string,
    mimetype: string,
    metadata?: Record<string, any>
  ): Promise<PinataUploadResult> {
    if (!this.isConfigured()) {
      this.logger.error(
        "Pinata is not configured. Please set PINATA_JWT_TOKEN or PINATA_API_KEY and PINATA_SECRET_KEY in .env"
      );
      throw new BadRequestException(
        "Pinata is not configured. Please check your environment variables."
      );
    }

    // Validate MIME type
    if (!this.allowedMimeTypes.includes(mimetype)) {
      throw new BadRequestException(
        `File type ${mimetype} is not allowed. Allowed types: ${this.allowedMimeTypes.join(
          ", "
        )}`
      );
    }

    // Validate file size
    if (fileBuffer.length > this.maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${
          this.maxFileSize / (1024 * 1024)
        }MB`
      );
    }

    try {
      const formData = new FormData();
      formData.append("file", fileBuffer, {
        filename: originalName,
        contentType: mimetype,
      });

      // Add metadata if provided
      if (metadata && Object.keys(metadata).length > 0) {
        formData.append(
          "pinataMetadata",
          JSON.stringify({
            name: originalName,
            keyvalues: metadata,
          })
        );
      }

      // Add pinata options (optional but recommended)
      formData.append(
        "pinataOptions",
        JSON.stringify({
          cidVersion: 0,
        })
      );

      // Build headers - start with FormData headers
      const headers: Record<string, string> = {
        ...formData.getHeaders(),
      };

      // Use JWT token if available, otherwise use API key/secret
      if (this.pinataJwt) {
        headers["Authorization"] = `Bearer ${this.pinataJwt}`;
        this.logger.debug("Using JWT token for Pinata authentication");
      } else if (this.pinataApiKey && this.pinataSecretKey) {
        headers["pinata_api_key"] = this.pinataApiKey;
        headers["pinata_secret_api_key"] = this.pinataSecretKey;
        this.logger.debug("Using API key/secret for Pinata authentication");
      } else {
        throw new BadRequestException(
          "Pinata authentication not configured. Please set PINATA_JWT_TOKEN or PINATA_API_KEY and PINATA_SECRET_KEY"
        );
      }

      this.logger.debug(
        `Uploading to Pinata - File: ${originalName}, Size: ${fileBuffer.length} bytes, MIME: ${mimetype}`
      );

      // Use axios for better FormData support in Node.js
      try {
        const response = await firstValueFrom(
          this.httpService.post(
            `${this.pinataApiUrl}/pinning/pinFileToIPFS`,
            formData,
            {
              headers: headers,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            }
          )
        );

        const result = response.data;
        const ipfsHash = result.IpfsHash;
        const ipfsUri = `ipfs://${ipfsHash}`;
        const gatewayUrl = `${this.pinataGateway}/ipfs/${ipfsHash}`;

        this.logger.log(`Image uploaded successfully to Pinata: ${ipfsHash}`);

        return {
          ipfsHash,
          ipfsUri,
          gatewayUrl,
          pinSize: result.PinSize || fileBuffer.length,
          timestamp: result.Timestamp || new Date().toISOString(),
        };
      } catch (axiosError: any) {
        // Handle axios errors
        if (axiosError.response) {
          const errorText = axiosError.response.data;
          let errorMessage = `Pinata upload failed: ${axiosError.response.statusText}`;

          try {
            const errorJson =
              typeof errorText === "string" ? JSON.parse(errorText) : errorText;
            errorMessage =
              errorJson.error?.details ||
              errorJson.error?.message ||
              errorJson.error ||
              errorText ||
              errorMessage;
          } catch (e) {
            // If error is not JSON, use the text as-is
            errorMessage =
              typeof errorText === "string"
                ? errorText
                : JSON.stringify(errorText) || errorMessage;
          }

          this.logger.error(
            `Pinata upload failed - Status: ${
              axiosError.response.status
            }, StatusText: ${
              axiosError.response.statusText
            }, Error: ${JSON.stringify(errorText)}`
          );
          throw new BadRequestException(errorMessage);
        } else if (axiosError.request) {
          this.logger.error(
            `Pinata upload failed - No response received: ${axiosError.message}`
          );
          throw new BadRequestException(
            `Failed to connect to Pinata: ${axiosError.message}`
          );
        } else {
          this.logger.error(`Pinata upload error: ${axiosError.message}`);
          throw new BadRequestException(
            `Failed to upload image to Pinata: ${axiosError.message}`
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error uploading image to Pinata: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to upload image to Pinata: ${error.message}`
      );
    }
  }

  /**
   * Validate file content by checking magic bytes (file signatures)
   * This provides additional security beyond file extension validation
   * @param buffer - File buffer to validate
   * @param expectedMimeType - Expected MIME type based on extension
   * @returns true if file content matches expected type
   */
  private validateFileContent(
    buffer: Buffer,
    expectedMimeType: string
  ): boolean {
    if (buffer.length < 4) return false;

    // Magic bytes for common image formats
    type Signature =
      | number[]
      | { riff: number[]; webp: number[]; offset: number };
    const magicBytes: Record<string, Signature[]> = {
      "image/png": [
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
      ],
      "image/jpeg": [
        [0xff, 0xd8, 0xff], // JPEG
      ],
      "image/gif": [
        [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
        [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
      ],
      "image/webp": [
        // WebP: RIFF....WEBP
        // Check for RIFF at start and WEBP at offset 8
        {
          riff: [0x52, 0x49, 0x46, 0x46], // RIFF
          webp: [0x57, 0x45, 0x42, 0x50], // WEBP
          offset: 8,
        },
      ],
      "image/svg+xml": [
        [0x3c, 0x3f, 0x78, 0x6d, 0x6c], // <?xml
        [0x3c, 0x73, 0x76, 0x67], // <svg
      ],
    };

    const signatures = magicBytes[expectedMimeType];
    if (!signatures) {
      // If we don't have a signature for this type, allow it (fallback to extension check)
      this.logger.warn(
        `No magic byte validation for ${expectedMimeType}, relying on extension check only`
      );
      return true;
    }

    // Check if buffer matches any of the expected signatures
    return signatures.some((signature) => {
      // Handle WebP special case (RIFF + WEBP at offset 8)
      if (
        typeof signature === "object" &&
        !Array.isArray(signature) &&
        "riff" in signature &&
        "webp" in signature
      ) {
        const webpSig = signature as {
          riff: number[];
          webp: number[];
          offset: number;
        };
        if (buffer.length < webpSig.offset + webpSig.webp.length) return false;
        const hasRiff = webpSig.riff.every(
          (byte, index) => buffer[index] === byte
        );
        const hasWebp = webpSig.webp.every(
          (byte, index) => buffer[webpSig.offset + index] === byte
        );
        return hasRiff && hasWebp;
      }
      // Handle standard magic bytes
      if (Array.isArray(signature)) {
        if (buffer.length < signature.length) return false;
        return signature.every((byte, index) => buffer[index] === byte);
      }
      return false;
    });
  }

  /**
   * Upload JSON metadata to Pinata IPFS
   * @param metadata - The metadata object to upload
   * @param fileName - Optional filename for the metadata
   * @param pinataMetadata - Optional Pinata metadata keyvalues
   * @returns Pinata upload result with IPFS hash and URLs
   */
  async uploadMetadata(
    metadata: Record<string, any>,
    fileName?: string,
    pinataMetadata?: Record<string, any>
  ): Promise<PinataUploadResult> {
    if (!this.isConfigured()) {
      throw new BadRequestException("Pinata is not configured");
    }

    // Validate metadata is an object
    if (!metadata || typeof metadata !== "object") {
      throw new BadRequestException("Metadata must be a valid object");
    }

    try {
      // Prepare Pinata upload data
      const pinataData: any = {
        pinataContent: metadata,
        pinataOptions: {
          cidVersion: 0,
        },
      };

      // Add Pinata metadata if provided
      if (fileName || pinataMetadata) {
        pinataData.pinataMetadata = {
          name: fileName || `metadata-${Date.now()}.json`,
          ...(pinataMetadata && { keyvalues: pinataMetadata }),
        };
      }

      // Build headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Use JWT token if available, otherwise use API key/secret
      if (this.pinataJwt) {
        headers["Authorization"] = `Bearer ${this.pinataJwt}`;
        this.logger.debug("Using JWT token for Pinata authentication");
      } else if (this.pinataApiKey && this.pinataSecretKey) {
        headers["pinata_api_key"] = this.pinataApiKey;
        headers["pinata_secret_api_key"] = this.pinataSecretKey;
        this.logger.debug("Using API key/secret for Pinata authentication");
      } else {
        throw new BadRequestException(
          "Pinata authentication not configured. Please set PINATA_JWT_TOKEN or PINATA_API_KEY and PINATA_SECRET_KEY"
        );
      }

      this.logger.debug(
        `Uploading metadata to Pinata - File: ${fileName || "metadata.json"}`
      );

      // Upload to Pinata using axios
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.pinataApiUrl}/pinning/pinJSONToIPFS`,
          pinataData,
          {
            headers: headers,
          }
        )
      );

      const result = response.data;
      const ipfsHash = result.IpfsHash;
      const ipfsUri = `ipfs://${ipfsHash}`;
      const gatewayUrl = `${this.pinataGateway}/ipfs/${ipfsHash}`;

      this.logger.log(`Metadata uploaded successfully to Pinata: ${ipfsHash}`);

      return {
        ipfsHash,
        ipfsUri,
        gatewayUrl,
        pinSize: result.PinSize || JSON.stringify(metadata).length,
        timestamp: result.Timestamp || new Date().toISOString(),
      };
    } catch (axiosError: any) {
      // Handle axios errors
      if (axiosError.response) {
        const errorText = axiosError.response.data;
        let errorMessage = `Pinata metadata upload failed: ${axiosError.response.statusText}`;

        try {
          const errorJson =
            typeof errorText === "string" ? JSON.parse(errorText) : errorText;
          errorMessage =
            errorJson.error?.details ||
            errorJson.error?.message ||
            errorJson.error ||
            errorText ||
            errorMessage;
        } catch (e) {
          // If error is not JSON, use the text as-is
          errorMessage =
            typeof errorText === "string"
              ? errorText
              : JSON.stringify(errorText) || errorMessage;
        }

        this.logger.error(
          `Pinata metadata upload failed - Status: ${
            axiosError.response.status
          }, StatusText: ${
            axiosError.response.statusText
          }, Error: ${JSON.stringify(errorText)}`
        );
        throw new BadRequestException(errorMessage);
      } else if (axiosError.request) {
        this.logger.error(
          `Pinata metadata upload failed - No response received: ${axiosError.message}`
        );
        throw new BadRequestException(
          `Failed to connect to Pinata: ${axiosError.message}`
        );
      } else {
        this.logger.error(
          `Pinata metadata upload error: ${axiosError.message}`
        );
        throw new BadRequestException(
          `Failed to upload metadata to Pinata: ${axiosError.message}`
        );
      }
    }
  }

  /**
   * Upload vault metadata with two-step process (if vaultMintAddress provided)
   * @param vaultName - Vault name
   * @param vaultSymbol - Vault symbol
   * @param logoUrl - Logo gateway URL
   * @param managementFees - Management fees in basis points
   * @param underlyingAssets - Array of underlying assets
   * @param vaultMintAddress - Optional vault mint address
   * @returns Pinata upload result with IPFS hash and gateway URL
   */
  async uploadVaultMetadata(
    vaultName: string,
    vaultSymbol: string,
    logoUrl: string,
    managementFees: number,
    underlyingAssets: Array<{ mintAddress: string; mintBps: number }>,
    vaultMintAddress?: string
  ): Promise<{ ipfsHash: string; gatewayUrl: string }> {
    // Sanitize vault name for filename
    const sanitizedVaultName = vaultName
      .replace(/[^a-zA-Z0-9]/g, "_")
      .substring(0, 50);

    // Create metadata structure
    const metadata: Record<string, any> = {
      name: vaultName,
      symbol: vaultSymbol,
      description: `A DeFi vault token representing shares in ${vaultName}. Management fee: ${
        managementFees / 100
      }%`,
      image: logoUrl, // Already a gateway URL from frontend
      attributes: [
        {
          trait_type: "Management Fee",
          value: `${managementFees / 100}%`,
        },
        {
          trait_type: "Underlying Assets",
          value: underlyingAssets.length.toString(),
        },
      ],
      properties: {
        category: "DeFi Vault",
        vault_type: "Multi-Asset",
      },
    };

    // If vaultMintAddress is provided, add additionalMetadata with empty URI
    if (vaultMintAddress) {
      metadata.additionalMetadata = [
        {
          mint: vaultMintAddress,
          name: vaultName,
          symbol: vaultSymbol,
          updateAuthority: null,
          uri: "", // Will be set after first upload
        },
      ];
    }

    // First upload to Pinata
    const fileName = `${sanitizedVaultName}_${vaultSymbol}_metadata.json`;
    const pinataMetadata = {
      vaultName: vaultName,
      vaultSymbol: vaultSymbol,
      type: "vault_metadata",
    };

    this.logger.debug(`Uploading initial metadata for vault: ${vaultName}`);

    const firstUpload = await this.uploadMetadata(
      metadata,
      fileName,
      pinataMetadata
    );

    // If vaultMintAddress is provided, do second upload with complete metadata
    if (vaultMintAddress) {
      // Update metadata with complete additionalMetadata.uri
      const updatedMetadata = {
        ...metadata,
        additionalMetadata: [
          {
            mint: vaultMintAddress,
            name: vaultName,
            symbol: vaultSymbol,
            updateAuthority: null,
            uri: firstUpload.gatewayUrl, // Use gateway URL from first upload
          },
        ],
      };

      // Re-upload complete metadata
      const updatedFileName = `${sanitizedVaultName}_${vaultSymbol}_metadata_complete.json`;
      const updatedPinataMetadata = {
        vaultName: vaultName,
        vaultSymbol: vaultSymbol,
        mintAddress: vaultMintAddress,
        type: "vault_metadata_complete",
      };

      this.logger.debug(
        `Uploading complete metadata for vault: ${vaultName} with mint: ${vaultMintAddress}`
      );

      try {
        const secondUpload = await this.uploadMetadata(
          updatedMetadata,
          updatedFileName,
          updatedPinataMetadata
        );

        this.logger.log(
          `Complete metadata uploaded successfully: ${secondUpload.ipfsHash}`
        );

        // Return the final URL (from second upload)
        return {
          ipfsHash: secondUpload.ipfsHash,
          gatewayUrl: secondUpload.gatewayUrl,
        };
      } catch (error) {
        this.logger.error(
          `Failed to upload complete metadata: ${error.message}. First upload succeeded with hash: ${firstUpload.ipfsHash}`
        );
        throw new BadRequestException(
          `Failed to upload complete metadata. Initial metadata was uploaded but complete metadata upload failed: ${error.message}`
        );
      }
    }

    // If no vaultMintAddress, return first upload URL
    return {
      ipfsHash: firstUpload.ipfsHash,
      gatewayUrl: firstUpload.gatewayUrl,
    };
  }

  /**
   * Ensure URL has https:// protocol
   * @param url - URL that may or may not have protocol
   * @returns URL with https:// protocol
   */
  private ensureHttpsProtocol(url: string): string {
    if (!url) return "https://gateway.pinata.cloud";
    // Remove any existing protocol
    const cleanedUrl = url.replace(/^https?:\/\//, "");
    // Add https:// protocol
    return `https://${cleanedUrl}`;
  }

  /**
   * Convert IPFS URI to gateway URL
   * @param ipfsUri - IPFS URI (ipfs://...)
   * @returns Gateway URL with https:// protocol
   */
  convertIpfsToGatewayUrl(ipfsUri: string): string {
    if (ipfsUri.startsWith("ipfs://")) {
      const ipfsHash = ipfsUri.replace("ipfs://", "");
      return `${this.pinataGateway}/ipfs/${ipfsHash}`;
    }
    // If it's already a gateway URL or HTTP URL, ensure it has https://
    if (ipfsUri.startsWith("http://") || ipfsUri.startsWith("https://")) {
      return this.ensureHttpsProtocol(ipfsUri);
    }
    // If it's just a hash, assume it's an IPFS hash
    return `${this.pinataGateway}/ipfs/${ipfsUri}`;
  }

  /**
   * Check if Pinata is configured
   * @returns Boolean indicating if Pinata is configured
   */
  isConfigured(): boolean {
    return !!(this.pinataJwt || (this.pinataApiKey && this.pinataSecretKey));
  }

  /**
   * Get Pinata configuration info
   * @returns Configuration info
   */
  getConfigInfo(): {
    configured: boolean;
    hasJwt: boolean;
    hasApiKey: boolean;
    gateway: string;
  } {
    return {
      configured: this.isConfigured(),
      hasJwt: !!this.pinataJwt,
      hasApiKey: !!(this.pinataApiKey && this.pinataSecretKey),
      gateway: this.pinataGateway,
    };
  }

  /**
   * Get content type from filename
   * @param fileName - Filename
   * @returns MIME type
   */
  private getContentType(fileName: string): string {
    const ext = fileName.toLowerCase().split(".").pop();
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    return mimeTypes[ext || ""] || "image/png";
  }
}
