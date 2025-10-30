import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { JupiterToken } from './interfaces/jupiter-token.interface';
import { AssetAllocationService } from '../asset-allocation/asset-allocation.service';
import { AssetType, NetworkType, SourceType } from '../asset-allocation/entities/asset-allocation.entity';
import { CreateLstAssetDto, CreateLstAssetBatchDto } from './dto/create-lst-asset.dto';

@Injectable()
export class SolanaTokenService {
  private readonly logger = new Logger(SolanaTokenService.name);
  private readonly JUPITER_API_BASE_URL = 'https://lite-api.jup.ag';

  constructor(
    private readonly httpService: HttpService, 
    private readonly assetAllocationService: AssetAllocationService
  ) {}

  /**
   * Fetch verified tokens from Jupiter API
   * @param network - Network type (mainnet or devnet)
   * @returns Promise<JupiterToken[]> Array of verified tokens
   */
  async getVerifiedTokens(network: NetworkType = NetworkType.MAINNET): Promise<JupiterToken[]> {
    try {
      this.logger.log(`Fetching verified tokens from Jupiter API for network: ${network}...`);
      
      const response = await firstValueFrom(
        this.httpService.get(`${this.JUPITER_API_BASE_URL}/tokens/v2/tag?query=verified&network=${network}`)
      );
      if (!response.data || !Array.isArray(response.data)) {
        throw new HttpException(
          'Invalid response format from Jupiter API',
          HttpStatus.BAD_GATEWAY
        );
      }

      this.logger.log(`Successfully fetched ${response.data.length} verified tokens`);
      
      // Map the response to only include the required fields
      const simplifiedTokens: JupiterToken[] = response.data.map((token: any) => ({
        id: token.id,
        name: token.name,
        symbol: token.symbol,
        icon: token.icon
      }));

      this.logger.log(`Processing ${simplifiedTokens.length} tokens for asset allocation creation...`);
      
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Process tokens one by one with proper error handling
      for (let i = 0; i < simplifiedTokens.length; i++) {
        const token = simplifiedTokens[i];
        
        try {
          // Check if token already exists in this network to avoid unnecessary creation attempts
          try {
            await this.assetAllocationService.findByMintAddressAndNetwork(token.id, network);
            // If we reach here, token already exists in this network
            this.logger.debug(`Token ${token.symbol} (${token.id}) already exists in ${network} network, skipping...`);
            continue;
          } catch (notFoundError) {
            // Token doesn't exist in this network, proceed with creation
          }
          
          // Get decimals from the original token data if available
          const originalToken = response.data[i];
          const decimals = originalToken.decimals || 9; // Default to 9 if not available
          
          await this.assetAllocationService.create({
            mintAddress: token.id,
            name: token.name,
            symbol: token.symbol,
            logoUrl: token.icon,
            type: AssetType.CRYPTO,
            decimals: decimals,
            active: true,
            network: network,
            source: SourceType.JUPITER
          });
          
          successCount++;
          
          // Log progress every 100 records
          if (successCount % 100 === 0) {
            this.logger.log(`Created ${successCount}/${simplifiedTokens.length} asset allocations...`);
          }
          
        } catch (error) {
          errorCount++;
          
          // Provide more specific error information
          let errorType = 'Unknown error';
          if (error.message?.includes('already exists')) {
            errorType = 'Duplicate mint address';
          } else if (error.message?.includes('validation')) {
            errorType = 'Validation error';
          } else if (error.message?.includes('network') || error.message?.includes('timeout')) {
            errorType = 'Network error';
          }
          
          const errorMsg = `Failed to create asset for ${token.symbol} (${token.id}): ${errorType} - ${error.message}`;
          errors.push(errorMsg);
          
          // Log individual errors but continue processing
          this.logger.warn(errorMsg);
          
          // Don't overwhelm the logs - only log every 50 errors
          if (errorCount % 50 === 0) {
            this.logger.warn(`Encountered ${errorCount} errors so far...`);
          }
        }
        
        // Small delay to prevent overwhelming the database
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      this.logger.log(`Asset allocation creation completed:`);
      this.logger.log(`- Successfully created: ${successCount}`);
      this.logger.log(`- Failed: ${errorCount}`);
      
      if (errors.length > 0) {
        // Categorize errors for better analysis
        const duplicateErrors = errors.filter(e => e.includes('Duplicate mint address')).length;
        const validationErrors = errors.filter(e => e.includes('Validation error')).length;
        const networkErrors = errors.filter(e => e.includes('Network error')).length;
        const unknownErrors = errors.length - duplicateErrors - validationErrors - networkErrors;
        
        this.logger.warn(`Error breakdown:`);
        this.logger.warn(`- Duplicate mint addresses: ${duplicateErrors}`);
        this.logger.warn(`- Validation errors: ${validationErrors}`);
        this.logger.warn(`- Network errors: ${networkErrors}`);
        this.logger.warn(`- Unknown errors: ${unknownErrors}`);
        
        this.logger.warn(`First 10 errors: ${errors.slice(0, 10).join('; ')}`);
      }
      
      return simplifiedTokens;

    } catch (error) {
      this.logger.error('Error fetching verified tokens:', error.message);
      
      if (error instanceof HttpException) {
        throw error;
      }

      // Handle different types of errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new HttpException(
          'Unable to connect to Jupiter API',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }

      if (error.response?.status) {
        throw new HttpException(
          `Jupiter API returned error: ${error.response.status}`,
          HttpStatus.BAD_GATEWAY
        );
      }

      throw new HttpException(
        'Failed to fetch verified tokens',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Fetch LST tokens from Jupiter API
   * @param network - Network type (mainnet or devnet)
   * @returns Promise<JupiterToken[]> Array of LST tokens
   */
  async getLstTokens(network: NetworkType = NetworkType.MAINNET): Promise<JupiterToken[]> {
    try {
      this.logger.log(`Fetching LST tokens from Jupiter API for network: ${network}...`);
      
      const response = await firstValueFrom(
        this.httpService.get(`${this.JUPITER_API_BASE_URL}/tokens/v2/tag?query=lst&network=${network}`)
      );
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new HttpException(
          'Invalid response format from Jupiter API',
          HttpStatus.BAD_GATEWAY
        );
      }

      this.logger.log(`Successfully fetched ${response.data.length} LST tokens`);
      
      // Map the response to only include the required fields
      const simplifiedTokens: JupiterToken[] = response.data.map((token: any) => ({
        id: token.id,
        name: token.name,
        symbol: token.symbol,
        icon: token.icon
      }));

      return simplifiedTokens;

    } catch (error) {
      this.logger.error('Error fetching LST tokens:', error.message);
      
      if (error instanceof HttpException) {
        throw error;
      }

      // Handle different types of errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new HttpException(
          'Unable to connect to Jupiter API',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }

      if (error.response?.status) {
        throw new HttpException(
          `Jupiter API returned error: ${error.response.status}`,
          HttpStatus.BAD_GATEWAY
        );
      }

      throw new HttpException(
        'Failed to fetch LST tokens',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Create or update a single LST token in asset allocation
   * @param createLstAssetDto - LST token data
   * @returns Created or updated asset allocation
   */
  async createLstAsset(createLstAssetDto: CreateLstAssetDto) {
    try {
      this.logger.log(`Processing LST asset: ${createLstAssetDto.symbol} (${createLstAssetDto.mintAddress})`);
      
      // Check if asset already exists in the same network
      const network = createLstAssetDto.network || NetworkType.MAINNET;
      try {
        const existingAsset = await this.assetAllocationService.findByMintAddressAndNetwork(createLstAssetDto.mintAddress, network);
        
        // If asset exists in this network, update its type to LSTS
        if (existingAsset) {
          this.logger.log(`Asset ${createLstAssetDto.symbol} already exists in ${network} network, updating type to LSTS`);
          
          const updatedAsset = await this.assetAllocationService.update(existingAsset._id.toString(), {
            type: AssetType.LSTS,
            // Optionally update other fields if they're different
            name: createLstAssetDto.name,
            symbol: createLstAssetDto.symbol,
            decimals: createLstAssetDto.decimals,
            logoUrl: createLstAssetDto.logoUrl,
            active: createLstAssetDto.active ?? true,
            network: network,
            source: SourceType.JUPITER
          });

          this.logger.log(`Successfully updated LST asset: ${createLstAssetDto.symbol}`);
          return updatedAsset;
        }
      } catch (notFoundError) {
        // Asset doesn't exist in this network, proceed with creation
        this.logger.log(`Asset ${createLstAssetDto.symbol} not found in ${network} network, creating new one`);
      }
      
      // Create new asset
      const assetAllocation = await this.assetAllocationService.create({
        mintAddress: createLstAssetDto.mintAddress,
        name: createLstAssetDto.name,
        symbol: createLstAssetDto.symbol,
        type: AssetType.LSTS,
        decimals: createLstAssetDto.decimals,
        logoUrl: createLstAssetDto.logoUrl,
        active: createLstAssetDto.active ?? true,
        network: createLstAssetDto.network || NetworkType.MAINNET,
        source: SourceType.JUPITER
      });

      this.logger.log(`Successfully created LST asset: ${createLstAssetDto.symbol}`);
      return assetAllocation;

    } catch (error) {
      this.logger.error(`Failed to process LST asset ${createLstAssetDto.symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Create or update multiple LST tokens in asset allocation
   * @param createLstAssetBatchDto - Batch LST token data
   * @returns Creation/update results
   */
  async createLstAssetBatch(createLstAssetBatchDto: CreateLstAssetBatchDto) {
    try {
      this.logger.log(`Processing ${createLstAssetBatchDto.lstTokens.length} LST assets...`);
      
      let successCount = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const results: any[] = [];

      // Process tokens one by one with proper error handling
      for (let i = 0; i < createLstAssetBatchDto.lstTokens.length; i++) {
        const token = createLstAssetBatchDto.lstTokens[i];
        
        try {
          // Check if this is a new creation or update
          const network = token.network || NetworkType.MAINNET;
          const wasExisting = await this.checkIfAssetExists(token.mintAddress, network);
          
          const result = await this.createLstAsset(token);
          results.push(result);
          successCount++;
          
          if (wasExisting) {
            updatedCount++;
          } else {
            createdCount++;
          }
          
          // Log progress every 10 records
          if (successCount % 10 === 0) {
            this.logger.log(`Processed ${successCount}/${createLstAssetBatchDto.lstTokens.length} LST assets...`);
          }
          
        } catch (error) {
          errorCount++;
          
          const errorMsg = `Failed to process LST asset ${token.symbol} (${token.mintAddress}): ${error.message}`;
          errors.push(errorMsg);
          
          // Log individual errors but continue processing
          this.logger.warn(errorMsg);
        }
        
        // Small delay to prevent overwhelming the database
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      this.logger.log(`LST asset batch processing completed:`);
      this.logger.log(`- Successfully processed: ${successCount}`);
      this.logger.log(`- Created new: ${createdCount}`);
      this.logger.log(`- Updated existing: ${updatedCount}`);
      this.logger.log(`- Failed: ${errorCount}`);
      
      return {
        successCount,
        createdCount,
        updatedCount,
        errorCount,
        results,
        errors: errors.slice(0, 10) // Return first 10 errors to avoid overwhelming response
      };

    } catch (error) {
      this.logger.error('Error in LST asset batch processing:', error.message);
      throw new HttpException(
        'Failed to process LST assets batch',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Helper method to check if an asset exists
   * @param mintAddress - Mint address to check
   * @param network - Network type to check
   * @returns boolean indicating if asset exists
   */
  private async checkIfAssetExists(mintAddress: string, network: string): Promise<boolean> {
    try {
      await this.assetAllocationService.findByMintAddressAndNetwork(mintAddress, network);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fetch and create LST tokens from Jupiter API
   * @param network - Network type (mainnet or devnet)
   * @returns Creation results
   */
  async fetchAndCreateLstTokens(network: NetworkType = NetworkType.MAINNET) {
    try {
      this.logger.log(`Fetching and creating LST tokens from Jupiter API for network: ${network}...`);
      
      const lstTokens = await this.getLstTokens(network);
      
      if (lstTokens.length === 0) {
        this.logger.warn('No LST tokens found from Jupiter API');
        return {
          successCount: 0,
          errorCount: 0,
          results: [],
          errors: []
        };
      }

      // Convert Jupiter tokens to CreateLstAssetDto format
      const lstAssetDtos: CreateLstAssetDto[] = lstTokens.map((token: any) => ({
        mintAddress: token.id,
        name: token.name,
        symbol: token.symbol,
        decimals: 9, // Default to 9 for LST tokens
        logoUrl: token.icon,
        active: true,
        network: network,
        source: SourceType.JUPITER
      }));

      // Create batch DTO
      const batchDto: CreateLstAssetBatchDto = {
        lstTokens: lstAssetDtos
      };

      return await this.createLstAssetBatch(batchDto);

    } catch (error) {
      this.logger.error('Error fetching and creating LST tokens:', error.message);
      throw error;
    }
  }
}
