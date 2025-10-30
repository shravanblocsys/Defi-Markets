import { Button } from "@/components/ui/button";
import { ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { formatAmount, getSolscanUrl, getTransactionType } from "@/lib/helpers";
import { useState } from "react";

type TActivityBar = {
  id: string;
  action: string;
  amount: number;
  vaultName: string;
  createdAt: string;
  vaultSymbol: string;
  netStablecoinAmount: number;
  vaultTokensMinted: number;
  vaultTokensRedeemed: number;
  transactionSignature: string;
  signatureArray?: string[];
};

export const ActivityBar = ({
  id,
  action,
  vaultName,
  vaultSymbol,
  amount,
  netStablecoinAmount,
  vaultTokensMinted,
  vaultTokensRedeemed,
  createdAt,
  transactionSignature,
  signatureArray = [],
}: TActivityBar) => {
  const txType = getTransactionType(action);
  const IconComponent = txType.icon;
  const [isSignaturesExpanded, setIsSignaturesExpanded] = useState(false);
  return (
    <div
      key={id}
      className="flex flex-col p-3 sm:p-4 glass-surface rounded-lg gap-3"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`p-2 rounded-lg  ${txType.color}`}>
            <IconComponent className="w-4 h-4" />
          </div>
          <div>
            <p className="font-medium capitalize text-sm sm:text-base">
              {txType.type}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {vaultName} ({vaultSymbol})
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <div className="text-left sm:text-right">
            {/* <p className="font-medium text-sm sm:text-base">
              {action.includes("deposit")
                ? `$${formatAmount(Number(amount || 0))}`
                : `$${formatAmount(Number(netStablecoinAmount || 0))}`}
            </p> */}
            {/* <p className="text-xs sm:text-sm text-muted-foreground">
              {action.includes("deposit")
                ? `+${formatAmount(
                    Number(vaultTokensMinted || 0),
                    6
                  )} ${vaultSymbol}`
                : `-${formatAmount(
                    Number(vaultTokensRedeemed || 0),
                    6
                  )} ${vaultSymbol}`}
            </p> */}
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs sm:text-sm text-muted-foreground">
              {new Date(createdAt).toLocaleDateString()}
            </p>
            {transactionSignature ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs p-1 h-auto"
                onClick={() =>
                  window.open(getSolscanUrl(transactionSignature), "_blank")
                }
              >
                {transactionSignature.slice(0, 8)}...
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                No signature
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Swap Signatures Section */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Swap Signatures</span>
            {signatureArray && signatureArray.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({signatureArray.length})
              </span>
            )}
          </div>
          {signatureArray && signatureArray.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs p-1 h-auto"
              onClick={() => setIsSignaturesExpanded(!isSignaturesExpanded)}
            >
              {isSignaturesExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Swap Signature is not available
            </span>
          )}
        </div>

        {isSignaturesExpanded &&
          signatureArray &&
          signatureArray.length > 0 && (
            <div className="mt-3 space-y-2">
              {signatureArray.map((signature, index) => (
                <div
                  key={signature}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                >
                  <span className="text-xs font-mono text-muted-foreground">
                    {signature.slice(0, 12)}...{signature.slice(-8)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs p-1 h-auto"
                    onClick={() =>
                      window.open(getSolscanUrl(signature), "_blank")
                    }
                  >
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
};
