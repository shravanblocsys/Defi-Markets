import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  Users,
  BarChart3,
  Globe,
  Copy,
  ExternalLink,
  ChevronDown,
  Info,
} from "lucide-react";
import type { Vault } from "@/types/store";
import VaultChart from "@/components/ui/vault-chart";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { chartApi } from "@/services/api";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { PublicKey, Connection } from "@solana/web3.js";
import { TOKEN_MINTS } from "@/components/solana/programIds/programids";
import PortfolioTab from "./PortfolioTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/helpers";
import FeesTab from "./FeesTab";
import { RefreshCw } from "lucide-react";

// Helper function to format TVL/NAV with 4 decimal places
const formatTVL = (value: number): string => {
  if (value === 0) return "$0.0000";
  return `$${value.toFixed(4)}`;
};

interface VaultInsights {
  totalUnderlyingAssetsCount: number;
  totalUsersCount: number;
  vaultSymbol: string;
}

interface OverviewTabProps {
  vault: Vault;
  vaultInsights: VaultInsights | null;
  vaultMetrics: {
    assetsUnderManagement: number;
    depositors: number;
    averageMonthlyReturn: number;
    annualizedAPY: number;
    leverageRatio: number;
    loanToValueRatio: number;
    sharePriceChange: number;
    sharePriceChangePeriod: string;
  } | null;
  // Bento grid integrations
  portfolioData?: {
    vaultSymbol: string;
    assets: Array<{
      assetName: string;
      logoUrl: string;
      percentageAllocation: number;
      price: number;
      change24h: number;
      tokenBalance?: number;
      tokenBalanceFormatted?: number;
      decimals?: number;
    }>;
  } | null;
  portfolioLoading?: boolean;
  // fees for inline section
  feesData?: {
    fees: Array<{
      feeRate?: number;
      minFeeRate?: number;
      maxFeeRate?: number;
      description: string;
      type: string;
    }>;
    vaultFees: number;
  } | null;
  feesLoading?: boolean;
  // Inline invest area props
  createdOn?: string | null;
  vaultFees?: {
    entryFeeBps: number;
    exitFeeBps: number;
    vaultManagementFees: number;
  } | null;
  depositAmount?: string;
  setDepositAmount?: (v: string) => void;
  redeemAmount?: string;
  setRedeemAmount?: (v: string) => void;
  agreedToTerms?: boolean;
  setAgreedToTerms?: (v: boolean) => void;
  selectedToken?: string;
  userDepositAmount?: number;
  depositing?: boolean;
  depositStep?: string;
  depositStepIndex?: number;
  depositSteps?: string[];
  isRedeeming?: boolean;
  redeemStep?: string;
  redeemStepIndex?: number;
  redeemSteps?: string[];
  onDeposit?: () => void;
  onRedeem?: () => void;
  // Financial Performance props
  gav?: number;
  nav?: number;
  valuationLoading?: boolean;
  refetchValuation?: () => void;
  vaultIndex?: number;
  miniDeposit?: number;
  miniRedeem?: number;
  dtfSharePrice?: number;
  refreshTrigger?: number;
  userAddress?: string;
  connection?: Connection;
  totalSupply?: number;
}

