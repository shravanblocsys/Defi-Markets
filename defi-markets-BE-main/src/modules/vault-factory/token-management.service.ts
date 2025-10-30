import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

export interface PaymentToken {
  mint: string;
  decimals: number;
  symbol: string;
  name: string;
  network?: string;
  isActive?: boolean;
}

@Injectable()
export class TokenManagementService {
  private readonly logger = new Logger(TokenManagementService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Resolve payment tokens for a specific network
   * This method provides a comprehensive list of payment tokens for vault operations
   * 
   * @param network - The blockchain network (e.g., 'mainnet-beta', 'devnet', 'testnet')
   * @returns Promise<PaymentToken[]> Array of available payment tokens
   */
  async resolvePaymentTokens(network: string): Promise<PaymentToken[]> {
    try {
      this.logger.log(`Resolving payment tokens for network: ${network}`);
      
      // Get network-specific tokens
      const networkTokens = this.getNetworkSpecificTokens(network);
      
      // Get common tokens that are available across networks
      const commonTokens = this.getCommonTokens();
      
      // Combine and deduplicate tokens
      const allTokens = this.mergeAndDeduplicateTokens([...networkTokens, ...commonTokens]);
      
      this.logger.log(`Resolved ${allTokens.length} payment tokens for network: ${network}`);
      return allTokens;
    } catch (error) {
      this.logger.error(`Error resolving payment tokens for network ${network}:`, error);
      // Fallback to default tokens
      return this.getDefaultPaymentTokens(network);
    }
  }

  /**
   * Get network-specific payment tokens
   * These tokens are only available on specific networks
   */
  private getNetworkSpecificTokens(network: string): PaymentToken[] {
    const networkTokens: { [key: string]: PaymentToken[] } = {
      'mainnet-beta': [
        {
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
          network: 'mainnet-beta',
          isActive: true,
        },
        {
          mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          decimals: 6,
          symbol: 'USDT',
          name: 'Tether USD',
          network: 'mainnet-beta',
          isActive: true,
        },
        {
          mint: 'So11111111111111111111111111111111111111112',
          decimals: 9,
          symbol: 'SOL',
          name: 'Wrapped SOL',
          network: 'mainnet-beta',
          isActive: true,
        },
        {
          mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
          decimals: 9,
          symbol: 'mSOL',
          name: 'Marinade Staked SOL',
          network: 'mainnet-beta',
          isActive: true,
        },
        {
          mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
          decimals: 5,
          symbol: 'BONK',
          name: 'Bonk',
          network: 'mainnet-beta',
          isActive: true,
        },
      ],
      'devnet': [
        {
          mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin (Devnet)',
          network: 'devnet',
          isActive: true,
        },
        {
          mint: 'So11111111111111111111111111111111111111112',
          decimals: 9,
          symbol: 'SOL',
          name: 'Wrapped SOL (Devnet)',
          network: 'devnet',
          isActive: true,
        },
      ],
      'testnet': [
        {
          mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin (Testnet)',
          network: 'testnet',
          isActive: true,
        },
        {
          mint: 'So11111111111111111111111111111111111111112',
          decimals: 9,
          symbol: 'SOL',
          name: 'Wrapped SOL (Testnet)',
          network: 'testnet',
          isActive: true,
        },
      ],
    };

    return networkTokens[network] || [];
  }

  /**
   * Get common tokens that are available across multiple networks
   * These are typically stablecoins and major tokens
   */
  private getCommonTokens(): PaymentToken[] {
    return [
      {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
        isActive: true,
      },
      {
        mint: 'So11111111111111111111111111111111111111112',
        decimals: 9,
        symbol: 'SOL',
        name: 'Wrapped SOL',
        isActive: true,
      },
    ];
  }

  /**
   * Get default payment tokens as fallback
   * This method is used when token resolution fails
   */
  getDefaultPaymentTokens(network?: string): PaymentToken[] {
    const defaultTokens: { [key: string]: PaymentToken[] } = {
      'mainnet-beta': [
        {
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
          network: 'mainnet-beta',
          isActive: true,
        },
        {
          mint: 'So11111111111111111111111111111111111111112',
          decimals: 9,
          symbol: 'SOL',
          name: 'Wrapped SOL',
          network: 'mainnet-beta',
          isActive: true,
        },
      ],
      'devnet': [
        {
          mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin (Devnet)',
          network: 'devnet',
          isActive: true,
        },
        {
          mint: 'So11111111111111111111111111111111111111112',
          decimals: 9,
          symbol: 'SOL',
          name: 'Wrapped SOL (Devnet)',
          network: 'devnet',
          isActive: true,
        },
      ],
      'testnet': [
        {
          mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin (Testnet)',
          network: 'testnet',
          isActive: true,
        },
        {
          mint: 'So11111111111111111111111111111111111111112',
          decimals: 9,
          symbol: 'SOL',
          name: 'Wrapped SOL (Testnet)',
          network: 'testnet',
          isActive: true,
        },
      ],
    };
    
    // Explicit network handling with clear fallback strategy
    if (!network) {
      this.logger.warn('No network specified, using mainnet-beta as default');
      return defaultTokens['mainnet-beta'] || [];
    }
    
    const tokens = defaultTokens[network];
    if (tokens) {
      this.logger.log(`Using default tokens for network: ${network}`);
      return tokens;
    }
    
    // Network not found in defaults - return empty array for clarity
    this.logger.warn(`No default tokens defined for network: ${network}, returning empty array`);
    return [];
  }

  /**
   * Merge and deduplicate tokens based on mint address
   * Network-specific tokens take precedence over common tokens
   */
  private mergeAndDeduplicateTokens(tokens: PaymentToken[]): PaymentToken[] {
    const tokenMap = new Map<string, PaymentToken>();
    
    // Process tokens in order, later tokens with same mint will override earlier ones
    tokens.forEach(token => {
      if (token.isActive !== false) { // Only include active tokens
        tokenMap.set(token.mint, token);
      }
    });
    
    return Array.from(tokenMap.values());
  }

  /**
   * Validate if a token is supported for vault operations
   * @param mint - The token mint address
   * @param network - The blockchain network
   * @returns Promise<boolean> Whether the token is supported
   */
  async isTokenSupported(mint: string, network: string): Promise<boolean> {
    try {
      const supportedTokens = await this.resolvePaymentTokens(network);
      return supportedTokens.some(token => token.mint === mint && token.isActive !== false);
    } catch (error) {
      this.logger.error(`Error checking token support for ${mint} on ${network}:`, error);
      return false;
    }
  }

  /**
   * Get token information by mint address
   * @param mint - The token mint address
   * @param network - The blockchain network
   * @returns Promise<PaymentToken | null> Token information or null if not found
   */
  async getTokenByMint(mint: string, network: string): Promise<PaymentToken | null> {
    try {
      const supportedTokens = await this.resolvePaymentTokens(network);
      return supportedTokens.find(token => token.mint === mint) || null;
    } catch (error) {
      this.logger.error(`Error getting token info for ${mint} on ${network}:`, error);
      return null;
    }
  }
}
