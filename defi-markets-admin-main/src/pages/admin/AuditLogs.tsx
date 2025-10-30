import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { Search, Filter, Calendar as CalendarIcon, Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { auditApi, exportAuditApi } from "@/services/api";

interface AuditLog {
  _id: string;
  action: string;
  description: string;
  performedBy: {
    _id: string;
    username: string;
    email: string;
    name: string;
  };
  vaultId?: {
    _id: string;
    vaultName: string;
    vaultSymbol: string;
  } | null;
  feeId?: {
    _id: string;
    feeRate: number;
    effectiveDate: string;
  } | null;
  metadata?: {
    feeRate?: number;
    effectiveDate?: string;
    description?: string;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
  __v: number;
}

const ACTIONS = [
  "vault_created",
  "vault_paused",
  "vault_resumed",
  "fee_created",
  "fee_updated",
  "wallet_created",
  "wallet_updated",
  "wallet_deleted",
  "user_login",
  "user_logout",
  "permission_granted",
  "permission_revoked"
];

const RESOURCE_TYPES = [
  "vault",
  "wallet",
  "fee",
];

const AuditLogs = () => {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Function to sanitize CSV content to prevent injection attacks
  const sanitizeCSVField = (value: string | number | undefined | null): string => {
    if (value === null || value === undefined) return '';
    
    const stringValue = String(value);
    
    // Check if the value starts with potentially dangerous characters
    if (/^[=+\-@]/.test(stringValue)) {
      // Prefix with single quote to prevent formula execution
      return `'${stringValue}`;
    }
    
    return stringValue;
  };


  // Function to clear all filters
  const clearFilters = () => {
    setActionFilter("all");
    setResourceFilter("all");
    setDateRange(undefined);
    setCurrentPage(1);
    console.log('Filters cleared');
    // Refresh data with cleared filters
    fetchAuditLogs(1);
  };

  // Audit log data with pagination
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });

  // Fetch audit logs with current filters and pagination
  const fetchAuditLogs = async (page: number = currentPage) => {
    setIsLoading(true);
    try {
      const params: any = {
        page,
        limit: itemsPerPage
      };

      // Add filters if they're not default values
      if (actionFilter !== "all") params.action = actionFilter;
      if (resourceFilter !== "all") params.relatedEntity = resourceFilter;
      if (dateRange?.from) {
        const year = dateRange.from.getFullYear();
        const month = String(dateRange.from.getMonth() + 1).padStart(2, '0');
        const day = String(dateRange.from.getDate()).padStart(2, '0');
        params.fromDate = `${year}-${month}-${day}`;
      }
      if (dateRange?.to) {
        const year = dateRange.to.getFullYear();
        const month = String(dateRange.to.getMonth() + 1).padStart(2, '0');
        const day = String(dateRange.to.getDate()).padStart(2, '0');
        params.toDate = `${year}-${month}-${day}`;
      }

      console.log('Fetching audit logs with params:', params);
      const response = await auditApi.getAuditLogs(params);

      setAuditLogs(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs(1); // Reset to page 1 when filters change
  }, [actionFilter, resourceFilter, dateRange]);


  // Handle page changes
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchAuditLogs(page);
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes("created") || action.includes("granted")) return "bg-success/10 text-success";
    if (action.includes("paused") || action.includes("deleted") || action.includes("revoked")) return "bg-destructive/10 text-destructive";
    if (action.includes("updated") || action.includes("resumed")) return "bg-info/10 text-info";
    if (action.includes("login") || action.includes("logout")) return "bg-warning/10 text-warning";
    return "bg-surface-2 text-foreground";
  };
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Prepare export parameters based on current filters
      const exportParams: any = {};
      
      if (actionFilter !== "all") {
        exportParams.action = actionFilter;
      }
      if (resourceFilter !== "all") {
        exportParams.relatedEntity = resourceFilter;
      }
      if (dateRange?.from) {
        const year = dateRange.from.getFullYear();
        const month = String(dateRange.from.getMonth() + 1).padStart(2, '0');
        const day = String(dateRange.from.getDate()).padStart(2, '0');
        exportParams.fromDate = `${year}-${month}-${day}`;
      }
      if (dateRange?.to) {
        const year = dateRange.to.getFullYear();
        const month = String(dateRange.to.getMonth() + 1).padStart(2, '0');
        const day = String(dateRange.to.getDate()).padStart(2, '0');
        exportParams.toDate = `${year}-${month}-${day}`;
      }

      console.log('Exporting with filters:', exportParams);
      
      // Fetch filtered data for export
      const response = await exportAuditApi.getAuditLogs(exportParams);
      const exportData = response.data;

      // Generate CSV content with sanitized fields
      const csvContent = "data:text/csv;charset=utf-8," +
        "Timestamp,Actor,Action,Resource,Description\n" +
        exportData?.map((log: any) => {
          const resource = log.vaultId
            ? `${log.vaultId.vaultName} (${log.vaultId.vaultSymbol})`
            : log.feeId
              ? `Fee: ${log.feeId.feeRate}%`
              : "-";

          // Sanitize all fields to prevent CSV injection
          const timestamp = sanitizeCSVField(log.createdAt);
          const actor = sanitizeCSVField(log.performedBy?.username);
          const action = sanitizeCSVField(log.action);
          const resourceField = sanitizeCSVField(resource);
          const description = sanitizeCSVField(log.description);

          return `${timestamp},${actor},${action},"${resourceField}","${description}"`;
        }).join("\n");

      // Download CSV file
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clear filters after successful export
      clearFilters();
      
      console.log('Export completed successfully');
    } catch (error) {
      console.error('Error exporting audit logs:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">
            Complete audit trail of all platform activities
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 w-full justify-between lg:flex-row md:flex-row flex-col">
            {/* Action Filter */}
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {ACTIONS.map(action => (
                  <SelectItem key={action} value={action}>
                    {action.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Resource Filter */}
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {RESOURCE_TYPES.map(type => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    "Pick a date range"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            {/* Export CSV */}
            <Button 
              onClick={handleExport} 
              className="gap-2" 
              disabled={isExporting}
            >
              <Download className="h-4 w-4" /> 
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Audit Logs ({pagination?.total || 0} entries)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-muted-foreground">Loading audit logs...</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs?.map((log) => (
                  <TableRow key={log._id}>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <code className="text-xs bg-surface-2/50 px-2 py-1 rounded">
                          {log.performedBy?.username}
                        </code>
                        <div className="text-xs text-muted-foreground">
                          {log.performedBy?.name}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getActionBadgeColor(log.action)} px-3 py-1 uppercase text-xs font-medium`}>
                        {log.action?.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.vaultId ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{log.vaultId.vaultName}</div>
                          <div className="text-xs text-muted-foreground">{log.vaultId.vaultSymbol}</div>
                        </div>
                      ) : log.feeId ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">Fee: {log.feeId.feeRate}%</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(log.feeId.effectiveDate).toLocaleDateString()}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="text-sm truncate" title={log.description}>
                        {log.description}
                      </div>
                      {log.metadata && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {log.metadata.description && (
                            <div>Note: {log.metadata.description}</div>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border-subtle">
              <div className="text-sm text-muted-foreground">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!pagination.hasPrev || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        disabled={isLoading}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!pagination.hasNext || isLoading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditLogs;