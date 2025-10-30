import React from 'react';
import { CheckCircle, ExternalLink, X } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { getSolscanUrl } from '@/lib/solana';

interface SuccessPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  transactionSignature: string;
  actionType?: string; // e.g., "Fee Update", "Vault Creation", etc.
}

export const SuccessPopup: React.FC<SuccessPopupProps> = ({
  isOpen,
  onClose,
  title,
  description,
  transactionSignature,
  actionType = "Transaction",
}) => {
  if (!isOpen) return null;

  const handleViewTransaction = () => {
    const solscanUrl = getSolscanUrl(transactionSignature);
    window.open(solscanUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Popup */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-8 max-w-md w-full mx-4 animate-in fade-in-0 zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
        >
          <X className="h-4 w-4 text-gray-500" />
        </button>

        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
            {/* Animated ring */}
            <div className="absolute inset-0 w-20 h-20 border-4 border-green-200 dark:border-green-800 rounded-full animate-ping opacity-20" />
          </div>
        </div>

        {/* Content */}
        <div className="text-center space-y-4">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
            {title}
          </h3>
          
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            {description}
          </p>

          {/* Action Type */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Action Type</p>
            <p className="font-semibold text-gray-900 dark:text-white">{actionType}</p>
          </div>

          {/* Transaction Info */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Transaction ID</p>
            <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
              {transactionSignature.slice(0, 8)}...{transactionSignature.slice(-8)}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              onClick={handleViewTransaction}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Solscan
            </Button>
            
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
