import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/helpers";

interface PerformanceDataPoint {
  date: string;
  value: number;
  change: number;
  changePercent: number;
}

interface PortfolioPerformanceChartProps {
  data: PerformanceDataPoint[];
  loading?: boolean;
  period?: "1d" | "7d" | "30d" | "90d" | "1y";
}

const PortfolioPerformanceChart: React.FC<PortfolioPerformanceChartProps> = ({
  data,
  loading = false,
  period = "7d",
}) => {
  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Portfolio Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading performance data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Portfolio Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">No performance data available</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: any }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const formatTooltipValue = (value: number) => {
        if (value >= 1000) {
          return `$${(value / 1000).toFixed(1)}k`;
        } else if (value >= 1) {
          return `$${value.toFixed(2)}`;
        } else if (value >= 0.01) {
          return `$${value.toFixed(4)}`;
        } else {
          return `$${value.toFixed(6)}`;
        }
      };
      
      return (
        <div className="bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg p-3 shadow-lg">
          <p className="text-sm text-muted-foreground mb-1">
            {new Date(label).toLocaleDateString('en-US', { 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric' 
            })} {new Date(label).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false
            })}
          </p>
          <p className="text-sm font-medium text-foreground">
            Portfolio Value: {formatTooltipValue(data.value)}
          </p>
          <p className={`text-sm ${data.change >= 0 ? "text-success" : "text-error"}`}>
            Change: {data.change >= 0 ? "+" : ""}{data.changePercent.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  const formatXAxisLabel = (tickItem: string) => {
    const date = new Date(tickItem);
    switch (period) {
      case "1d":
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      case "7d":
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      case "30d":
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      case "90d":
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      case "1y":
        return date.toLocaleDateString([], { month: 'short', year: '2-digit' });
      default:
        return date.toLocaleDateString();
    }
  };

  const formatYAxisLabel = (value: number) => {
    return `$${value.toFixed(0)}`;
  };

  const currentValue = data[data.length - 1]?.value || 0;
  const previousValue = data[0]?.value || 0;
  const totalChange = currentValue - previousValue;
  const totalChangePercent = previousValue > 0 ? (totalChange / previousValue) * 100 : 0;

  const formatHeaderValue = (value: number) => {
    return value.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const isPositive = totalChange >= 0;

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Portfolio Performance</CardTitle>
          <div className="text-right">
            <div className="text-2xl font-bold">
              ${formatHeaderValue(currentValue)}
            </div>
            <div className={`text-sm ${totalChange >= 0 ? "text-success" : "text-error"}`}>
              {totalChange >= 0 ? "+" : ""}{totalChangePercent.toFixed(2)}%
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="h-64 relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop 
                    offset="5%" 
                    stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--error))"} 
                    stopOpacity={0.3}
                  />
                  <stop 
                    offset="95%" 
                    stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--error))"} 
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="hsl(var(--border))" 
                opacity={0.3}
              />
              
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={formatXAxisLabel}
              />
              
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={formatYAxisLabel}
              />
              
              <Tooltip 
                content={<CustomTooltip />}
                cursor={false}
                allowEscapeViewBox={{ x: false, y: false }}
              />
              
              <Area
                type="monotone"
                dataKey="value"
                stroke={isPositive ? "hsl(var(--success))" : "hsl(var(--error))"}
                strokeWidth={2}
                fill="url(#chartGradient)"
                dot={false}
                activeDot={{ 
                  r: 8, 
                  fill: "white",
                  stroke: isPositive ? "hsl(var(--success))" : "hsl(var(--error))",
                  strokeWidth: 2,
                  style: { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default PortfolioPerformanceChart;
