import type { Vault } from "@/types/store";
import { Badge } from "@/components/ui/badge";
import { FeesTabSkeleton } from "../skeleton/feestab-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FeeData {
  feeRate?: number;
  minFeeRate?: number;
  maxFeeRate?: number;
  description: string;
  type: string;
}

interface FeesData {
  fees: FeeData[];
  vaultFees: number;
}

interface FeesTabProps {
  vault: Vault;
  feesData: FeesData | null;
  loading?: boolean;
  compact?: boolean;
}

const getFeeTypeLabel = (type: string) => {
  switch (type) {
    case "entry_fee":
      return "Entry Fee";
    case "exit_fee":
      return "Exit Fee";
    default:
      return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }
};

const formatFeeRate = (fee: FeeData) => {
  if (fee.minFeeRate !== undefined && fee.maxFeeRate !== undefined) {
    return `${fee.minFeeRate}% - ${fee.maxFeeRate}%`;
  }
  if (fee.feeRate !== undefined) {
    return `${fee.feeRate}%`;
  }
  return "N/A";
};

const FeesTab = ({
  vault,
  feesData,
  loading = false,
  compact = false,
}: FeesTabProps) => {
  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {/* Fee Structure */}
      <Card className="bg-transparent border-none">
        <CardContent className={compact ? "py-3 text-xs" : "py-4 text-sm"}>
          {loading ? (
            <FeesTabSkeleton />
          ) : !feesData || !feesData.fees || feesData.fees.length === 0 ? (
            <div className={compact ? "space-y-2" : "space-y-3"}>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Management Fee</span>
                <span className="font-medium">
                  {(vault.apy || 0).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Performance Fee</span>
                <span className="font-medium">0.00%</span>
              </div>
            </div>
          ) : (
            <div className={compact ? "space-y-2" : "space-y-3"}>
              {feesData.fees
                .filter(
                  (fee) =>
                    fee.type !== "vault_creation_fee" &&
                    fee.type !== "management"
                )
                .map((fee, index) => (
                  <div
                    key={index}
                    className={
                      compact
                        ? "flex justify-between items-center p-2 rounded-lg bg-surface-2/50"
                        : "flex justify-between items-center p-2.5 rounded-lg bg-surface-2/50"
                    }
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={
                            compact
                              ? "font-medium text-foreground"
                              : "font-medium text-foreground"
                          }
                        >
                          {getFeeTypeLabel(fee.type)}
                        </span>
                        {/* <Badge
                          variant="outline"
                          className={compact ? "text-[10px]" : "text-xs"}
                        >
                          {fee.type}
                        </Badge> */}
                      </div>
                      <p
                        className={
                          compact
                            ? "text-[11px] text-muted-foreground"
                            : "text-sm text-muted-foreground"
                        }
                      >
                        {fee.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={
                          compact
                            ? "font-bold text-foreground text-[12px]"
                            : "font-bold text-foreground"
                        }
                      >
                        {formatFeeRate(fee)}
                      </span>
                    </div>
                  </div>
                ))}

              {/* Vault Fees Display */}
              <div
                className={
                  compact
                    ? "flex justify-between items-center p-2 rounded-lg bg-surface-2/50"
                    : "flex justify-between items-center p-2.5 rounded-lg bg-surface-2/50"
                }
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={
                        compact
                          ? "font-medium text-foreground"
                          : "font-medium text-foreground"
                      }
                    >
                      Management Fees
                    </span>
                    <Badge
                      variant="outline"
                      className={compact ? "text-[10px]" : "text-xs"}
                    >
                      total
                    </Badge>
                  </div>
                  <p
                    className={
                      compact
                        ? "text-[11px] text-muted-foreground"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    Total Management fees in basis points
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={
                      compact
                        ? "font-bold text-foreground text-[12px]"
                        : "font-bold text-foreground"
                    }
                  >
                    {(feesData.vaultFees / 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FeesTab;
