interface BitqueryConfig {
  apiKey: string;
  baseUrl: string;
}

interface TokenPrice {
  address: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCap?: number;
  volume24h?: number;
}

interface HistoricalPrice {
  date: string;
  price: number;
  volume?: number;
}

interface PortfolioSnapshot {
  timestamp: string;
  totalValue: number;
  vaultValues: { [vaultId: string]: number };
}

class BitqueryService {
  private config: BitqueryConfig;

  constructor() {
    this.config = {
      apiKey: import.meta.env.VITE_BITQUERY_API_KEY || "",
      baseUrl: "https://graphql.bitquery.io",
    };
  }

  private async makeRequest(query: string, variables: any = {}) {
    const response = await fetch(this.config.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.config.apiKey,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`Bitquery API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Bitquery GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }

  // Get current token prices
  async getTokenPrices(tokenAddresses: string[]): Promise<TokenPrice[]> {
    const query = `
      query GetTokenPrices($addresses: [String!]!) {
        ethereum(network: ethereum) {
          address(address: {in: $addresses}) {
            address
            currency {
              symbol
              name
            }
            smartContract {
              contractType
            }
          }
        }
      }
    `;

    try {
      const data = await this.makeRequest(query, {
        addresses: tokenAddresses,
      });

      // This is a simplified implementation
      // You'll need to implement the actual price fetching logic
      // based on Bitquery's available endpoints
      return tokenAddresses.map((address) => ({
        address,
        symbol: "UNKNOWN",
        price: 0,
        priceChange24h: 0,
      }));
    } catch (error) {
      console.error("Error fetching token prices from Bitquery:", error);
      throw error;
    }
  }

  // Get historical prices for a token
  async getHistoricalPrices(
    tokenAddress: string,
    fromDate: string,
    toDate: string,
    interval: "1h" | "1d" | "1w" = "1d"
  ): Promise<HistoricalPrice[]> {
    const query = `
      query GetHistoricalPrices(
        $tokenAddress: String!
        $fromDate: ISO8601DateTime!
        $toDate: ISO8601DateTime!
      ) {
        ethereum(network: ethereum) {
          dexTrades(
            options: {asc: "date"}
            date: {since: $fromDate, till: $toDate}
            baseCurrency: {is: $tokenAddress}
          ) {
            date {
              date
            }
            baseCurrency {
              symbol
            }
            quoteCurrency {
              symbol
            }
            quotePrice
            trades: count
            quoteAmount
          }
        }
      }
    `;

    try {
      const data = await this.makeRequest(query, {
        tokenAddress,
        fromDate,
        toDate,
      });

      // Process the data and return historical prices
      return data.ethereum.dexTrades.map((trade: any) => ({
        date: trade.date.date,
        price: parseFloat(trade.quotePrice),
        volume: parseFloat(trade.quoteAmount),
      }));
    } catch (error) {
      console.error("Error fetching historical prices from Bitquery:", error);
      throw error;
    }
  }

  // Get portfolio performance data
  async getPortfolioPerformance(
    vaultAddresses: string[],
    fromDate: string,
    toDate: string
  ): Promise<PortfolioSnapshot[]> {
    // This would require a more complex query to aggregate vault performance
    // For now, return mock data
    return [];
  }

  // Get DeFi protocol analytics
  async getProtocolAnalytics(protocolAddress: string): Promise<any> {
    const query = `
      query GetProtocolAnalytics($protocolAddress: String!) {
        ethereum(network: ethereum) {
          address(address: {is: $protocolAddress}) {
            address
            balance
            smartContract {
              contractType
            }
          }
        }
      }
    `;

    try {
      const data = await this.makeRequest(query, {
        protocolAddress,
      });

      return data.ethereum.address;
    } catch (error) {
      console.error("Error fetching protocol analytics from Bitquery:", error);
      throw error;
    }
  }

  // Get transaction history for a wallet
  async getWalletTransactions(
    walletAddress: string,
    fromDate: string,
    toDate: string,
    limit: number = 100
  ): Promise<any[]> {
    const query = `
      query GetWalletTransactions(
        $walletAddress: String!
        $fromDate: ISO8601DateTime!
        $toDate: ISO8601DateTime!
        $limit: Int!
      ) {
        ethereum(network: ethereum) {
          transactions(
            options: {desc: "date", limit: $limit}
            date: {since: $fromDate, till: $toDate}
            txFrom: {is: $walletAddress}
          ) {
            hash
            date {
              date
            }
            value
            gas
            gasPrice
            success
          }
        }
      }
    `;

    try {
      const data = await this.makeRequest(query, {
        walletAddress,
        fromDate,
        toDate,
        limit,
      });

      return data.ethereum.transactions;
    } catch (error) {
      console.error("Error fetching wallet transactions from Bitquery:", error);
      throw error;
    }
  }
}

export default new BitqueryService();
