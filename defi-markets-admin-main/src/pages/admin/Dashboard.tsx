import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dashboardApi, auditApi } from "@/services/api";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Pause,
  Play,
  RefreshCw,
  TrendingUp,
  Vault,
  Users,
  Shield
} from "lucide-react";

interface AuditAction {
  id: string;
  actor: string;
  action: string;
  resource: string;
  timestamp: string;
}

interface VaultSummary {
  total: number;
  active: number;
  paused: number;
  totalTvl: string;
}

const Dashboard = () => {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [apiHealth] = useState({
    status: "healthy",
    uptime: "99.9%",
    responseTime: "45ms"
  });

  const fetchDashboardStats = async () => {
    try {
      const response = await dashboardApi.getStatistics();
      console.log('Dashboard Statistics Response:', response.data);
      setDashboardStats(response.data);
    } catch (error) {
      console.error('Error fetching dashboard statistics:', error);
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLogsLoading(true);
    try {
      const response = await auditApi.getAuditLogs({ limit: 10 });
      setAuditLogs(response.data);
      console.log('Audit Logs Response:', response.data);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setAuditLogsLoading(false);
    }
  };  

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Fetch fresh data
    await fetchDashboardStats();
    await fetchAuditLogs();
    setLastRefresh(new Date());
    setIsRefreshing(false);
  };

  useEffect(() => {
    // Fetch dashboard statistics on component mount
    fetchDashboardStats();
    fetchAuditLogs();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      setLastRefresh(new Date());
      fetchDashboardStats();
      fetchAuditLogs();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of DeFiMarkets platform status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vaults</CardTitle>
            <Vault className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.totalVaults}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats?.activeVaults} active, {dashboardStats?.pausedVaults} paused
            </p>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total TVL</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.totalDepositAmount}</div>
            <p className="text-xs text-success flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {dashboardStats?.depositGrowthPercentage}% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span className="text-sm font-medium capitalize">{apiHealth.status}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {apiHealth.uptime} uptime • {apiHealth.responseTime} avg
            </p>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats?.activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats?.activeUsersYesterday} from yesterday
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Alerts */}
      {/* <div className="grid gap-4 lg:grid-cols-2"> */}
        {/* Recent Audit Actions */}
        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Recent Audit Actions
            </CardTitle>
            <CardDescription>
              Last 10 administrative actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 h-[300px] overflow-y-auto pr-2">
              {auditLogsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Loading audit logs...</p>
                  </div>
                </div>
              ) : auditLogs && auditLogs.length > 0 ? (
                auditLogs.map((data) => (
                  <div key={data._id} className="flex items-center justify-between p-3 rounded-lg bg-surface-2/30">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {data?.action?.replace('_', ' ')}
                        </Badge>
                      </div>
                      <span className="text-sm font-medium">{data?.description}</span>
                      <p className="text-xs text-muted-foreground">
                        by {data?.performedBy?.username}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(data?.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>No recent audit actions</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* System Alerts */}
        {/* <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              System Alerts
            </CardTitle>
            <CardDescription>
              Active system notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">High Gas Fees Detected</p>
                  <p className="text-xs text-muted-foreground">
                    Current gas price: 120 gwei. Consider pausing non-critical operations.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-info/10 border border-info/20">
                <CheckCircle className="h-4 w-4 text-info mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Scheduled Maintenance Complete</p>
                  <p className="text-xs text-muted-foreground">
                    Database optimization completed successfully at 2:00 AM UTC.
                  </p>
                </div>
              </div>

              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">All systems operational</p>
              </div>
            </div>
          </CardContent>
        </Card> */}
      {/* </div> */}
    </div>
  );
};

export default Dashboard;