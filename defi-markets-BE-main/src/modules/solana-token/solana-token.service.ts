import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { JupiterToken } from './interfaces/jupiter-token.interface';
import { AssetAllocationService } from '../asset-allocation/asset-allocation.service';
import { AssetType, NetworkType, SourceType } from '../asset-allocation/entities/asset-allocation.entity';
import { CreateLstAssetDto, CreateLstAssetBatchDto } from './dto/create-lst-asset.dto';

@Injectable()
export class SolanaTokenService {
  private readonly logger = new Logger(SolanaTokenService.name);
  private readonly JUPITER_API_BASE_URL = 'https://lite-api.jup.ag';
  private connection: Connection;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly assetAllocationService: AssetAllocationService
  ) {}

  /**
   * Initialize Solana connection based on network
   * @param network - Network type (mainnet or devnet)
   */
  private initializeSolanaConnection(network: NetworkType): void {
    // Prefer Helius RPC URL if available (better rate limits), otherwise use SOLANA_RPC_URL or default
    const heliusRpcUrl = this.configService.get('HELIUS_RPC_URL');
    const solanaRpcUrl = this.configService.get('SOLANA_RPC_URL');
    
    let rpcUrl: string;
    if (heliusRpcUrl) {
      rpcUrl = heliusRpcUrl;
      this.logger.log(`Using Helius RPC URL: ${heliusRpcUrl}`);
    } else if (solanaRpcUrl) {
      rpcUrl = solanaRpcUrl;
      this.logger.log(`Using Solana RPC URL: ${solanaRpcUrl}`);
    } else {
      // Default RPC URLs based on network
      if (network === NetworkType.DEVNET) {
        rpcUrl = 'https://api.devnet.solana.com';
      } else {
        rpcUrl = 'https://api.mainnet-beta.solana.com';
      }
      this.logger.log(`Using default Solana RPC URL for ${network}: ${rpcUrl}`);
    }
    
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Check the token program type by examining the mint account's owner
   * @param mintAddress - The mint address to check
   * @param connection - Solana connection
   * @returns The program type: 'TOKEN_PROGRAM', 'TOKEN_2022_PROGRAM', or 'UNKNOWN'
   */
  private async checkTokenProgram(mintAddress: string, connection: Connection): Promise<string> {
    try {
      const mintPubkey = new PublicKey(mintAddress);
      const mintInfo = await connection.getAccountInfo(mintPubkey);
      
      if (!mintInfo) {
        return 'NOT_FOUND';
      }
      
      const owner = mintInfo.owner.toBase58();
      const tokenProgramId = TOKEN_PROGRAM_ID.toBase58();
      const token2022ProgramId = TOKEN_2022_PROGRAM_ID.toBase58();
      
      if (owner === tokenProgramId) {
        return 'TOKEN_PROGRAM';
      } else if (owner === token2022ProgramId) {
        return 'TOKEN_2022_PROGRAM';
      } else {
        return 'UNKNOWN';
      }
    } catch (error) {
      this.logger.warn(`Error checking token program for ${mintAddress}: ${error.message}`);
      return 'ERROR';
    }
  }

  /**
   * Fetch verified tokens from Jupiter API and check for old Token Program tokens
   * @param network - Network type (mainnet or devnet)
   * @returns Promise<JupiterToken[]> Array of verified tokens (old Token Program only)
   */
  async getVerifiedTokens(network: NetworkType = NetworkType.MAINNET): Promise<JupiterToken[]> {
    try {
      this.logger.log(`Fetching verified tokens from Jupiter API for network: ${network}...`);
      
      // Initialize Solana connection
      this.initializeSolanaConnection(network);
      
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

      this.logger.log(`Checking token program types for ${simplifiedTokens.length} tokens...`);
      
      const oldTokenProgramTokens: JupiterToken[] = [];
      let checkedCount = 0;
      let tokenProgramCount = 0;
      let token2022Count = 0;
      let unknownCount = 0;
      let errorCount = 0;

      // Process tokens one by one to check their program type
      for (let i = 0; i < simplifiedTokens.length; i++) {
        const token = simplifiedTokens[i];
        const originalToken = response.data[i];
        
        try {
          const programType = await this.checkTokenProgram(token.id, this.connection);
          checkedCount++;
          
          if (programType === 'TOKEN_PROGRAM') {
            tokenProgramCount++;
            oldTokenProgramTokens.push(token);
            
            // Console log the old Token Program token
            console.log(`[OLD TOKEN PROGRAM] ${token.symbol} (${token.id}) - ${token.name}`, {
              mintAddress: token.id,
              name: token.name,
              symbol: token.symbol,
              icon: token.icon,
              decimals: originalToken.decimals || 9,
              programType: 'TOKEN_PROGRAM'
            });
          } else if (programType === 'TOKEN_2022_PROGRAM') {
            token2022Count++;
          } else if (programType === 'UNKNOWN') {
            unknownCount++;
          } else if (programType === 'NOT_FOUND') {
            errorCount++;
            this.logger.warn(`Mint account not found for ${token.symbol} (${token.id})`);
          } else if (programType === 'ERROR') {
            errorCount++;
          }
          
          // Log progress every 100 records
          if (checkedCount % 100 === 0) {
            this.logger.log(`Checked ${checkedCount}/${simplifiedTokens.length} tokens...`);
          }
          
        } catch (error) {
          errorCount++;
          this.logger.warn(`Error processing token ${token.symbol} (${token.id}): ${error.message}`);
        }
        
        // Small delay to prevent overwhelming the RPC
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      this.logger.log(`Token program check completed:`);
      this.logger.log(`- Total checked: ${checkedCount}`);
      this.logger.log(`- Old Token Program (TOKEN_PROGRAM): ${tokenProgramCount}`);
      this.logger.log(`- Token 2022 Program: ${token2022Count}`);
      this.logger.log(`- Unknown program: ${unknownCount}`);
      this.logger.log(`- Errors/Not found: ${errorCount}`);
      this.logger.log(`- Old Token Program tokens logged to console: ${oldTokenProgramTokens.length}`);
      
      return oldTokenProgramTokens;

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
