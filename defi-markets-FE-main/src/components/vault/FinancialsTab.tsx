import { formatCurrency } from "@/lib/helpers";
import { FinancialsTabSkeleton } from "../skeleton/financialstab-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVaultValuation } from "@/hooks/useVaultValuation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FinancialsData {
  grossAssetValue: number;
  netAssetValue: number;
}

interface FinancialsTabProps {
  data: FinancialsData | null;
  loading?: boolean;
  vaultIndex?: number;
}

const FinancialsTab = ({
  data,
  loading = false,
  vaultIndex,
}: FinancialsTabProps) => {
  const {
    gav,
    nav,
    loading: valuationLoading,
    refetch: refetchValuation,
  } = useVaultValuation(vaultIndex);

  // Use blockchain data if available, otherwise fall back to API data
  const displayData = vaultIndex
    ? {
        grossAssetValue: gav,
        netAssetValue: nav,
      }
    : data;

  const isLoading = loading || valuationLoading;

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Financial Performance</CardTitle>
          {vaultIndex && (
            <Button
              variant="outline"
              size="sm"
              onClick={refetchValuation}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <FinancialsTabSkeleton />
        ) : !displayData ? (
          <p className="text-muted-foreground">No financial data available</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-card p-4 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">
                Gross Asset Value (GAV)
              </p>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(displayData.grossAssetValue)}
              </p>
            </div>
            <div className="glass-card p-4 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">
                Net Asset Value (NAV)
              </p>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(displayData.netAssetValue)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FinancialsTab;
