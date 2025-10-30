import React from "react";
import { createPortal } from "react-dom";
import { CheckCircle, ExternalLink, X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { SOLANA_NETWORKS } from "@/lib/solana";

interface SuccessPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  transactionSignature: string;
  vaultName: string;
  swapSignatures?: string[];
}

export const SuccessPopup: React.FC<SuccessPopupProps> = ({
  isOpen,
  onClose,
  title,
  description,
  transactionSignature,
  vaultName,
  swapSignatures,
}) => {
  if (!isOpen) return null;

  const handleViewTransaction = () => {
    const base = `https://solscan.io/tx/${transactionSignature}`;
    const network = import.meta.env.VITE_SOLANA_NETWORK as string | undefined;
    const isDevnet =
      (network || SOLANA_NETWORKS.MAINNET) === SOLANA_NETWORKS.DEVNET;
    const solscanUrl = isDevnet ? `${base}?cluster=devnet` : base;
    window.open(solscanUrl, "_blank", "noopener,noreferrer");
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] grid place-items-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Popup */}
      <div className="relative glass-card rounded-2xl shadow-2xl border border-white/10 p-4 sm:p-6 lg:p-8 max-w-sm sm:max-w-md lg:max-w-lg w-full mx-2 sm:mx-4 animate-in fade-in-0 zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5 text-foreground" />
        </button>

        {/* Success Icon */}
        <div className="flex justify-center mb-4 sm:mb-6">
          <div className="relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-success/20 rounded-full flex items-center justify-center">
              <CheckCircle className="h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14 text-success" />
            </div>
            {/* Animated ring */}
            <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 border-4 border-success/30 rounded-full animate-ping opacity-20" />
          </div>
        </div>

        {/* Content */}
        <div className="text-center space-y-3 sm:space-y-4 lg:space-y-6">
          <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground font-architekt">
            {title}
          </h3>

          <p className="text-sm sm:text-base lg:text-lg text-muted-foreground leading-relaxed font-architekt">
            {description}
          </p>

          {/* Vault Name */}
          <div className="glass-surface rounded-lg p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground mb-1 font-architekt">
              Vault Name
            </p>
            <p className="font-semibold text-sm sm:text-base lg:text-lg text-foreground font-architekt break-words">
              {vaultName}
            </p>
          </div>

          {/* Transaction Info */}
          <div className="glass-surface rounded-lg p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground mb-1 font-architekt">
              Transaction ID
            </p>
            <p className="font-mono text-xs sm:text-sm lg:text-base text-foreground break-all">
              {transactionSignature.slice(0, 8)}...
              {transactionSignature.slice(-8)}
            </p>
          </div>

          {/* Swap Signatures */}
          {swapSignatures && swapSignatures.length > 0 && (
            <div className="glass-surface rounded-lg p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2 font-architekt">
                Swap Signatures
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {swapSignatures.map((signature) => (
                  <div
                    key={signature}
                    className="flex items-center justify-between"
                  >
                    <p className="font-mono text-xs sm:text-sm text-foreground break-all flex-1 mr-2">
                      {signature.slice(0, 8)}...{signature.slice(-8)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const base = `https://solscan.io/tx/${signature}`;
                        const network = import.meta.env.VITE_SOLANA_NETWORK as
                          | string
                          | undefined;
                        const isDevnet =
                          (network || SOLANA_NETWORKS.MAINNET) ===
                          SOLANA_NETWORKS.DEVNET;
                        const solscanUrl = isDevnet
                          ? `${base}?cluster=devnet`
                          : base;
                        window.open(
                          solscanUrl,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }}
                      className="h-6 w-6 p-0 hover:bg-white/10 hover:text-white"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2 sm:pt-4">
            <Button
              onClick={handleViewTransaction}
              variant="hero"
              className="flex-1 font-architekt"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Solscan
            </Button>

            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 font-architekt"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
