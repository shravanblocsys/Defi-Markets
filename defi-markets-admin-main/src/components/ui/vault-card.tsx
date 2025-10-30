import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowUpRight, TrendingUp, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface VaultCardProps {
  name: string;
  symbol: string;
  apy: string;
  tvl: string;
  capacity: number;
  assets: string[];
  risk: "Low" | "Medium" | "High";
  className?: string;
}

const VaultCard = ({ name, symbol, apy, tvl, capacity, assets, risk, className }: VaultCardProps) => {
  const getRiskColor = () => {
    switch (risk) {
      case "Low":
        return "bg-success/20 text-success border-success/30";
      case "Medium":
        return "bg-warning/20 text-warning border-warning/30";
      case "High":
        return "bg-error/20 text-error border-error/30";
      default:
        return "bg-muted/20 text-muted-foreground border-muted/30";
    }
  };

  return (
    <div className={cn("glass-card rounded-lg p-6 hover-glow transition-all duration-normal group", className)}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
              {name}
            </h3>
            <p className="text-sm text-muted-foreground">{symbol}</p>
          </div>
          <Badge variant="outline" className={getRiskColor()}>
            <Shield className="w-3 h-3 mr-1" />
            {risk}
          </Badge>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">APY</p>
            <p className="text-xl font-bold text-success">{apy}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">TVL</p>
            <p className="text-xl font-bold text-foreground">{tvl}</p>
          </div>
        </div>

        {/* Capacity */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Capacity</span>
            <span className="text-foreground">{capacity}%</span>
          </div>
          <Progress value={capacity} className="h-2" />
        </div>

        {/* Assets */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Assets</p>
          <div className="flex flex-wrap gap-1">
            {assets.map((asset, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {asset}
              </Badge>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <Button variant="outline" className="w-full group-hover:border-primary group-hover:text-primary transition-all">
          <TrendingUp className="w-4 h-4 mr-2" />
          Invest
          <ArrowUpRight className="w-4 h-4 ml-auto" />
        </Button>
      </div>
    </div>
  );
};

export default VaultCard;