import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/helpers";
import { Progress } from "@/components/ui/progress";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { PortfolioTabSkeleton } from "../skeleton/portfoiliotab-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Asset {
  assetName: string;
  logoUrl: string;
  percentageAllocation: number;
  price: number;
  change24h: number;
}

interface PortfolioData {
  vaultSymbol: string;
  assets: Asset[];
}

interface PortfolioTabProps {
  portfolioData: PortfolioData | null;
  loading?: boolean;
}

const PortfolioTab = ({
  portfolioData,
  loading = false,
}: PortfolioTabProps) => {
  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Portfolio Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <PortfolioTabSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (
    !portfolioData ||
    !portfolioData.assets ||
    portfolioData.assets.length === 0
  ) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Portfolio Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No portfolio data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Portfolio Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Assets List */}
            <div className="space-y-4">
              {portfolioData.assets.map((asset, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-lg bg-surface-2/50"
                >
                  <div className="flex items-center gap-4">
                    {/* Asset Logo */}
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-2 flex items-center justify-center">
                      <img
                        src={asset.logoUrl}
                        alt={asset.assetName}
                        className="w-[100%] h-[100%] object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = "none";
                          target.nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                      <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center hidden">
                        <span className="text-xs font-bold text-primary">
                          {asset.assetName.charAt(0)}
                        </span>
                      </div>
                    </div>

                    {/* Asset Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">
                          {asset.assetName}
                        </h3>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Price: {formatCurrency(asset.price)}</span>
                        <div className="flex items-center gap-1">
                          {asset.change24h >= 0 ? (
                            <ArrowUpRight className="w-3 h-3 text-success" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3 text-error" />
                          )}
                          <span
                            className={
                              asset.change24h >= 0
                                ? "text-success"
                                : "text-error"
                            }
                          >
                            {asset.change24h >= 0 ? "+" : ""}
                            {asset.change24h.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Allocation Progress */}
                  <div className="w-32 flex flex-col items-end gap-[0.5rem]">
                    <Badge variant="outline" className="w-max text-xs">
                      {asset.percentageAllocation / 100}%
                    </Badge>
                    <Progress
                      value={asset.percentageAllocation / 100}
                      className="h-2"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Portfolio Summary */}
            <div className="pt-4 border-t border-border/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    Total Assets
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {portfolioData.assets.length}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    Largest Allocation
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {Math.max(
                      ...portfolioData.assets.map((a) => a.percentageAllocation)
                    ) / 100}
                    %
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    Vault Symbol
                  </p>
                  <p className="text-2xl font-bold text-accent">
                    {portfolioData.vaultSymbol}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortfolioTab;
