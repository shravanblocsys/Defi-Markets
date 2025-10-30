import { Skeleton } from "../ui/skeleton";

export const FinancialsTabSkeleton = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="glass-card p-4 rounded-lg space-y-2">
        <Skeleton className="h-4 w-40 border border-white/20" />
        <Skeleton className="h-7 w-32 border border-white/20" />
      </div>
      <div className="glass-card p-4 rounded-lg space-y-2">
        <Skeleton className="h-4 w-40 border border-white/20" />
        <Skeleton className="h-7 w-32 border border-white/20" />
      </div>
    </div>
  );
};
