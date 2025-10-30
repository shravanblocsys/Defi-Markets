import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface PortfolioChartProps {
  data: Array<{ date: string; value: number; pnl?: number }>;
  currentValue: number;
  change: number;
  changePeriod: string;
  type?: "line" | "area" | "bar";
  className?: string;
}

const PortfolioChart = ({ 
  data, 
  currentValue, 
  change, 
  changePeriod, 
  type = "area",
  className 
}: PortfolioChartProps) => {
  // Generate mock data if not provided
  const chartData = data.length > 0 ? data : Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    value: currentValue + (Math.random() - 0.5) * currentValue * 0.1,
    pnl: (Math.random() - 0.5) * 10000
  }));

  const isPositive = change >= 0;

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ value: number; dataKey: string }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
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
            Portfolio Value: ${payload[0].value.toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}
          </p>
          {payload[1] && (
            <p className="text-sm text-muted-foreground">
              P&L: ${payload[1].value.toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    switch (type) {
      case "line":
        return (
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={false}
              allowEscapeViewBox={{ x: false, y: false }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={isPositive ? "hsl(var(--success))" : "hsl(var(--error))"}
              strokeWidth={2}
              dot={false}
              activeDot={{ 
                r: 8, 
                fill: "white",
                stroke: isPositive ? "hsl(var(--success))" : "hsl(var(--error))",
                strokeWidth: 2,
                style: { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }
              }}
            />
          </LineChart>
        );
      
      case "bar":
        return (
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={false}
              allowEscapeViewBox={{ x: false, y: false }}
            />
            <Bar
              dataKey="value"
              fill={isPositive ? "hsl(var(--success))" : "hsl(var(--error))"}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        );
      
      default: // area
        return (
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
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
            
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            
            <XAxis 
              dataKey="date" 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            />
            
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
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
              fill="url(#portfolioGradient)"
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
        );
    }
  };

  return (
    <Card className={`glass-card ${className}`}>
      <CardContent className="p-6">
        <div className="h-64 relative">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
          
          {/* Chart overlay with current value and change */}
          {/* <div className="absolute top-4 left-4">
            <div className="flex items-center gap-2">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-success" />
              ) : (
                <TrendingDown className="w-4 h-4 text-error" />
              )}
              <span className={`text-sm font-medium ${
                isPositive ? 'text-success' : 'text-error'
              }`}>
                {isPositive ? '+' : ''}{change.toFixed(2)}% Past {changePeriod}
              </span>
            </div>
          </div> */}
        </div>
      </CardContent>
    </Card>
  );
};

export default PortfolioChart;
