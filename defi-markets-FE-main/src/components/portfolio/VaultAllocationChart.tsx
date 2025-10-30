import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface VaultAllocation {
  vaultName: string;
  vaultSymbol: string;
  value: number;
  percentage: number;
  color: string;
}

interface VaultAllocationChartProps {
  allocations: VaultAllocation[];
  loading?: boolean;
}

const COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#00ff00",
  "#ff00ff", "#00ffff", "#ffff00", "#ff0000", "#0000ff"
];

const VaultAllocationChart: React.FC<VaultAllocationChartProps> = ({
  allocations,
  loading = false,
}) => {
  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Vault Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading allocation data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!allocations || allocations.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Vault Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">No vault allocations found</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-card p-3 rounded-lg border">
          <p className="font-medium">{data.vaultName}</p>
          <p className="text-sm text-muted-foreground">
            Value: ${data.value.toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground">
            Allocation: {data.percentage.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Vault Allocation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocations}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ percentage }) => `${percentage.toFixed(1)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {allocations.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Allocation List */}
        <div className="mt-4 space-y-2">
          {allocations.map((allocation, index) => (
            <div key={allocation.vaultName} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: allocation.color || COLORS[index % COLORS.length] }}
                />
                <span className="text-sm font-medium">{allocation.vaultName}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">
                  ${allocation.value.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {allocation.percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default VaultAllocationChart;
