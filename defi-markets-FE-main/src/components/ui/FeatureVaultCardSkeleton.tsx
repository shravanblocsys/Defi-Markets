import { cn } from "@/lib/utils";

interface FeatureVaultCardSkeletonProps {
  className?: string;
}

const FeatureVaultCardSkeleton = ({ className }: FeatureVaultCardSkeletonProps) => {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/10 to-black/80" />
      
      {/* Content */}
      <div className="relative z-10 p-6 space-y-4">
        {/* Header with TVL and APY */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="h-3 w-8 bg-white/20 rounded animate-pulse" />
            <div className="h-5 w-16 bg-white/30 rounded animate-pulse" />
          </div>
          <div className="space-y-1 text-right">
            <div className="h-3 w-8 bg-white/20 rounded animate-pulse ml-auto" />
            <div className="h-5 w-12 bg-white/30 rounded animate-pulse ml-auto" />
          </div>
        </div>

        {/* Chart skeleton */}
        <div className="relative">
          <div className="h-16 bg-white/10 rounded animate-pulse" />
        </div>

        {/* Vault Name and Symbol */}
        <div className="space-y-2">
          <div className="h-5 w-3/4 bg-white/20 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-white/15 rounded animate-pulse" />
        </div>

        {/* Asset Icons skeleton */}
        <div className="flex space-x-2">
          {[1, 2, 3].map((index) => (
            <div 
              key={index} 
              className="w-6 h-6 rounded-full bg-white/20 animate-pulse"
            />
          ))}
        </div>

        {/* Owner skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-3 w-12 bg-white/20 rounded animate-pulse" />
            <div className="h-4 w-24 bg-white/25 rounded animate-pulse" />
          </div>
          <div className="w-8 h-8 rounded-full bg-white/20 animate-pulse" />
        </div>

        {/* Action Button skeleton */}
        <div className="w-full h-10 bg-white/20 rounded animate-pulse" />
      </div>
    </div>
  );
};

export default FeatureVaultCardSkeleton;
