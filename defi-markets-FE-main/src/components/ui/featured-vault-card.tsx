import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, TrendingUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface FeaturedVaultCardProps {
  name: string;
  symbol: string;
  apy: string;
  tvl: string;
  assets: string[];
  owner: string;
  className?: string;
  id?: string;
  chartData?: number[];
}

const FeaturedVaultCard = ({ 
  name, 
  symbol, 
  apy, 
  tvl, 
  assets, 
  owner,
  className,
  id,
  chartData = [10, 15, 12, 18, 16, 20, 17]
}: FeaturedVaultCardProps) => {
  return (
    <div className={cn("bg-white/10 backdrop-blur-md rounded-lg border border-white/20 overflow-hidden hover:bg-white/20 hover:shadow-lg transition-all duration-normal group", className)}>
      <div className="p-6 space-y-4">
        {/* Header with TVL and APY */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-architekt">TVL</p>
            <p className="text-lg font-bold text-foreground font-architekt">{tvl}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xs text-muted-foreground font-architekt">APY</p>
            <p className="text-lg font-bold text-success font-architekt">{apy}</p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-16 bg-surface-1 rounded flex items-end justify-between px-2 py-2">
          {chartData.map((value, index) => (
            <div 
              key={index} 
              className="bg-success rounded-sm flex-1 mx-0.5"
              style={{ 
                height: `${(value / Math.max(...chartData)) * 100}%`,
                minHeight: '4px'
              }}
            />
          ))}
        </div>

        {/* Vault Name and Symbol */}
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-foreground font-architekt tracking-wide">
            {name}
          </h3>
          <p className="text-sm text-muted-foreground font-architekt">{symbol}</p>
        </div>

        {/* Asset Icons */}
        <div className="flex space-x-2">
          {assets.map((asset, index) => (
            <div 
              key={index} 
              className="w-6 h-6 rounded-full border-2 border-accent/30"
              style={{ 
                backgroundColor: `hsl(${200 + index * 30}, 50%, ${60 + index * 10}%)` 
              }}
            />
          ))}
        </div>

        {/* Owner */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-architekt">Owner</p>
            <p className="text-sm font-semibold text-foreground font-architekt">{owner}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-surface-2 border border-accent/30" />
        </div>

        {/* Action Button */}
        <Button 
          variant="outline" 
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-primary font-architekt tracking-wider"
          asChild
        >
          <Link to={id ? `/vault/${id}` : "/vaults"}>
            <TrendingUp className="w-4 h-4 mr-2" />
            Invest
            <ArrowUpRight className="w-4 h-4 ml-auto" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default FeaturedVaultCard;
