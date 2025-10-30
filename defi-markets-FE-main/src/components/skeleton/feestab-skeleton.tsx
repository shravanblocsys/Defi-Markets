import { Skeleton } from "../ui/skeleton";

export const FeesTabSkeleton = () => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center p-3 rounded-lg bg-surface-2/50">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-14" />
          </div>
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="text-right">
          <Skeleton className="h-5 w-16 ml-auto" />
        </div>
      </div>
    </div>
  );
};
