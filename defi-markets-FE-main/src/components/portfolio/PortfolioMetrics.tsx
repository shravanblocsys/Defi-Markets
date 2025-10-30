import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatAmount } from "@/lib/helpers";

interface PortfolioMetricsProps {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  weekChange: number;
  weekChangePercent: number;
  averageAPY: number;
  vaultCount: number;
  loading: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}

const PortfolioMetrics: React.FC<PortfolioMetricsProps> = ({
  totalValue,
  dayChange,
  dayChangePercent,
  weekChange,
  weekChangePercent,
  averageAPY,
  vaultCount,
  loading,
  lastUpdated,
  onRefresh,
}) => {
  const isPositiveDay = dayChange >= 0;
  const isPositiveWeek = weekChange >= 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      {/* Total Portfolio Value */}
      <Card className="glass-card col-span-1 lg:col-span-2">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl sm:text-2xl lg:text-3xl font-bold">
                {formatCurrency(totalValue)}
              </CardTitle>
              <p className="text-sm sm:text-base lg:text-lg text-muted-foreground">
                Total Portfolio Value
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-4">
            {/* 24h Change */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPositiveDay ? (
                  <TrendingUp className="w-4 h-4 text-success" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-error" />
                )}
                <span className="font-medium text-sm sm:text-base">
                  {formatCurrency(Math.abs(dayChange))}
                </span>
                <Badge
                  variant={isPositiveDay ? "default" : "destructive"}
                  className="text-xs"
                >
                  {isPositiveDay ? "+" : ""}{dayChangePercent.toFixed(2)}%
                </Badge>
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">
                24h Change
              </span>
            </div>

            {/* 7d Change */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPositiveWeek ? (
                  <TrendingUp className="w-4 h-4 text-success" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-error" />
                )}
                <span className="font-medium text-sm sm:text-base">
                  {formatCurrency(Math.abs(weekChange))}
                </span>
                <Badge
                  variant={isPositiveWeek ? "default" : "destructive"}
                  className="text-xs"
                >
                  {isPositiveWeek ? "+" : ""}{weekChangePercent.toFixed(2)}%
                </Badge>
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">
                7d Change
              </span>
            </div>

            {/* Last Updated */}
            {lastUpdated && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Stats */}
      <div className="space-y-4 sm:space-y-6">
        <Card className="glass-card">
          <CardHeader className="p-4">
            <CardTitle className="text-lg">Portfolio Stats</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Vaults</span>
              <span className="font-medium">{vaultCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Avg APY</span>
              <span className="font-medium text-success">
                {averageAPY.toFixed(2)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="p-4">
            <CardTitle className="text-lg">Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">24h</span>
                <span className={`text-sm font-medium ${
                  isPositiveDay ? "text-success" : "text-error"
                }`}>
                  {isPositiveDay ? "+" : ""}{dayChangePercent.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">7d</span>
                <span className={`text-sm font-medium ${
                  isPositiveWeek ? "text-success" : "text-error"
                }`}>
                  {isPositiveWeek ? "+" : ""}{weekChangePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PortfolioMetrics;
