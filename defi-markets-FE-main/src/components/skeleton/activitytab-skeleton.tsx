import { Skeleton } from "../ui/skeleton";

export const ActivityTabSkeleton = () => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 glass-surface rounded-lg gap-3 sm:gap-0">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Icon container */}
        <Skeleton className="w-8 h-8 rounded-lg border border-white/20" />
        <div className="space-y-2">
          {/* Transaction type */}
          <Skeleton className="h-4 w-24 border border-white/20" />
          {/* Vault name and symbol */}
          <Skeleton className="h-3 w-32 border border-white/20" />
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
        {/* Amount area (matches commented section in ActivityBar) */}
        <div className="text-left sm:text-right space-y-2 w-full sm:w-auto">
          <Skeleton className="h-4 w-24 sm:w-28 ml-0 sm:ml-auto border border-white/20" />
          <Skeleton className="h-3 w-28 sm:w-32 ml-0 sm:ml-auto border border-white/20" />
        </div>
        {/* Date and signature button area */}
        <div className="text-left sm:text-right space-y-2 w-full sm:w-auto">
          {/* Date */}
          <Skeleton className="h-3 w-20 ml-0 sm:ml-auto border border-white/20" />
          {/* Signature button */}
          <Skeleton className="h-6 w-20 ml-0 sm:ml-auto border border-white/20" />
        </div>
      </div>
    </div>
  );
};
