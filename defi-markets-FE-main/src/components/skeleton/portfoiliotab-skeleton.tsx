import { Skeleton } from "../ui/skeleton";

export const PortfolioTabSkeleton = () => {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {[...Array(1)].map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-4 rounded-lg bg-surface-2/50"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-2 flex items-center justify-center">
                <Skeleton className="w-10 h-10 rounded-full" />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>

            <div className="w-32 flex flex-col items-end gap-[0.5rem]">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-2 w-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-border/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="text-center">
              <Skeleton className="h-3 w-24 mx-auto mb-1" />
              <Skeleton className="h-6 w-20 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
