import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '../config/config.service';
import { firstValueFrom } from 'rxjs';

export interface TokenMapping {
  mintAddress: string;
  coinGeckoId: string;
  symbol: string;
  name: string;
  isVerified: boolean;
  lastUpdated: Date;
}

@Injectable()
export class TokenMappingService {
  private readonly logger = new Logger(TokenMappingService.name);
  private readonly mappingCache = new Map<string, TokenMapping>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    // Note: In production, you'd inject a TokenMapping model here
    // @InjectModel('TokenMapping') private tokenMappingModel: Model<TokenMapping>
  ) {}

  /**
   * Get CoinGecko ID for a Solana mint address with dynamic lookup
   * @param mintAddress - The Solana mint address
   * @returns CoinGecko ID or null if not found
   */
  async getCoinGeckoIdForMint(mintAddress: string): Promise<string | null> {
    try {
      // Check cache first
      if (this.mappingCache.has(mintAddress)) {
        const cached = this.mappingCache.get(mintAddress)!;
        this.logger.debug(`Using cached mapping for ${mintAddress}: ${cached.coinGeckoId}`);
        return cached.coinGeckoId;
      }

      // Try multiple lookup strategies
      const coinGeckoId = await this.lookupCoinGeckoId(mintAddress);
      
      if (coinGeckoId) {
        // Cache the result
        this.mappingCache.set(mintAddress, {
          mintAddress,
          coinGeckoId,
          symbol: '', // Would be populated from API response
          name: '',
          isVerified: true,
          lastUpdated: new Date()
        });
        
        this.logger.log(`Found CoinGecko mapping for ${mintAddress}: ${coinGeckoId}`);
        return coinGeckoId;
      }

      this.logger.warn(`No CoinGecko mapping found for ${mintAddress}`);
      return null;
    } catch (error) {
      this.logger.error(`Error looking up CoinGecko ID for ${mintAddress}:`, error);
      return null;
    }
  }

  /**
   * Lookup CoinGecko ID using multiple strategies
   */
  private async lookupCoinGeckoId(mintAddress: string): Promise<string | null> {
    // Strategy 1: Try CoinGecko's token search API
    const searchResult = await this.searchCoinGeckoByContract(mintAddress);
    if (searchResult) {
      return searchResult;
    }

    // Strategy 2: Try known Solana token mappings
    const knownMapping = this.getKnownSolanaMapping(mintAddress);
    if (knownMapping) {
      return knownMapping;
    }

    // Strategy 3: Try external token mapping services
    const externalMapping = await this.lookupExternalMappingService(mintAddress);
    if (externalMapping) {
      return externalMapping;
    }

    return null;
  }

  /**
   * Search CoinGecko API for token by contract address
   */
  private async searchCoinGeckoByContract(mintAddress: string): Promise<string | null> {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/solana/contract/${mintAddress}`;
      const response = await firstValueFrom(this.httpService.get(url));
      
      if (response.data?.id) {
        return response.data.id;
      }
      
      return null;
    } catch (error) {
      this.logger.debug(`CoinGecko contract search failed for ${mintAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get known Solana token mappings (fallback for common tokens)
   */
  private getKnownSolanaMapping(mintAddress: string): string | null {
    const knownMappings: Record<string, string> = {
      'So11111111111111111111111111111111111111112': 'solana', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether', // USDT
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'marinade-staked-sol', // mSOL
      '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': 'ethereum', // ETH (Wormhole)
      'A9mUU4qviSctJVPJdBJWkb28deg915LYJKrzQ19ji3FM': 'usd-coin', // USDC (Wormhole)
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'bonk', // BONK
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'jupiter-exchange-solana', // JUP
      '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm': 'raydium', // RAY
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM': 'bonfida', // FIDA
    };

    return knownMappings[mintAddress] || null;
  }

  /**
   * Lookup using external token mapping services
   */
  private async lookupExternalMappingService(mintAddress: string): Promise<string | null> {
    try {
      // Example: Moralis API for token metadata
      const moralisApiKey = this.configService.get('MORALIS_API_KEY');
      if (!moralisApiKey) {
        return null;
      }

      const url = `https://solana-gateway.moralis.io/token/mainnet/${mintAddress}/metadata`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'X-API-Key': moralisApiKey
          }
        })
      );

      if (response.data?.symbol) {
        // Use symbol to search CoinGecko
        return await this.searchCoinGeckoBySymbol(response.data.symbol);
      }

      return null;
    } catch (error) {
      this.logger.debug(`External mapping service failed for ${mintAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Search CoinGecko by symbol
   */
  private async searchCoinGeckoBySymbol(symbol: string): Promise<string | null> {
    try {
      const url = `https://api.coingecko.com/api/v3/search?query=${symbol}`;
      const response = await firstValueFrom(this.httpService.get(url));
      
      if (response.data?.coins && response.data.coins.length > 0) {
        // Return the first match (you might want to add more sophisticated matching)
        return response.data.coins[0].id;
      }
      
      return null;
    } catch (error) {
      this.logger.debug(`CoinGecko symbol search failed for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Add a new token mapping (for manual additions)
   */
  async addTokenMapping(mintAddress: string, coinGeckoId: string, symbol: string, name: string): Promise<void> {
    const mapping: TokenMapping = {
      mintAddress,
      coinGeckoId,
      symbol,
      name,
      isVerified: true,
      lastUpdated: new Date()
    };

    this.mappingCache.set(mintAddress, mapping);
    
    // In production, you'd save to database here
    // await this.tokenMappingModel.create(mapping);
    
    this.logger.log(`Added token mapping: ${mintAddress} -> ${coinGeckoId}`);
  }

  /**
   * Get all cached mappings (for debugging)
   */
  getAllCachedMappings(): TokenMapping[] {
    return Array.from(this.mappingCache.values());
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  clearCache(): void {
    this.mappingCache.clear();
    this.logger.log('Token mapping cache cleared');
  }
}
