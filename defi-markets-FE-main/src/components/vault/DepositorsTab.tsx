import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, getSolscanAccountUrl } from "@/lib/helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DepositorsTabSkeleton } from "../skeleton/depositorstab-skeleton";

interface UserProfile {
  username: string;
  name: string;
  avatar: string;
}

interface Holding {
  walletAddress: string;
  totalHolding: number;
  sharesHeld: number;
  userProfile: UserProfile;
}

interface DepositorsData {
  totalUsers: number;
  holdings: Holding[];
}

interface DepositorsTabProps {
  depositorsData: DepositorsData | null;
  loading?: boolean;
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);

const DepositorsTab = ({
  depositorsData,
  loading = false,
}: DepositorsTabProps) => {
  const { toast } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Address copied to clipboard",
    });
  };

  return (
    <div className="space-y-6">
      {/* Depositors Overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Depositor Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <DepositorsTabSkeleton />
          ) : !depositorsData ||
            !depositorsData.holdings ||
            depositorsData.holdings.length === 0 ? (
            <p className="text-muted-foreground">No depositor data available</p>
          ) : (
            <div className="space-y-6">
              {/* Depositors List */}
              <div className="space-y-4">
                {depositorsData.holdings.map((holding, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-lg bg-surface-2/50"
                  >
                    <div className="flex items-center gap-4">
                      {/* User Avatar */}
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-2 flex items-center justify-center">
                        <img
                          src={holding.userProfile.avatar}
                          alt={holding.userProfile.name}
                          className="w-12 h-12 object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                            target.nextElementSibling?.classList.remove(
                              "hidden"
                            );
                          }}
                        />
                        <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center hidden">
                          <User className="w-6 h-6 text-white" />
                        </div>
                      </div>

                      {/* User Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-foreground">
                            {holding.userProfile.name}
                          </h4>
                          <Badge variant="outline" className="text-xs">
                            @{holding.userProfile.username}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-mono">
                            {holding.walletAddress.slice(0, 6)}...
                            {holding.walletAddress.slice(-4)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              copyToClipboard(holding.walletAddress)
                            }
                            className="h-6 w-6 p-0 rounded-full"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 rounded-full"
                            onClick={() =>
                              window.open(
                                getSolscanAccountUrl(holding.walletAddress),
                                "_blank"
                              )
                            }
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Holdings Info */}
                    <div className="text-right">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          Total Holding
                        </p>
                        <p className="font-bold text-foreground">
                          {formatCurrency(holding.totalHolding)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(holding.sharesHeld)} shares
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DepositorsTab;
