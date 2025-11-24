import {
  Controller,
  Post,
  Get,
  Req,
  Body,
  BadRequestException,
  Logger,
  UseGuards,
  Query,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { FastifyRequest } from "fastify";
import { PinataService, PinataUploadResult } from "./pinata.service";
import { AdminGuard } from "../../middlewares";
import { UploadMetadataDto } from "./dto/upload-metadata.dto";

// Extend FastifyRequest to include multipart methods
interface MultipartRequest extends FastifyRequest {
  file(): Promise<any>;
  files(): AsyncIterableIterator<any>;
}

@ApiTags("Pinata")
@ApiBearerAuth()
@Controller("api/v1/pinata")
export class PinataController {
  private readonly logger = new Logger(PinataController.name);

  constructor(private readonly pinataService: PinataService) {}

  @Post("upload-image")
  @ApiOperation({ summary: "Upload an image to Pinata IPFS" })
  @ApiConsumes("multipart/form-data")
  @ApiResponse({
    status: 200,
    description: "Image uploaded successfully",
    type: Object,
  })
  @ApiResponse({ status: 400, description: "Bad request" })
  async uploadImage(
    @Req() request: MultipartRequest,
    @Query("metadata") metadata?: string
  ): Promise<PinataUploadResult> {
    try {
      const data = await request.file();

      if (!data) {
        throw new BadRequestException("No file provided");
      }

      // Convert Fastify multipart file to buffer (matching S3-bucket pattern)
      const buffer = await data.toBuffer();

      // Parse metadata if provided
      let parsedMetadata: Record<string, any> | undefined;
      if (metadata) {
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch (error) {
          this.logger.warn(
            `Failed to parse metadata query parameter: ${error.message}`
          );
        }
      }

      // Call service with buffer, filename, and mimetype (matching S3-bucket pattern)
      const result = await this.pinataService.uploadImageFromBuffer(
        buffer,
        data.filename,
        data.mimetype,
        parsedMetadata
      );

      return result;
    } catch (error) {
      this.logger.error(`Error uploading image: ${error.message}`);
      throw error;
    }
  }

  @Post("upload-metadata")
  @ApiOperation({ summary: "Upload vault metadata to Pinata IPFS" })
  @ApiBody({ type: UploadMetadataDto })
  @ApiResponse({
    status: 200,
    description: "Metadata uploaded successfully",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "success" },
        data: {
          type: "object",
          properties: {
            ipfsHash: {
              type: "string",
              example: "QmNwgKCQD3jYg8Z7qt9RAhNtWS9v14cLZUmcujPVuR2Ty8",
            },
            gatewayUrl: {
              type: "string",
              example:
                "https://red-late-constrictor-193.mypinata.cloud/ipfs/QmNwgKCQD3jYg8Z7qt9RAhNtWS9v14cLZUmcujPVuR2Ty8",
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Bad request" })
  async uploadMetadata(@Body() body: UploadMetadataDto): Promise<{
    status: string;
    data: { ipfsHash: string; gatewayUrl: string };
  }> {
    try {
      // Validate required fields
      if (!body.vaultName || !body.vaultSymbol || !body.logoUrl) {
        throw new BadRequestException(
          "vaultName, vaultSymbol, and logoUrl are required"
        );
      }

      if (!body.underlyingAssets || body.underlyingAssets.length === 0) {
        throw new BadRequestException(
          "underlyingAssets array is required and cannot be empty"
        );
      }

      // Call service method to upload vault metadata
      const result = await this.pinataService.uploadVaultMetadata(
        body.vaultName,
        body.vaultSymbol,
        body.logoUrl,
        body.managementFees,
        body.underlyingAssets,
        body.vaultMintAddress
      );

      // Return response in the specified format
      return {
        status: "success",
        data: {
          ipfsHash: result.ipfsHash,
          gatewayUrl: result.gatewayUrl,
        },
      };
    } catch (error) {
      this.logger.error(`Error uploading metadata: ${error.message}`);
      throw error;
    }
  }

  @Get("config")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Get Pinata configuration info" })
  @ApiResponse({
    status: 200,
    description: "Configuration info retrieved successfully",
  })
  async getConfigInfo(): Promise<{
    configured: boolean;
    hasJwt: boolean;
    hasApiKey: boolean;
    gateway: string;
  }> {
    try {
      return this.pinataService.getConfigInfo();
    } catch (error) {
      this.logger.error(`Error getting config info: ${error.message}`);
      throw error;
    }
  }

  @Post("convert-ipfs-url")
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: "Convert IPFS URI to gateway URL" })
  @ApiQuery({
    name: "ipfsUri",
    required: true,
    description: "IPFS URI (ipfs://...) or IPFS hash",
  })
  @ApiResponse({
    status: 200,
    description: "URL converted successfully",
  })
  async convertIpfsUrl(
    @Query("ipfsUri") ipfsUri: string
  ): Promise<{ gatewayUrl: string }> {
    try {
      if (!ipfsUri) {
        throw new BadRequestException("ipfsUri query parameter is required");
      }

      const gatewayUrl = this.pinataService.convertIpfsToGatewayUrl(ipfsUri);
      return { gatewayUrl };
    } catch (error) {
      this.logger.error(`Error converting IPFS URL: ${error.message}`);
      throw error;
    }
  }
}