const OverviewTab = ({
  vault,
  vaultInsights,
  vaultMetrics,
  portfolioData,
  portfolioLoading,
  feesData,
  feesLoading,
  createdOn,
  vaultFees,
  depositAmount,
  setDepositAmount,
  redeemAmount,
  setRedeemAmount,
  agreedToTerms,
  setAgreedToTerms,
  selectedToken,
  userDepositAmount,
  depositing,
  depositStep,
  depositStepIndex,
  depositSteps,
  isRedeeming,
  redeemStep,
  redeemStepIndex,
  redeemSteps,
  onDeposit,
  onRedeem,
  gav,
  nav,
  valuationLoading,
  refetchValuation,
  vaultIndex,
  miniDeposit,
  miniRedeem,
  dtfSharePrice,
  refreshTrigger,
  userAddress,
  connection,
  totalSupply,
}: OverviewTabProps) => {
  console.log("totalSupply", totalSupply);
  console.log("vault.totalSupply", vault.totalSupply);
  const { toast } = useToast();
  const [selectedTimeRange, setSelectedTimeRange] = useState("1D");
  const [sharePriceChartData, setSharePriceChartData] = useState<
    Array<{
      timestamp: string;
      sharePrice: number;
      nav: number;
      totalSupply: number;
      gav: number;
    }>
  >([]);
  const [currentSharePriceData, setCurrentSharePriceData] = useState<{
    timestamp: string;
    sharePrice: number;
    nav: number;
    totalSupply: number;
    gav: number;
  } | null>(null);
  const [userUSDCBalance, setUserUSDCBalance] = useState<number>(0);
  const [allTimeframesData, setAllTimeframesData] = useState<{
    "1D": Array<{
      timestamp: string;
      sharePrice: number;
      nav: number;
      totalSupply: number;
      gav: number;
    }>;
    "1M": Array<{
      timestamp: string;
      sharePrice: number;
      nav: number;
      totalSupply: number;
      gav: number;
    }>;
    "3M": Array<{
      timestamp: string;
      sharePrice: number;
      nav: number;
      totalSupply: number;
      gav: number;
    }>;
    "6M": Array<{
      timestamp: string;
      sharePrice: number;
      nav: number;
      totalSupply: number;
      gav: number;
    }>;
    "1Y": Array<{
      timestamp: string;
      sharePrice: number;
      nav: number;
      totalSupply: number;
      gav: number;
    }>;
  } | null>(null);

  const vaultId = vault._id;

  // Transform chart data to match VaultChart component format - only use share price data
  const getChartDataForTimeframe = (timeframe: string) => {
    if (allTimeframesData) {
      const timeframeData =
        allTimeframesData[timeframe as keyof typeof allTimeframesData];
      if (timeframeData && timeframeData.length > 0) {
        return timeframeData.map((point) => ({
          date: point.timestamp,
          nav: point.sharePrice, // Use share price for the chart
        }));
      }
    }
    return sharePriceChartData.length > 0
      ? sharePriceChartData.map((point) => ({
          date: point.timestamp,
          nav: point.sharePrice, // Use share price for the chart
        }))
      : []; // Don't fall back to NAV data, show empty chart if no share price data
  };

  const transformedChartData = getChartDataForTimeframe(selectedTimeRange);

  // Use API share price for chart display - prioritize current share price from API
  const currentSharePrice =
    currentSharePriceData?.sharePrice || vault.sharePrice || dtfSharePrice || 0;

  // Use NAV from API total-usd only - no fallbacks
  const currentNav = nav || 0;

  const timeRanges = ["1D", "1M", "3M", "6M", "1Y"];

  const KeyMetricGridData = [
    "Assets Under Management",
    "Depositors",
    "Average Monthly Return",
    "Denomination Asset",
  ];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Address copied to clipboard",
    });
  };

  const fetchSharePriceChartData = async (vaultId: string) => {
    try {
      // Fetch all timeframes data
      const response = await chartApi.getVaultSharePriceChartAll(vaultId);
      if (response?.data) {
        setAllTimeframesData(response.data.timeframes);
        setCurrentSharePriceData(response.data.currentSharePrice);
      }
    } catch (error) {
      console.error("Error fetching share price chart data:", error);
    }
  };


  useEffect(() => {
    fetchSharePriceChartData(vaultId);
  }, [vaultId]);

  // Refresh share price chart data when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchSharePriceChartData(vaultId);
    }
  }, [refreshTrigger, vaultId]);

  // Fetch USDC balance when user address or connection changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (!userAddress || !connection) {
        console.log(
          "No user address or connection available for USDC balance check"
        );
        return;
      }

      try {
        // USDC mint address (mainnet)
        const usdcMint = TOKEN_MINTS.MAINNET.USDC;

        // Get user's USDC token account address
        const userUSDCAccount = await getAssociatedTokenAddress(
          usdcMint,
          new PublicKey(userAddress)
        );

        // Get the token account balance
        const tokenAccount = await getAccount(connection, userUSDCAccount);

        // Get USDC mint info to get decimals
        const mintInfo = await getMint(connection, usdcMint);

        // Convert balance from smallest unit to base10
        const balance =
          Number(tokenAccount.amount) / Math.pow(10, mintInfo.decimals);

        setUserUSDCBalance(balance);
        console.log("💰 User USDC Balance:", balance);
      } catch (error) {
        console.error("Error fetching USDC balance:", error);
        // If token account doesn't exist, balance is 0
        setUserUSDCBalance(0);
      }
    };

    if (userAddress && connection) {
      fetchBalance();
    }
  }, [userAddress, connection]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 items-start">
        {/* Left column: About cards + Portfolio Allocation */}
        <div className="lg:col-span-3 space-y-4">
          {/* Compact Header inside left column */}
          <Card className="glass-card">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-gradient-primary flex items-center justify-center overflow-hidden flex-shrink-0">
                    {vault.logoUrl ? (
                      <img
                        src={vault.logoUrl}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl sm:text-lg">
                        {(vault.vaultName || "").slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                      {vault.vaultName}
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      {vault.description}
                    </p>
                    {vault.status && (
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {vault.status === "active"
                          ? "Active"
                          : vault.status === "pending"
                          ? "Pending"
                          : "Inactive"}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `https://solscan.io/account/${vault.vaultAddress}`,
                        "_blank"
                      )
                    }
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
                {/* Monthly revenue (compact) */}
                {vaultMetrics && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-muted-foreground">
                      Monthly Revenue
                    </p>
                    <div className="flex items-baseline gap-2 justify-end">
                      {typeof vaultMetrics.averageMonthlyReturn ===
                        "number" && (
                        <span
                          className={`text-xl sm:text-2xl font-medium ${
                            vaultMetrics.averageMonthlyReturn >= 0
                              ? "text-success"
                              : "text-error"
                          }`}
                        >
                          {vaultMetrics.averageMonthlyReturn >= 0 ? "+" : ""}
                          {(() => {
                            const value = vaultMetrics.averageMonthlyReturn;
                            if (!isFinite(value) || Math.abs(value) > 999999) {
                              return "0.00";
                            }
                            return value.toFixed(2);
                          })()}
                          %
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          {/* About cards row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* About Portfolio */}
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">About Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 xs:grid-cols-3 sm:grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Created on</p>
                    <p className="text-sm font-medium text-foreground">
                      {(() => {
                        const raw =
                          createdOn ||
                          (vault.createdAt as unknown as string) ||
                          vault.originalTimestamp ||
                          vault.blockTime;
                        if (!raw) return "-";
                        const d = new Date(raw);
                        return Number.isNaN(d.getTime())
                          ? "-"
                          : d.toLocaleDateString();
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">TVL</p>
                    <p className="text-sm font-medium text-foreground">
                    {formatCurrency(currentNav)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Holders</p>
                    <p className="text-sm font-medium text-foreground">
                      {vaultInsights?.totalUsersCount ?? 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* About Creator */}
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">About Creator</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {typeof vault.creator === "object" &&
                      vault.creator &&
                      "name" in vault.creator
                        ? (vault.creator as { name?: string }).name || "Unknown"
                        : "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {vault.creatorAddress
                        ? `${vault.creatorAddress.slice(
                            0,
                            4
                          )}...${vault.creatorAddress.slice(-4)}`
                        : "-"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `https://solscan.io/account/${vault.creatorAddress}`,
                        "_blank"
                      )
                    }
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Portfolio Allocation */}
          <PortfolioTab
            portfolioData={portfolioData || null}
            loading={!!portfolioLoading}
          />

          {/* Share Price Chart - placed directly under left stack */}
          <Card className="glass-card lg:col-span-3 lg:row-start-2">
            <CardHeader>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <CardTitle className="text-sm text-muted-foreground mb-2">
                    Share Price
                  </CardTitle>
                  <div className="flex items-baseline gap-3">
                    <p className="text-4xl font-bold text-foreground">
                      ${(vault.sharePrice || dtfSharePrice || 0).toFixed(6)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Share Price
                    </span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </div> */}
                  <div className="flex gap-1">
                    {timeRanges.map((range) => (
                      <Button
                        key={range}
                        variant={
                          range === selectedTimeRange ? "default" : "ghost"
                        }
                        size="sm"
                        className="h-8 px-3 hover:text-white"
                        onClick={() => setSelectedTimeRange(range)}
                      >
                        {range}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <VaultChart
                data={transformedChartData}
                currentValue={currentSharePrice}
                change={vaultMetrics?.sharePriceChange || 0}
                changePeriod={vaultMetrics?.sharePriceChangePeriod || "1W"}
              />
            </CardContent>
          </Card>

          {/* Token Balances - shows actual token holdings from vault contract */}
          <Card className="glass-card lg:col-span-3 lg:row-start-2">
            <CardHeader>
              <CardTitle>Vault Token Balances</CardTitle>
            </CardHeader>
            <CardContent>
              {portfolioData &&
              portfolioData.assets &&
              portfolioData.assets.length > 0 ? (
                <div className="space-y-1">
                  {portfolioData.assets.map((asset, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-surface-2/50"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-2 flex items-center justify-center">
                          <img
                            src={asset.logoUrl}
                            alt={asset.assetName}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                              target.nextElementSibling?.classList.remove(
                                "hidden"
                              );
                            }}
                          />
                          <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center hidden">
                            <span className="text-xs font-bold text-primary">
                              {asset.assetName.split(" ")[0].charAt(0)}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {asset.assetName.split(" ")[0]}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {asset.assetName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">
                          {asset.tokenBalanceFormatted?.toFixed(6) ||
                            "0.000000"}
                        </p>
                        {/* <p className="text-xs text-muted-foreground">
                          {asset.tokenBalance?.toLocaleString() || "0"} units
                        </p> */}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  {portfolioLoading
                    ? "Loading token balances..."
                    : "No token balance data available"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Invest / Actions - spans 2 cols on desktop */}
        <div className="lg:col-span-2 lg:col-start-4 flex flex-col gap-4 lg:sticky lg:top-32 self-start lg:row-start-1">
          <Card className="glass-card lg:col-span-2">
            <CardHeader>
              <CardTitle>Invest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="deposit" className="w-full">
                <TabsList className="w-full grid grid-cols-2 rounded-lg glass-surface p-1">
                  <TabsTrigger
                    value="deposit"
                    className="h-8 rounded-md data-[state=active]:text-foreground"
                  >
                    Deposit
                  </TabsTrigger>
                  <TabsTrigger
                    value="redeem"
                    className="h-8 rounded-md data-[state=active]:text-foreground"
                  >
                    Redeem
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="deposit" className="space-y-3">
                  <div className="flex flex-col">
                    <div className="space-y-2">
                      <Label htmlFor="overview-deposit-amount">Amount</Label>
                      <div className="relative">
                        <Input
                          id="overview-deposit-amount"
                          type="number"
                          placeholder="0"
                          min={0}
                          value={depositAmount || ""}
                          onChange={(e) =>
                            setDepositAmount && setDepositAmount(e.target.value)
                          }
                          className="pr-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                          {miniDeposit && miniDeposit > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                setDepositAmount &&
                                setDepositAmount(miniDeposit.toString())
                              }
                            >
                              Min
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() =>
                              setDepositAmount &&
                              setDepositAmount(
                                userUSDCBalance > 0
                                  ? userUSDCBalance.toFixed(6)
                                  : "0"
                              )
                            }
                            disabled={userUSDCBalance <= 0}
                          >
                            Max
                          </Button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>
                          {depositAmount || 0} {selectedToken || "USDC"}
                        </span>
                        <span>Balance: {userUSDCBalance.toFixed(6)} USDC</span>
                      </div>
                      {miniDeposit && miniDeposit > 0 && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          Minimum deposit: {miniDeposit}{" "}
                          {selectedToken || "USDC"}
                        </p>
                      )}
                    </div>

                    {/* Transaction Fees (compact) */}
                    {depositAmount &&
                      parseFloat(depositAmount) > 0 &&
                      vaultFees && (
                        <div className="glass-card p-3 bg-muted/20 rounded-lg border border-muted/30 mt-1">
                          <h4 className="text-xs font-medium mb-2 flex items-center gap-2">
                            <Info className="w-3.5 h-3.5" /> Transaction Fees
                          </h4>
                          {(() => {
                            const amount = parseFloat(depositAmount || "0");
                            const entryFee =
                              (amount * vaultFees.entryFeeBps) / 10000;
                            const entryPct = `${(
                              vaultFees.entryFeeBps / 100
                            ).toFixed(2)}%`;
                            return (
                              <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Deposit Amount:
                                  </span>
                                  <span className="font-medium">
                                    {amount.toFixed(4)}{" "}
                                    {selectedToken || "USDC"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Entry Fee ({entryPct}):
                                  </span>
                                  <span className="font-medium">
                                    {entryFee.toFixed(4)}{" "}
                                    {selectedToken || "USDC"}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                    <div className="flex-1" />

                    <div className="flex items-center space-x-2 mt-3">
                      <Checkbox
                        id="overview-terms"
                        checked={!!agreedToTerms}
                        className="border-white/50"
                        onCheckedChange={(checked) =>
                          setAgreedToTerms && setAgreedToTerms(checked === true)
                        }
                      />
                      <Label htmlFor="overview-terms" className="text-sm">
                        I agree to the Terms & Conditions
                      </Label>
                    </div>
                    <Button
                      variant="hero"
                      className="w-full mt-3"
                      onClick={onDeposit}
                      disabled={!!depositing}
                    >
                      {depositing ? depositStep || "Processing..." : "Deposit"}
                    </Button>

                    {depositing &&
                      depositSteps &&
                      typeof depositStepIndex === "number" && (
                        <div className="space-y-2 pt-2">
                          <p className="text-xs text-muted-foreground">
                            {depositStep}
                          </p>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{
                                width: `${Math.round(
                                  ((depositStepIndex + 1) /
                                    Math.max(depositSteps.length, 1)) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                  </div>
                </TabsContent>

                <TabsContent value="redeem" className="space-y-3">
                  <div className="flex flex-col">
                    <div className="space-y-2">
                      <Label htmlFor="overview-redeem-amount">
                        Shares to redeem
                      </Label>
                      <div className="relative">
                        <Input
                          id="overview-redeem-amount"
                          type="number"
                          placeholder="0"
                          min={0}
                          value={redeemAmount || ""}
                          onChange={(e) =>
                            setRedeemAmount && setRedeemAmount(e.target.value)
                          }
                          disabled={(userDepositAmount || 0) === 0}
                          className="pr-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        {(userDepositAmount || 0) > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 px-2 text-xs"
                            onClick={() =>
                              setRedeemAmount &&
                              setRedeemAmount(
                                Number(userDepositAmount || 0).toFixed(4)
                              )
                            }
                          >
                            Max
                          </Button>
                        )}
                      </div>
                      {(userDepositAmount || 0) === 0 && (
                        <p className="text-xs text-muted-foreground">
                          You don't have any vault tokens to redeem.
                        </p>
                      )}
                      {miniRedeem &&
                        miniRedeem > 0 &&
                        (userDepositAmount || 0) > 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            Minimum redeem: {miniRedeem} shares
                          </p>
                        )}
                    </div>

                    {/* Redemption Fees (compact) */}
                    {redeemAmount &&
                      parseFloat(redeemAmount) > 0 &&
                      vaultFees && (
                        <div className="glass-card p-3 bg-muted/20 rounded-lg border border-muted/30 mt-2">
                          <h4 className="text-xs font-medium mb-2 flex items-center gap-2">
                            <Info className="w-3.5 h-3.5" /> Redemption Fees
                          </h4>
                          {(() => {
                            const amount = parseFloat(redeemAmount || "0");
                            const exitFee =
                              (amount * (vaultFees.exitFeeBps || 0)) / 10000;
                            const exitPct = `${(
                              (vaultFees.exitFeeBps || 0) / 100
                            ).toFixed(2)}%`;
                            return (
                              <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Redeem Amount:
                                  </span>
                                  <span className="font-medium">
                                    {amount.toFixed(4)} shares
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Exit Fee ({exitPct}):
                                  </span>
                                  <span className="font-medium">
                                    {exitFee.toFixed(4)} shares
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                    <div className="flex-1" />
                    {/* Current balance display above redeem button */}
                    <div className="flex items-center justify-between py-2 text-xs text-muted-foreground mt-3">
                      <span>Your Current Balance</span>
                      <span className="text-foreground font-medium">
                        {userDepositAmount && userDepositAmount > 0
                          ? Number(userDepositAmount).toFixed(4)
                          : "0"}{" "}
                        shares
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={onRedeem}
                      disabled={(userDepositAmount || 0) === 0 || !!isRedeeming}
                    >
                      {isRedeeming
                        ? redeemStep || "Processing..."
                        : "Request Redemption"}
                    </Button>

                    {isRedeeming &&
                      redeemSteps &&
                      typeof redeemStepIndex === "number" && (
                        <div className="space-y-2 pt-2">
                          <p className="text-xs text-muted-foreground">
                            {redeemStep}
                          </p>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{
                                width: `${Math.round(
                                  ((redeemStepIndex + 1) /
                                    Math.max(redeemSteps.length, 1)) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          {/* Your Holdings - directly below Invest (right column) */}
          <Card className="glass-card lg:col-span-2">
            <CardHeader>
              <CardTitle>Your Holdings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <div className="text-xl font-bold text-foreground">
                  {Number(userDepositAmount || 0).toFixed(4)}{" "}
                  {vault.vaultSymbol}
                </div>
                {/* <div className="text-sm text-muted-foreground">
                  ≈ $
                  {(
                    Number(userDepositAmount || 0) *
                      Number(parseFloat(vault.nav || "0")) || 0
                  ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div> */}
              </div>
            </CardContent>
          </Card>

          {/* Financial Performance - directly below Your Holdings (right column) */}
          <Card className="glass-card lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Financial Performance</CardTitle>
                {/* {vaultIndex && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refetchValuation}
                    disabled={valuationLoading}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${
                        valuationLoading ? "animate-spin" : ""
                      }`}
                    />
                    Refresh
                  </Button>
                )} */}
              </div>
            </CardHeader>
            <CardContent>
              {valuationLoading ? (
                <div className="space-y-4">
                  <div className="animate-pulse">
                    <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                    <div className="h-8 bg-muted rounded w-3/4"></div>
                  </div>
                  <div className="animate-pulse">
                    <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                    <div className="h-8 bg-muted rounded w-3/4"></div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="glass-card p-4 rounded-lg mb-2">
                    <p className="text-sm text-muted-foreground mb-1">
                      Total Tokens
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {(totalSupply || 0).toFixed(6)}
                    </p>
                  </div>
                  <div className="glass-card p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">
                      Net Asset Value (NAV)
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {formatCurrency(currentNav)}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fee Structure - directly below Holdings (right column) */}
          <Card className="glass-card lg:col-span-2">
            <CardHeader>
              <CardTitle>Fee Structure</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <FeesTab
                vault={vault}
                feesData={feesData || null}
                loading={!!feesLoading}
                compact
              />
            </CardContent>
          </Card>
        </div>

        {/* Manager Section - spans 3 cols (second row right) + compact Fees below in right track */}
        {/* <div className="lg:col-span-3 space-y-4">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Manager</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="overflow-hidden w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 flex items-center justify-center">
              {vault.creator["avatar"].startsWith("http:") ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M19 21V19C19 17.9391 18.5786 16.9217 17.8284 16.1716C17.0783 15.4214 16.0609 15 15 15H9C7.93913 15 6.92172 15.4214 6.17157 16.1716C5.42143 16.9217 5 17.9391 5 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z"
                    stroke="#fff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <img
                  src={vault.creator["avatar"]}
                  className="w-[100%] h-[100%]"
                />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-1">
                Creator Address
              </p>
              <p className="text-sm font-mono text-foreground">
                {vault.creatorAddress
                  ? `${vault.creatorAddress.slice(
                      0,
                      6
                    )}...${vault.creatorAddress.slice(-4)}`
                  : "0x68c0...e4d1"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  copyToClipboard(
                    vault.creatorAddress || "0x68c0036d855135f3b6ffe4d1"
                  )
                }
                className="h-8 w-8 p-0 rounded-full"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-full"
                onClick={() =>
                  window.open(
                    `https://solscan.io/account/${vault.creatorAddress}`,
                    "_blank"
                  )
                }
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Fee Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <FeesTab
                vault={vault}
                feesData={feesData || null}
                loading={!!feesLoading}
                compact
              />
            </CardContent>
          </Card>
        </div> */}
      </div>

      {/* Asset Managers Section */}
      {/* <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Asset Managers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">A</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-1">
                        Asset Manager 1
                      </p>
                      <p className="text-sm font-mono text-foreground">
                        {vault.vaultAddress
                          ? `${vault.vaultAddress.slice(
                            0,
                            6
                          )}...${vault.vaultAddress.slice(-4)}`
                          : "0x68c0...e4d1"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            vault.vaultAddress || "0x68c0036d855135f3b6ffe4d1"
                          )
                        }
                        className="h-8 w-8 p-0 rounded-full"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-full"
                        onClick={() =>
                          window.open(
                            `https://solscan.io/account/${vault.vaultAddress}`,
                            "_blank"
                          )
                        }
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">A</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-1">
                        Asset Manager 2
                      </p>
                      <p className="text-sm font-mono text-foreground">
                        {vault.factoryAddress
                          ? `${vault.factoryAddress.slice(
                            0,
                            6
                          )}...${vault.factoryAddress.slice(-4)}`
                          : "0x68c0...e4d1"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            vault.factoryAddress || "0x68c0036d855135f3b6ffe4d1"
                          )
                        }
                        className="h-8 w-8 p-0 rounded-full"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-full"
                        onClick={() =>
                          window.open(
                            `https://solscan.io/account/${vault.factoryAddress}`,
                            "_blank"
                          )
                        }
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card> */}
    </div>
  );
};

export default OverviewTab;
