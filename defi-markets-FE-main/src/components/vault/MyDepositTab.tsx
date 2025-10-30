import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Copy,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDown,
  Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/helpers";
import { RootState, useAppSelector } from "@/store";
import { MyDepositTabSkeleton } from "../skeleton/mydeposittab-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UserDepositData {
  totalDeposited: number;
  totalRedeemed: number;
  currentValue: number;
  totalReturns: number;
  vaultSymbol: string;
  userAddress: string;
}

interface MyDepositTabProps {
  depositData: UserDepositData | null;
  loading?: boolean;
}

const MyDepositTab = ({ depositData, loading = false }: MyDepositTabProps) => {
  const { toast } = useToast();
  // const { isConnected: isAuthenticated } = useAppKitAccount();
  const { isAuthenticated } = useAppSelector((state: RootState) => state.auth);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Address copied to clipboard",
    });
  };

  const getReturnsColor = (returns: number) => {
    return returns >= 0 ? "text-green-500" : "text-red-500";
  };

  const getReturnsIcon = (returns: number) => {
    return returns >= 0 ? (
      <TrendingUp className="w-4 h-4 text-green-500" />
    ) : (
      <TrendingDown className="w-4 h-4 text-red-500" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Deposit Overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>My Deposit Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {!isAuthenticated ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                <Wallet className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Wallet Not Connected
              </h3>
              <p className="text-muted-foreground mb-4">
                Please connect your wallet to view your deposit information.
              </p>
            </div>
          ) : loading ? (
            <MyDepositTabSkeleton />
          ) : !depositData ? (
            <p className="text-muted-foreground">No deposit data available</p>
          ) : (
            <div className="space-y-6">
              {/* User Address */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-surface-2/50">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Your Address
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">
                      {depositData.userAddress.slice(0, 6)}...
                      {depositData.userAddress.slice(-4)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(depositData.userAddress)}
                      className="h-6 w-6 p-0 rounded-full hover:bg-surface-2"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {depositData.vaultSymbol}
                </Badge>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Total Deposited */}
                <div className="p-4 rounded-lg bg-surface-2/50">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDown className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">
                      Total Deposited
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(depositData.totalDeposited)}
                  </p>
                </div>

                {/* Total Redeemed */}
                <div className="p-4 rounded-lg bg-surface-2/50">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpRight className="w-4 h-4 text-orange-500" />
                    <span className="text-sm text-muted-foreground">
                      Total Redeemed
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(depositData.totalRedeemed)}
                  </p>
                </div>

                {/* Current Value */}
                <div className="p-4 rounded-lg bg-surface-2/50">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">
                      Current Value
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(depositData.currentValue)}
                  </p>
                </div>

                {/* Total Returns */}
                <div className="p-4 rounded-lg bg-surface-2/50">
                  <div className="flex items-center gap-2 mb-2">
                    {getReturnsIcon(depositData.totalReturns)}
                    <span className="text-sm text-muted-foreground">
                      Total Returns
                    </span>
                  </div>
                  <p
                    className={`text-2xl font-bold ${getReturnsColor(
                      depositData.totalReturns
                    )}`}
                  >
                    {formatCurrency(depositData.totalReturns)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyDepositTab;
