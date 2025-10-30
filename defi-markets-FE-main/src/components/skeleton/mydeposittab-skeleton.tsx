import { Skeleton } from "../ui/skeleton";

export const MyDepositTabSkeleton = () => {
  return (
    <div className="space-y-6">
      {/* User Address Skeleton */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-2/50">
        <div>
          <Skeleton className="h-3 w-20 mb-1" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>

      {/* Key Metrics Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 1 }, (_, index) => (
          <div key={index} className="p-4 rounded-lg bg-surface-2/50">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="w-4 h-4" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
};
