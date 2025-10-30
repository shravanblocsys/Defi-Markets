import { useState, useEffect, useCallback } from "react";
import bitqueryService from "@/services/bitqueryService";

interface BitqueryTokenPrice {
  address: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCap?: number;
  volume24h?: number;
}

interface BitqueryHistoricalPrice {
  date: string;
  price: number;
  volume?: number;
}

interface UseBitqueryDataReturn {
  tokenPrices: BitqueryTokenPrice[];
  historicalPrices: { [tokenAddress: string]: BitqueryHistoricalPrice[] };
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useBitqueryData = (
  tokenAddresses: string[],
  options: {
    fetchHistorical?: boolean;
    fromDate?: string;
    toDate?: string;
    interval?: "1h" | "1d" | "1w";
  } = {}
) => {
  const [tokenPrices, setTokenPrices] = useState<BitqueryTokenPrice[]>([]);
  const [historicalPrices, setHistoricalPrices] = useState<{
    [tokenAddress: string]: BitqueryHistoricalPrice[];
  }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!tokenAddresses.length) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch current token prices
      const prices = await bitqueryService.getTokenPrices(tokenAddresses);
      setTokenPrices(prices);

      // Fetch historical data if requested
      if (options.fetchHistorical && options.fromDate && options.toDate) {
        const historicalData: { [tokenAddress: string]: BitqueryHistoricalPrice[] } = {};
        
        for (const address of tokenAddresses) {
          try {
            const historical = await bitqueryService.getHistoricalPrices(
              address,
              options.fromDate,
              options.toDate,
              options.interval || "1d"
            );
            historicalData[address] = historical;
          } catch (err) {
            console.warn(`Failed to fetch historical data for ${address}:`, err);
            historicalData[address] = [];
          }
        }
        
        setHistoricalPrices(historicalData);
      }
    } catch (err) {
      console.error("Error fetching Bitquery data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [tokenAddresses, options.fetchHistorical, options.fromDate, options.toDate, options.interval]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    tokenPrices,
    historicalPrices,
    loading,
    error,
    refetch: fetchData,
  };
};

// Hook for portfolio-specific Bitquery data
export const usePortfolioBitqueryData = (
  vaultAddresses: string[],
  walletAddress?: string
) => {
  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolioData = useCallback(async () => {
    if (!vaultAddresses.length) return;

    setLoading(true);
    setError(null);

    try {
      // Get current date range (last 30 days)
      const toDate = new Date().toISOString();
      const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch portfolio performance data
      const performanceData = await bitqueryService.getPortfolioPerformance(
        vaultAddresses,
        fromDate,
        toDate
      );

      setPortfolioData(performanceData);
    } catch (err) {
      console.error("Error fetching portfolio Bitquery data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch portfolio data");
    } finally {
      setLoading(false);
    }
  }, [vaultAddresses]);

  useEffect(() => {
    fetchPortfolioData();
  }, [fetchPortfolioData]);

  return {
    portfolioData,
    loading,
    error,
    refetch: fetchPortfolioData,
  };
};

// Hook for wallet transaction history
export const useWalletBitqueryData = (
  walletAddress: string,
  fromDate?: string,
  toDate?: string
) => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWalletData = useCallback(async () => {
    if (!walletAddress) return;

    setLoading(true);
    setError(null);

    try {
      const toDateStr = toDate || new Date().toISOString();
      const fromDateStr = fromDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const txData = await bitqueryService.getWalletTransactions(
        walletAddress,
        fromDateStr,
        toDateStr,
        100
      );

      setTransactions(txData);
    } catch (err) {
      console.error("Error fetching wallet Bitquery data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch wallet data");
    } finally {
      setLoading(false);
    }
  }, [walletAddress, fromDate, toDate]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  return {
    transactions,
    loading,
    error,
    refetch: fetchWalletData,
  };
};
