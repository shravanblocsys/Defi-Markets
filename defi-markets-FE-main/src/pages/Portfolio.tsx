import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RootState, useAppSelector } from "@/store";
import { useSelector } from "react-redux";
import { vaultsApi, authApi } from "@/services/api";
import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { portfolioApi } from "@/services/api";
import { Button } from "@/components/ui/button";
import StatsCard from "@/components/ui/stats-card";
import SettingsPopup from "@/components/ui/SettingsPopup";
import PortfolioChart from "@/components/ui/portfolio-chart";
import { TrendingUp, Settings, ExternalLink } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { formatAmount } from "@/lib/helpers";
import { SOLANA_NETWORKS } from "@/lib/solana";
import VaultCard from "@/components/ui/vault-card";
import { ActivityBar } from "@/components/ui/activity-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  VaultDepositTransaction,
  TransactionHistoryItem,
  Vault,
} from "@/types/store";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { usePortfolioValuation } from "@/hooks/usePortfolioValuation";
import PortfolioPerformanceChart from "@/components/portfolio/PortfolioPerformanceChart";

// No mock chart data; portfolio series comes from usePortfolioValuation
import { useToast } from "@/hooks/use-toast";

const Portfolio = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("7d");
  const [showSettings, setShowSettings] = useState(false);
  const [deposits, setDeposits] = useState<VaultDepositTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, user, solanaAuth } = useSelector(
    (state: RootState) => state.auth
  );
  const [transactionHistory, setTransactionHistory] = useState<
    TransactionHistoryItem[]
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [activeTab, setActiveTab] = useState("my-vaults");
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const { vaultChartData, loadingVaults: chartLoadingVaults } = useAppSelector(
    (state) => state.chart
  );

  // Portfolio valuation hook
  const {
    totalValue,
    dayChange,
    dayChangePercent,
    weekChange,
    weekChangePercent,
    averageAPY,
    vaultCount,
    loading: portfolioLoading,
    loadingVaults,
    error: portfolioError,
    lastUpdated,
    vaultValuations,
    portfolioSeries,
    refetch: refetchPortfolio,
    refetchVaults,
  } = usePortfolioValuation(selectedPeriod);

  // My Vaults state
  const [myVaults, setMyVaults] = useState<Vault[]>([]);
  const [isLoadingMyVaults, setIsLoadingMyVaults] = useState(false);
  const [myVaultsError, setMyVaultsError] = useState<string | null>(null);

  // Helper function to format amounts

  // Handle Twitter authentication callback
  useEffect(() => {
    const handleTwitterCallback = async () => {
      // console.log("=== Twitter Callback Handler Started ===");

      // Get twitterUsername from URL query parameter
      const twitterUsername = searchParams.get("twitterUsername");

      if (twitterUsername && isAuthenticated) {
        try {
          // Get wallet address from Redux store or user object
          // let walletAddress =
          //   user?.walletAddress ||
          //   user?.address ||
          //   solanaAuth?.address ||
          //   sessionStorage.getItem("walletAddress");

          // console.log("User object:", user);
          // console.log("Solana auth:", solanaAuth);
          // console.log("Initial wallet address:", walletAddress);

          // If wallet address not found, try to fetch user profile first
          // if (!walletAddress) {
          //   console.log("Wallet address not found, fetching user profile...");
          //   try {
          //     const profileResponse = await authApi.getProfile();
          //     const userData =
          //       profileResponse.data?.user || profileResponse.data;
          //     console.log("Fetched user profile:", userData);

          //     walletAddress = userData?.walletAddress || userData?.address;
          //     console.log("Wallet address from profile:", walletAddress);
          //   } catch (profileError) {
          //     console.error("Failed to fetch user profile:", profileError);
          //   }
          // }

          // if (!walletAddress) {
          //   console.error(
          //     "Wallet address not found even after fetching profile"
          //   );
          //   toast({
          //     title: "Error",
          //     description:
          //       "Wallet address not found. Please reconnect your wallet.",
          //     variant: "destructive",
          //   });
          //   // Remove twitterUsername from URL
          //   searchParams.delete("twitterUsername");
          //   setSearchParams(searchParams, { replace: true });
          //   return;
          // }

          // console.log("Calling updateProfile with:", {
          //   // walletAddress,
          //   twitter_username: twitterUsername,
          // });

          // Call profile update endpoint with twitterUsername and walletAddress
          const response = await authApi.updateProfile({
            // walletAddress,
            twitter_username: twitterUsername,
          });

          // console.log("UpdateProfile response:", response.data);

          if (response.status === "success" && response.data) {
            // Remove twitterUsername from URL
            searchParams.delete("twitterUsername");
            setSearchParams(searchParams, { replace: true });

            // Show success message
            toast({
              title: "Success",
              description: `Twitter account @${twitterUsername} connected successfully!`,
            });
          }
        } catch (error) {
          console.error("Failed to update profile with Twitter:", error);

          // Remove twitterUsername from URL
          searchParams.delete("twitterUsername");
          setSearchParams(searchParams, { replace: true });

          toast({
            title: "Error",
            description: "Failed to connect Twitter account",
            variant: "destructive",
          });
        }
      } else {
        // console.log(
        //   "Conditions not met - twitterUsername:",
        //   !!twitterUsername,
        //   "isAuthenticated:",
        //   isAuthenticated
        // );
      }
    };

    handleTwitterCallback();
  }, [isAuthenticated, user, solanaAuth, toast, searchParams, setSearchParams]);

  // Fetch deposits data
  useEffect(() => {
    const fetchDeposits = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await portfolioApi.getDeposits({ page: 1, limit: 10 });
        setDeposits(response.data);
      } catch (err) {
        console.error("Error fetching deposits:", err);
        setError("Failed to load deposit data");
      } finally {
        setIsLoading(false);
      }
    };

    if (!isAuthenticated) {
      return;
    }

    fetchDeposits();
  }, [isAuthenticated]);

  // Fetch transaction history data
  const fetchTransactionHistory = useCallback(
    async (page: number = 1) => {
      if (!isAuthenticated) {
        return;
      }
      try {
        setIsLoadingHistory(true);
        setHistoryError(null);
        const response = await portfolioApi.getTransactionHistory({
          page,
          limit: 10,
        });
        setTransactionHistory(response.data);
        setPaginationInfo(response.pagination);
        setCurrentPage(page);
      } catch (err) {
        console.error("Error fetching transaction history:", err);
        setHistoryError("Failed to load transaction history");
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [isAuthenticated]
  );

  // Fetch transaction history when transactions tab is selected
  useEffect(() => {
    if (activeTab === "transactions" && isAuthenticated) {
      fetchTransactionHistory(1); // Always start from page 1 when switching to transactions tab
    }
  }, [activeTab, isAuthenticated, fetchTransactionHistory]);

  // Fetch My Vaults when my-vaults tab is selected
  useEffect(() => {
    if (activeTab === "my-vaults" && isAuthenticated) {
      fetchMyVaults();
    }
  }, [activeTab, isAuthenticated]);

  // Fetch My Vaults data
  const fetchMyVaults = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }
    try {
      setIsLoadingMyVaults(true);
      setMyVaultsError(null);
      const response = await vaultsApi.getVaultsByUser(1, 10);

      if (response && response.data && Array.isArray(response.data)) {
        setMyVaults(response.data);
      } else {
        setMyVaultsError("Failed to fetch vaults: Invalid response format");
      }
    } catch (err) {
      console.error("Error fetching my vaults:", err);
      setMyVaultsError(
        err instanceof Error ? err.message : "Failed to load vaults"
      );
    } finally {
      setIsLoadingMyVaults(false);
    }
  }, [isAuthenticated]);

  // Pagination handlers
  const handleNextPage = () => {
    if (paginationInfo.hasNext) {
      fetchTransactionHistory(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (paginationInfo.hasPrev) {
      fetchTransactionHistory(currentPage - 1);
    }
  };

  // Build display values directly from live metrics (no mock fallbacks)
  const portfolioOverview = {
    totalValue: `$${totalValue.toFixed(2)}`,
    dayChange: `${dayChange >= 0 ? "+" : "-"}$${Math.abs(dayChange).toFixed(
      2
    )}`,
    dayChangePercent: `${dayChangePercent >= 0 ? "+" : "-"}${Math.abs(
      dayChangePercent
    ).toFixed(2)}%`,
    weekChange: `${weekChange >= 0 ? "+" : "-"}$${Math.abs(weekChange).toFixed(
      2
    )}`,
    weekChangePercent: `${weekChangePercent >= 0 ? "+" : "-"}${Math.abs(
      weekChangePercent
    ).toFixed(2)}%`,
  };

  // Helper function to get transaction type and icon
  // const getTransactionType = (action: string) => {
  //   if (action.includes("deposit")) {
  //     return {
  //       type: "deposit",
  //       icon: ArrowUpRight,
  //       color: "bg-success/20 text-success",
  //     };
  //   } else if (action.includes("redeem")) {
  //     return {
  //       type: "redemption",
  //       icon: ArrowDownRight,
  //       color: "bg-warning/20 text-warning",
  //     };
  //   }
  //   return {
  //     type: "transaction",
  //     icon: ArrowUpRight,
  //     color: "bg-info/20 text-info",
  //   };
  // };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center mt-16 px-4">
        <Card className="glass-card max-w-md w-full text-center">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-bold">
              Connect your wallet
            </CardTitle>
            <CardDescription>
              Sign in to view your portfolio and activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  } else {
    return (
      <div className="min-h-screen py-16 sm:py-20 lg:py-24 mt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
                Portfolio Overview
              </h1>
              <p className="text-base sm:text-lg lg:text-xl text-muted-foreground">
                Track your DeFi vault investments and performance
              </p>
            </div>

            {isAuthenticated && (
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                {/* <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button> */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                  className="w-full sm:w-auto"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </div>
            )}
          </div>

          {/* Portfolio Value Overview - Match Screenshot Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {/* Main Portfolio Display */}
            <div className="lg:col-span-2">
              <div className="glass-card p-6 sm:p-8 rounded-lg">
                {/* Portfolio Title and Value */}
                <div className="mb-6">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2">
                    {portfolioOverview.totalValue}
                  </h1>
                  <p className="text-lg sm:text-xl text-gray-300 mb-4">
                    TOTAL PORTFOLIO VALUE
                  </p>

                  {/* Today's Performance */}
                  <div className="flex items-center gap-2 text-success mb-6">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-lg font-semibold">
                      {portfolioOverview.dayChange} (
                      {portfolioOverview.dayChangePercent}) TODAY
                    </span>
                  </div>
                </div>

                {/* Portfolio Performance Chart */}
                <PortfolioPerformanceChart
                  data={portfolioSeries.map((p) => ({
                    date: p.date,
                    value: p.value,
                    change: p.change || 0,
                    changePercent: p.changePercent || 0,
                  }))}
                  loading={portfolioLoading || loadingVaults}
                  period={selectedPeriod as "1d" | "7d" | "30d" | "90d" | "1y"}
                />
              </div>
            </div>

            {/* Right Side Metrics */}
            <div className="space-y-4 sm:space-y-6">
              {/* 7-Day Performance */}
              <div className="glass-card p-4 sm:p-6 rounded-lg">
                <div className="text-center">
                  <div
                    className={`text-2xl sm:text-3xl font-bold mb-1 ${
                      weekChangePercent >= 0 ? "text-success" : "text-error"
                    }`}
                  >
                    {portfolioOverview.weekChangePercent}
                  </div>
                  <div className="text-sm text-gray-300 mb-2">
                    7-DAY PERFORMANCE
                  </div>
                  <div
                    className={`text-sm ${
                      weekChange >= 0 ? "text-success" : "text-error"
                    }`}
                  >
                    {portfolioOverview.weekChange}
                  </div>
                </div>
              </div>

              {/* Average APY */}
              <div className="glass-card p-4 sm:p-6 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-white mb-1">
                    {averageAPY > 0 ? `${averageAPY.toFixed(1)}%` : "15.8%"}
                  </div>
                  <div className="text-sm text-gray-300 mb-2">AVERAGE APY</div>
                  <div className="text-success text-sm">
                    {averageAPY > 0
                      ? `+${(averageAPY * 0.05).toFixed(1)}% THIS MONTH`
                      : "+0.7% THIS MONTH"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Holdings and Transactions */}
          <Tabs
            defaultValue="holdings"
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-4 sm:space-y-6"
          >
            <div className="overflow-x-auto scrollbar-hide">
              <TabsList className="inline-flex w-max min-w-full glass-surface gap-1 p-1 justify-start">
                <TabsTrigger
                  value="my-vaults"
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
                >
                  My vaults
                </TabsTrigger>
                <TabsTrigger
                  value="holdings"
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
                >
                  Deposits
                </TabsTrigger>
                <TabsTrigger
                  value="transactions"
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
                >
                  <span className="hidden sm:inline">Recent </span>Transactions
                </TabsTrigger>
                {/* <TabsTrigger
                  value="performance"
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap"
                >
                  Performance
                </TabsTrigger> */}
              </TabsList>
            </div>

            <TabsContent value="holdings" className="space-y-4 sm:space-y-6">
              <Card className="glass-card">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-lg sm:text-xl">
                    Your Vault Deposits
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base">
                    Recent deposit transactions across all vaults
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-muted-foreground">
                        Loading deposits...
                      </div>
                    </div>
                  ) : error ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-error">{error}</div>
                    </div>
                  ) : deposits.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-muted-foreground">
                        No deposits found
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 sm:space-y-4">
                      {deposits
                        .filter((deposit) => deposit.vaultFactory) // Filter out deposits with null vaultFactory
                        .map((deposit, index) => (
                          <div
                            key={deposit._id}
                            className="p-3 sm:p-4 glass-surface rounded-lg"
                          >
                            <div className="flex items-center justify-between mb-3 sm:mb-4">
                              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-semibold text-sm sm:text-base truncate">
                                    {deposit.vaultFactory?.vaultName ||
                                      "Unknown Vault"}
                                  </h3>
                                  <p className="text-xs sm:text-sm text-muted-foreground">
                                    {deposit.vaultFactory?.vaultSymbol || "N/A"}
                                  </p>
                                </div>
                                <Badge
                                  variant={
                                    deposit.status === "completed"
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="ml-2 text-xs flex-shrink-0"
                                >
                                  {deposit.status}
                                </Badge>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-3 sm:mb-4">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Amount Deposited
                                </p>
                                <p className="font-medium text-sm sm:text-base">
                                  ${formatAmount(deposit.amount || 0)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Shares Received
                                </p>
                                <p className="font-medium text-sm sm:text-base">
                                  {formatAmount(deposit.sharesReceived || 0)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Fee Paid
                                </p>
                                <p className="font-medium text-sm sm:text-base">
                                  ${formatAmount(deposit.feePaid || 0)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Date
                                </p>
                                <p className="font-medium text-sm sm:text-base">
                                  {deposit.createdAt
                                    ? new Date(
                                        deposit.createdAt
                                      ).toLocaleDateString()
                                    : "Unknown"}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 mt-4">
                              {/* <Button variant="outline" size="sm" className="flex-1">
                              View Details
                            </Button> */}
                              <Link
                                className="flex-1 h-8 sm:h-9 px-3 sm:px-4 py-2 bg-neutral-900/70 rounded-[10px] outline outline-1 outline-offset-[-1px] outline-slate-700/60 flex justify-center items-center hover:bg-neutral-800/70 transition-colors"
                                to={
                                  deposit.vaultFactory?._id
                                    ? `/vault/${deposit.vaultFactory._id}`
                                    : "/"
                                }
                              >
                                <div className="text-center text-gray-100 text-xs sm:text-sm font-medium font-architekt leading-tight">
                                  View Details
                                </div>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  const base = `https://solscan.io/tx/${deposit.transactionSignature}`;
                                  const network = import.meta.env
                                    .VITE_SOLANA_NETWORK as string | undefined;
                                  const isDevnet =
                                    (network || SOLANA_NETWORKS.MAINNET) ===
                                    SOLANA_NETWORKS.DEVNET;
                                  const url = isDevnet
                                    ? `${base}?cluster=devnet`
                                    : base;
                                  window.open(url, "_blank");
                                }}
                              >
                                View on Explorer
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full sm:w-auto"
                                onClick={() => {
                                  const base = `https://solscan.io/tx/${deposit.transactionSignature}`;
                                  const network = import.meta.env
                                    .VITE_SOLANA_NETWORK as string | undefined;
                                  const isDevnet =
                                    (network || SOLANA_NETWORKS.MAINNET) ===
                                    SOLANA_NETWORKS.DEVNET;
                                  const url = isDevnet
                                    ? `${base}?cluster=devnet`
                                    : base;
                                  window.open(url, "_blank");
                                }}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent
              value="transactions"
              className="space-y-4 sm:space-y-6"
            >
              <Card className="glass-card">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-lg sm:text-xl">
                    Transaction History
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base">
                    Recent deposits, redemptions, and transfers
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  {isLoadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-muted-foreground">
                        Loading transaction history...
                      </div>
                    </div>
                  ) : historyError ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-error">{historyError}</div>
                    </div>
                  ) : transactionHistory.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-muted-foreground">
                        No transaction history found
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3 sm:space-y-4">
                        {transactionHistory
                          .filter((tx) => tx.vaultId && tx.metadata) // Filter out transactions with null vaultId or metadata
                          .map((tx) => {
                            return (
                              <ActivityBar
                                key={tx._id}
                                id={tx._id}
                                action={tx.action || "Unknown"}
                                amount={Number(tx.metadata?.amount || 0)}
                                createdAt={tx.createdAt}
                                vaultName={
                                  tx.vaultId?.vaultName || "Unknown Vault"
                                }
                                vaultSymbol={tx.vaultId?.vaultSymbol || "N/A"}
                                netStablecoinAmount={Number(
                                  tx.metadata?.netStablecoinAmount || 0
                                )}
                                transactionSignature={
                                  tx.transactionSignature || ""
                                }
                                signatureArray={tx.signatureArray || []}
                                vaultTokensMinted={Number(
                                  tx.metadata?.vaultTokensMinted || 0
                                )}
                                vaultTokensRedeemed={Number(
                                  tx.metadata?.vaultTokensRedeemed || 0
                                )}
                              />
                            );
                          })}
                      </div>

                      {/* Pagination Controls */}
                      {paginationInfo.totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t border-gray-700/50">
                          <div className="text-sm text-muted-foreground">
                            Showing{" "}
                            {(currentPage - 1) * paginationInfo.limit + 1} to{" "}
                            {Math.min(
                              currentPage * paginationInfo.limit,
                              paginationInfo.total
                            )}{" "}
                            of {paginationInfo.total} transactions
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handlePrevPage}
                              disabled={
                                !paginationInfo.hasPrev || isLoadingHistory
                              }
                              className={`flex items-center gap-1 ${
                                !paginationInfo.hasPrev || isLoadingHistory
                                  ? "cursor-not-allowed"
                                  : "cursor-pointer"
                              }`}
                            >
                              <span>Previous</span>
                            </Button>
                            <span className="text-sm text-muted-foreground px-2">
                              Page {currentPage} of {paginationInfo.totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleNextPage}
                              disabled={
                                !paginationInfo.hasNext || isLoadingHistory
                              }
                              className={`flex items-center gap-1 ${
                                !paginationInfo.hasNext || isLoadingHistory
                                  ? "cursor-not-allowed"
                                  : "cursor-pointer"
                              }`}
                            >
                              <span>Next</span>
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="performance" className="space-y-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Performance Analytics</CardTitle>
                  <CardDescription>
                    Detailed performance metrics and insights
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PortfolioChart
                    data={[]} // Empty array will generate mock data
                    currentValue={847392.18}
                    change={2.9}
                    changePeriod="1W"
                    type="bar"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="my-vaults" className="space-y-4 sm:space-y-6">
              <Card className="glass-card">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-lg sm:text-xl">
                    My Vaults
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base">
                    Vaults you have created or are managing
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  {isLoadingMyVaults ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-muted-foreground">
                        Loading vaults...
                      </div>
                    </div>
                  ) : myVaultsError ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-error">{myVaultsError}</div>
                    </div>
                  ) : myVaults.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-muted-foreground">
                        No vaults found. Create your first vault to get started.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {myVaults.map((vault) => (
                        <VaultCard
                          key={vault._id}
                          name={vault.vaultName}
                          symbol={vault.vaultSymbol}
                          apy={`${(vault.apy || 0).toFixed(1)}%`}
                          tvl={`${
                            vault.totalValueLocked ? vault.totalValueLocked : 0
                          }M`}
                          capacity={75} // Default capacity
                          assets={
                            vault.underlyingAssets?.map((asset) => ({
                              symbol:
                                asset.assetAllocation?.symbol ||
                                asset.symbol ||
                                "UNK",
                              logoUrl: asset.assetAllocation?.logoUrl,
                            })) || []
                          }
                          risk="Medium" // Default risk level
                          nav={`$${parseFloat(vault.nav).toFixed(2)}`}
                          id={vault._id}
                          creator={{
                            name:
                              typeof vault.creator === "object" && vault.creator
                                ? vault.creator.name
                                : "Unknown",
                            twitter: "", // Twitter not available in VaultCreator interface
                          }}
                          banner={vault.bannerUrl} // Not available in Vault interface
                          logo={vault.logoUrl} // Not available in Vault interface
                          reputation={8} // Default reputation
                          change24h="+0.1%" // Default change
                          chartData={vaultChartData[vault._id] || []}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Settings Popup */}
        <SettingsPopup
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      </div>
    );
  }
};

export default Portfolio;
