import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  icon: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

const StatsCard = ({ title, value, change, icon, trend = "neutral", className }: StatsCardProps) => {
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
    <div className={cn("glass-card rounded-lg p-6 hover-glow transition-all duration-normal", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {change && (
            <p className={cn("text-sm font-medium", getTrendColor())}>
              {change}
            </p>
          )}
        </div>
        <div className="p-3 rounded-lg bg-surface-2">
          {icon}
        </div>
      </div>
    </div>
  );
};

export default StatsCard;