import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { VaultChartPoint } from "@/types/store";
import { ArrowUpRight, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface AssetInfo {
  symbol: string;
  logoUrl?: string;
}

interface FeatureVaultCardProps {
  name: string;
  symbol: string;
  apy: string;
  tvl: string;
  assets: AssetInfo[];
  owner: string;
  className?: string;
  id?: string;
  chartData?: VaultChartPoint[];
  apyDate?: string;
  avatar?: string;
  isAPYCalculating?: boolean;
}
// totalValueLocked

const FeatureVaultCard = ({
  name,
  symbol,
  apy,
  tvl,
  assets,
  owner,
  className,
  id,
  // chartData = [10, 15, 12, 18, 16, 20, 17, 14, 19, 16],
  chartData,
  apyDate = "APY SUN AUG 13 9.8",
  avatar,
  isAPYCalculating = false,
}: FeatureVaultCardProps) => {
  const navigate = useNavigate();

  const handleCardClick = () => {
    if (id) {
      navigate(`/vault/${id}`);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if ((e.key === "Enter" || e.key === " ") && id) {
      e.preventDefault();
      navigate(`/vault/${id}`);
    }
  };
  return (
    <div
      className={cn(
        "relative overflow-hidden hover:shadow-lg transition-all duration-normal group cursor-pointer",
        className
      )}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/10 to-black/80" />

      {/* Content */}
      <div className="relative z-10 p-6 space-y-4">
        {/* Header with TVL and APY */}
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex flex-col items-start">
            <p className="text-xs text-white/80 font-architekt tracking-wider uppercase">
              TVL
            </p>
            <p className="text-lg font-bold text-white font-architekt">{tvl}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xs text-white/80 font-architekt tracking-wider uppercase">
              APY
            </p>
            <div
              className={`text-lg font-bold font-architekt flex items-center justify-end gap-2 ${
                isAPYCalculating
                  ? "text-gray-400 animate-pulse"
                  : "text-green-400"
              }`}
            >
              {apy}
              {isAPYCalculating && (
                <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          </div>
        </div>

        {/* Chart with APY date */}
        <div className="relative">
          <div className="h-16  rounded p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData.map((point, index) => ({
                  nav: point.nav,
                  index,
                }))}
              >
                <Line
                  type="monotone"
                  dataKey="nav"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* APY Date overlay */}
          {/* <div className="absolute top-1 left-2">
            <p className="text-xs text-white/90 font-architekt">{apyDate}</p>
          </div> */}
        </div>

        {/* Vault Name and Symbol (force two-line height for title to normalize card heights) */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white font-architekt tracking-wide leading-snug min-h-[3.25rem] line-clamp-2">
            {name}
          </h3>
          <p className="flex items-center gap-2 text-sm text-white/80 font-architekt">
            {symbol}
          </p>
        </div>

        {/* Asset Icons */}
        <div className="flex space-x-2">
          {assets.map((asset, index) => (
            <div
              key={index}
              className="w-6 h-6 rounded-full border-[1px] border-white/30 overflow-hidden flex items-center justify-center"
              // style={{
              //   backgroundColor: `hsl(${200 + index * 60}, 70%, ${
              //     50 + index * 15
              //   }%)`,
              // }}
            >
              {asset.logoUrl ? (
                <img
                  src={asset.logoUrl}
                  alt={asset.symbol}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to colored circle if image fails to load
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span className="text-xs font-bold text-white">
                  {asset.symbol.charAt(0)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Owner */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className=" flex items-center gap-2 text-xs text-white/80 font-architekt tracking-wider uppercase">
              Owner
            </p>
            <p className="text-sm font-semibold text-white font-architekt">
              {owner}
            </p>
          </div>
          <div className="flex justify-center items-center w-8 h-8 rounded-full bg-white/20 border border-white/30 bg-cover object-contain bg-center bg-no-repeat overflow-hidden">
            {avatar && avatar.startsWith("http:") ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M19 21V19C19 17.9391 18.5786 16.9217 17.8284 16.1716C17.0783 15.4214 16.0609 15 15 15H9C7.93913 15 6.92172 15.4214 6.17157 16.1716C5.42143 16.9217 5 17.9391 5 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : avatar ? (
              <img src={avatar} className="w-[100%] h-[100%]" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M19 21V19C19 17.9391 18.5786 16.9217 17.8284 16.1716C17.0783 15.4214 16.0609 15 15 15H9C7.93913 15 6.92172 15.4214 6.17157 16.1716C5.42143 16.9217 5 17.9391 5 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Action Button */}
        <Button
          variant="outline"
          className="w-full bg-black/40 hover:bg-black/60 text-white border-white/30 font-architekt tracking-wider"
          asChild
        >
          <Link to={id ? `/vault/${id}` : "/"}>
            <TrendingUp className="w-4 h-4 mr-2" />
            Invest
            <ArrowUpRight className="w-4 h-4 ml-auto" />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default FeatureVaultCard;
