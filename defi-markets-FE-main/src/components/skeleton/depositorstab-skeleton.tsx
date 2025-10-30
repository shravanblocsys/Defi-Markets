import { Skeleton } from "../ui/skeleton";

export const DepositorsTabSkeleton = () => {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-2/50">
        <div className="flex items-center gap-2">
          {/* Avatar skeleton */}
          <Skeleton className="w-12 h-12 rounded-full" />

          {/* User info skeleton */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          </div>
        </div>

        {/* Holdings info skeleton */}
        <div className="text-right">
          <div className="space-y-1">
            <Skeleton className="h-3 w-20 ml-auto" />
            <Skeleton className="h-5 w-24 ml-auto" />
            <Skeleton className="h-3 w-16 ml-auto" />
          </div>
        </div>
      </div>
    </div>
  );
};
