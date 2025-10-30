import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link } from "react-router-dom";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { VaultChartPoint } from "@/types/store";
import { useVault24hChange } from "@/hooks/useVault24hChange";
import { Button } from "./button";
import { ExternalLink } from "lucide-react";
import { SOLANA_NETWORKS } from "@/lib/solana";


interface AssetInfo {
  symbol: string;
  logoUrl?: string;
}

interface VaultCardProps {
  name: string;
  symbol: string;
  apy: string;
  tvl: string;
  capacity: number;
  assets: AssetInfo[];
  risk: "Low" | "Medium" | "High";
  className?: string;
  nav: string;
  id?: string;
  creator: {
    name: string;
    twitter: string;
  };
  banner?: string;
  logo?: string;
  reputation?: number;
  change24h?: string;
  chartData?: VaultChartPoint[];
  isAPYCalculating?: boolean;
  vaultAddress?: string;
}

const VaultCard = ({
  name,
  symbol,
  apy,
  tvl,
  capacity,
  assets,
  risk,
  className,
  nav,
  id,
  creator,
  banner,
  logo,
  reputation = 8,
  change24h = "+0.0%",
  chartData,
  isAPYCalculating = false,
  vaultAddress,
}: VaultCardProps) => {
  // Calculate dynamic 24h change using the hook
  const calculatedChange = useVault24hChange(name);

  // Use calculated change if available; if calculation failed, use prop as-is without forcing positivity
  const displayChange =
    calculatedChange.formatted !== "N/A"
      ? calculatedChange
      : {
          change: parseFloat(change24h.replace("%", "")) || 0,
          isPositive: (parseFloat(change24h) || 0) >= 0,
          formatted: change24h,
        };

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
  const [depositModalOpen, setDepositModalOpen] = useState(false);

  return (
    <div
      className={cn(
        "w-full p-3 sm:p-3.5 glass-card flex flex-col justify-start items-start gap-2",
        className
      )}
    >
      {/* Header removed; moved into metrics row */}

      {/* Main Content Row - compact metrics */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        {/* ASSETS + NAME (inline) */}
        <div className="flex items-center gap-2  w-fit mr-10  col-span-4 sm:col-span-2 lg:col-span-1">
          <div className="flex flex-col gap-2 min-w-0 whitespace-nowrap">
            <span className="text-gray-100 text-md font-bold font-architekt leading-none truncate">
              {name}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-gray-400 text-sm font-normal font-architekt leading-none">
                {symbol}
              </span>
              <div className="flex items-center gap-1">
                {assets.slice(0, 2).map((asset, index) => (
                  <div
                    key={index}
                    className="w-6 h-6 rounded-full border border-gray-600 overflow-hidden flex items-center justify-center"
                    style={{
                      backgroundColor: `hsl(${200 + index * 60},70%,${
                        50 + index * 15
                      }%)`,
                    }}
                  >
                    {asset.logoUrl ? (
                      <img
                        src={asset.logoUrl}
                        alt={asset.symbol}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-white">
                        {asset.symbol.charAt(0)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* APY Section */}
        <div className="flex flex-col md:ml-10 justify-center items-center">
          <div className="text-gray-400 text-[10px] font-normal font-architekt leading-none mb-0.5">
            APY
          </div>
          <div
            className={`text-xl sm:text-2xl lg:text-3xl font-normal font-architekt leading-normal flex items-center gap-2 ${
              isAPYCalculating ? "text-gray-400 animate-pulse" : "text-white"
            }`}
          >
            {apy}
            {isAPYCalculating && (
              <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
            )}
          </div>
        </div>

        {/* Chart Section */}
        <div className="w-full mt-4 sm:h-7 flex flex-col justify-center items-center">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={
                chartData && chartData.length > 0
                  ? chartData.map((point, index) => ({
                      nav: point.nav,
                      index: index,
                    }))
                  : Array.from({ length: 7 }, (_, i) => ({
                      value: Math.random() * 20 + 8,
                      index: i,
                    }))
              }
            >
              <Line
                type="monotone"
                dataKey="nav"
                stroke="#ffffff"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* TVL Section */}
        <div className="flex flex-col justify-center items-center">
          <div className="text-gray-400 text-[10px] font-normal font-architekt leading-none mb-0.5">
            TVL
          </div>
          <div className="text-white text-xs sm:text-sm font-normal font-architekt leading-none">
            {tvl}
          </div>
        </div>

        {/* USER Section */}
        <div className="flex flex-col justify-center items-center">
          <div className="text-gray-400 text-[10px] font-normal font-architekt leading-none mb-0.5">
            USER
          </div>
          <div className="text-white text-xs sm:text-sm font-normal font-architekt leading-none">
            {creator.name}
          </div>
        </div>

        {/* 24h Change Section */}
        <div className="flex flex-col justify-center items-center">
          <div className="text-gray-400 text-[10px] font-normal font-architekt leading-none mb-0.5">
            24h Change
          </div>
          <div className="flex justify-start items-center gap-1">
            <svg
              width="12"
              height="11"
              viewBox="0 0 13 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-3 h-3 sm:w-4 sm:h-4"
            >
              <path
                d="M4.16663 3.5H9.16663V8.5"
                stroke={displayChange.isPositive ? "#21C45D" : "#EF4444"}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform={
                  displayChange.isPositive ? "" : "rotate(180 6.66663 6)"
                }
              />
              <path
                d="M4.16663 8.5L9.16663 3.5"
                stroke={displayChange.isPositive ? "#21C45D" : "#EF4444"}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform={
                  displayChange.isPositive ? "" : "rotate(180 6.66663 6)"
                }
              />
            </svg>
            <div
              className={`text-xs sm:text-sm font-normal font-architekt leading-none ${
                displayChange.isPositive ? "text-green-500" : "text-red-500"
              }`}
            >
              {displayChange.formatted}
            </div>
          </div>
        </div>

        {/* REPUTATION Section */}
        <div className="flex flex-col justify-center items-center">
          <div className="text-gray-400 text-[10px] font-normal font-architekt leading-none mb-0.5">
            REPUTATION
          </div>
          <div className="text-white text-xs sm:text-sm font-normal font-architekt leading-none">
            {reputation}/10
          </div>
        </div>
      </div>

      {/* Action Button Section */}
      <div className="w-full flex flex-row justify-start items-center gap-2">
        <Link
          to={id ? `/vault/${id}` : "/"}
          className="flex-1 h-8 sm:h-8 px-3 sm:px-4 py-2 rounded-[10px] flex justify-center items-center bg-neutral-900/70"
        >
          <div className="text-center text-gray-100 text-xs sm:text-xs font-medium font-architekt leading-none">
            Fund
          </div>
        </Link>
        <div className="h-8 sm:h-8 px-3 sm:px-3 rounded-[10px] flex justify-center items-center">
          {/* <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-3.5 h-3.5 sm:w-4 sm:h-4"
          >
            <path
              d="M10 2H14V6"
              stroke="#F0F2F5"
              strokeWidth="1.33333"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6.66663 9.33333L14 2"
              stroke="#F0F2F5"
              strokeWidth="1.33333"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 8.66667V12.6667C12 13.0203 11.8595 13.3594 11.6095 13.6095C11.3594 13.8595 11.0203 14 10.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V5.33333C2 4.97971 2.14048 4.64057 2.39052 4.39052C2.64057 4.14048 2.97971 4 3.33333 4H7.33333"
              stroke="#F0F2F5"
              strokeWidth="1.33333"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg> */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const base = `https://solscan.io/account/${vaultAddress}`;
              const network = import.meta.env.VITE_SOLANA_NETWORK as
                | string
                | undefined;
              const isDevnet =
                (network || SOLANA_NETWORKS.MAINNET) === SOLANA_NETWORKS.DEVNET;
              const solscanUrl = isDevnet ? `${base}?cluster=devnet` : base;
              window.open(solscanUrl, "_blank", "noopener,noreferrer");
            }}
            className="h-6 w-6 p-0 hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VaultCard;
