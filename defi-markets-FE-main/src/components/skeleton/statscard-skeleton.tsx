import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardSkeletonProps {
  className?: string;
  showDivider?: boolean;
}

const StatsCardSkeleton = ({
  className,
  showDivider = false,
}: StatsCardSkeletonProps) => {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center py-8",
        className
      )}
    >
      {showDivider && (
        <div className="absolute left-0 top-0 bottom-0 w-px glow-line" />
      )}

      <div className="flex flex-col items-center justify-center space-y-3 w-full">
        <Skeleton className="h-10 md:h-12 w-40 md:w-48 rounded-md" />
        <Skeleton className="h-3 w-28 rounded" />
        <Skeleton className="h-2 w-16 rounded" />
      </div>
    </div>
  );
};

export default StatsCardSkeleton;
