import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | ReactNode;
  change?: string;
  // icon: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
  showDivider?: boolean;
}

const StatsCard = ({
  title,
  value,
  change,
  // icon,
  trend = "neutral",
  className,
  showDivider = false,
}: StatsCardProps) => {
  const getTrendColor = () => {
    switch (trend) {
      case "up":
        return "text-success";
      case "down":
        return "text-error";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center py-8",
        className
      )}
    >
      {/* Glowing divider line */}
      {showDivider && (
        <div className="absolute left-0 top-0 bottom-0 w-px glow-line" />
      )}

      <div className="flex flex-col items-center justify-center space-y-3">
        {/* Large value with digital font styling */}
        <div className="text-4xl md:text-7xl font-bold text-white font-architekt tracking-wider">
          {value}
        </div>

        {/* Title with uppercase styling */}
        <div className="text-md font-medium text-white/80 font-architekt tracking-widest uppercase">
          {title}
        </div>

        {/* Optional change indicator */}
        {change && (
          <div className={cn("text-xs font-medium", getTrendColor())}>
            {change}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsCard;
