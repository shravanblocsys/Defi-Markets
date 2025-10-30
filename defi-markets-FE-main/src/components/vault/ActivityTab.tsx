import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Copy,
  ExternalLink,
  ArrowDown,
  ArrowUpRight,
  Plus,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ActivityBar } from "@/components/ui/activity-bar";
import { ActivityTabSkeleton } from "../skeleton/activitytab-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ActivityItem {
  _id: string;
  action: string;
  description: string;
  performedBy: {
    _id: string;
    username: string;
    email: string;
    name: string;
  };
  vaultId: {
    _id: string;
    vaultName: string;
    vaultSymbol: string;
  };
  relatedEntity: string;
  metadata?: {
    [key: string]: string | number;
  };
  transactionSignature?: string;
  createdAt: string;
  updatedAt: string;
  __v?: number;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

interface ActivityTabProps {
  activityData: ActivityItem[] | null;
  loading?: boolean;
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
}

const getActionIcon = (action: string) => {
  switch (action) {
    case "deposit_completed":
      return <ArrowDown className="w-4 h-4 text-green-500" />;
    case "redeem_completed":
      return <ArrowUpRight className="w-4 h-4 text-red-500" />;
    case "vault_created":
      return <Plus className="w-4 h-4 text-blue-500" />;
    default:
      return <User className="w-4 h-4 text-muted-foreground" />;
  }
};

const getActionBadgeVariant = (action: string) => {
  switch (action) {
    case "deposit_completed":
      return "default" as const;
    case "redeem_completed":
      return "destructive" as const;
    case "vault_created":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);

// Skeleton moved to dedicated component: ActivityBarSkeleton

const ActivityTab = ({
  activityData,
  loading = false,
  pagination,
  onPageChange,
}: ActivityTabProps) => {
  const { toast } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Transaction signature copied to clipboard",
    });
  };
  return (
    <div className="space-y-6">
      {/* Activity Log */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <ActivityTabSkeleton />
            </div>
          ) : !activityData || activityData.length === 0 ? (
            <p className="text-muted-foreground">No activity data available</p>
          ) : (
            <div className="space-y-4">
              {activityData.map((activity, index) => {
                return (
                  <ActivityBar
                    key={activity._id}
                    id={activity._id}
                    action={activity.action}
                    amount={
                      activity.metadata?.amount
                        ? Number(activity.metadata.amount)
                        : 0
                    }
                    createdAt={activity.createdAt}
                    netStablecoinAmount={Number(
                      activity.metadata?.netStablecoinAmount || 0
                    )}
                    transactionSignature={activity.transactionSignature}
                    vaultName={activity.vaultId?.vaultName || ""}
                    vaultSymbol={activity.vaultId?.vaultSymbol || ""}
                    vaultTokensMinted={Number(
                      activity.metadata?.vaultTokensMinted || 0
                    )}
                    vaultTokensRedeemed={Number(
                      activity.metadata?.vaultTokensRedeemed || 0
                    )}
                  />
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/30">
              <div className="text-sm text-muted-foreground">
                Showing{" "}
                {(pagination.currentPage - 1) * pagination.itemsPerPage + 1} to{" "}
                {Math.min(
                  pagination.currentPage * pagination.itemsPerPage,
                  pagination.totalItems
                )}{" "}
                of {pagination.totalItems} activities
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.(pagination.currentPage - 1)}
                  disabled={pagination.currentPage <= 1 || loading}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from(
                    { length: Math.min(5, pagination.totalPages) },
                    (_, i) => {
                      let pageNum;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (pagination.currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (
                        pagination.currentPage >=
                        pagination.totalPages - 2
                      ) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = pagination.currentPage - 2 + i;
                      }

                      return (
                        <Button
                          key={pageNum}
                          variant={
                            pageNum === pagination.currentPage
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => onPageChange?.(pageNum)}
                          disabled={loading}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    }
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.(pagination.currentPage + 1)}
                  disabled={
                    pagination.currentPage >= pagination.totalPages || loading
                  }
                  className="flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ActivityTab;
