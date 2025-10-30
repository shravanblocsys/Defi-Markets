import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DynamicTable, Column } from "@/components/ui/dynamic-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Coins, Eye, EyeOff, Copy, Check } from "lucide-react";
import { assetAllocationApi } from "@/services/api";
import { Asset } from "@/types/store";

const ASSET_TYPES = [
  "crypto",
];

const AdminAssets = () => {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Assets data with pagination
  const [assets, setAssets] = useState<Asset[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });

  // Function to clear all filters
  const clearFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
    fetchAssets(1);
  };

  // Fetch assets with current filters and pagination
  const fetchAssets = async (page: number = currentPage) => {
    setIsLoading(true);
    try {
      const params: any = {
        page,
        limit: itemsPerPage
      };

      // Add filters if they're not default values
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (typeFilter !== "all") params.type = typeFilter;
      if (statusFilter !== "all") params.active = statusFilter === "active";

      console.log('Fetching assets with params:', params);
      const response = await assetAllocationApi.getAssets(params);

      setAssets(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error fetching assets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets(1); // Reset to page 1 when filters change
  }, [typeFilter, statusFilter]);

  // Handle search with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchAssets(1);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Handle page changes
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchAssets(page);
  };

  const getStatusBadgeColor = (active: boolean) => {
    return active 
      ? "bg-success/10 text-success border-success/20" 
      : "bg-destructive/10 text-destructive border-destructive/20";
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "crypto":
        return "bg-primary/10 text-primary border-primary/20";
      case "stablecoin":
        return "bg-info/10 text-info border-info/20";
      case "token":
        return "bg-warning/10 text-warning border-warning/20";
      default:
        return "bg-surface-2 text-foreground border-border";
    }
  };

  const toggleAssetStatus = async (assetId: string) => {
    try {
      await assetAllocationApi.toggleAssetStatus(assetId);
      fetchAssets(currentPage);
    } catch (error) {
      console.error('Error toggling asset status:', error);
    }
  };

  const copyToClipboard = async (text: string, assetId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(assetId);
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Define table columns
  const columns: Column<Asset>[] = [
    {
      key: 'name',
      label: 'Asset',
      render: (_, asset) => (
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center overflow-hidden">
            {asset.logoUrl ? (
              <img
                src={asset.logoUrl}
                alt={asset.symbol}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  if (target.nextSibling) {
                    (target.nextSibling as HTMLElement).style.display = 'flex';
                  }
                }}
              />
            ) : null}
            <div 
              className="w-full h-full flex items-center justify-center text-xs font-medium text-muted-foreground"
              style={{ display: asset.logoUrl ? 'none' : 'flex' }}
            >
              {asset.symbol.substring(0, 2)}
            </div>
          </div>
          <div>
            <div className="font-medium">{asset.name}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(asset.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'symbol',
      label: 'Symbol',
      render: (symbol) => (
        <code className="text-sm bg-surface-2/50 px-2 py-1 rounded font-mono">
          {symbol}
        </code>
      )
    },
    {
      key: 'type',
      label: 'Type',
      render: (type) => (
        <Badge className={`${getTypeBadgeColor(type)} px-3 py-1 capitalize text-xs font-medium border`}>
          {type}
        </Badge>
      )
    },
    {
      key: 'mintAddress',
      label: 'Mint Address',
      render: (mintAddress, asset) => (
        <div className="group relative flex items-center gap-2">
          <code 
            className="text-xs bg-surface-2/50 px-2 py-1 rounded font-mono break-all cursor-pointer hover:bg-surface-2 transition-colors"
            title={mintAddress}
            onClick={() => copyToClipboard(mintAddress, asset._id)}
          >
            {mintAddress.length > 20 
              ? `${mintAddress.substring(0, 8)}...${mintAddress.substring(mintAddress.length - 8)}`
              : mintAddress
            }
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => copyToClipboard(mintAddress, asset._id)}
          >
            {copiedAddress === asset._id ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      )
    },
    {
      key: 'decimals',
      label: 'Decimals',
      render: (decimals) => (
        <span className="text-sm font-mono">{decimals}</span>
      )
    },
    {
      key: 'active',
      label: 'Status',
      render: (active) => (
        <Badge className={`${getStatusBadgeColor(active)} px-3 py-1 text-xs font-medium border`}>
          {active ? "Active" : "Inactive"}
        </Badge>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, asset) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleAssetStatus(asset._id)}
          className="gap-2"
        >
          {asset.active ? (
            <>
              <EyeOff className="h-4 w-4" />
              Deactivate
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              Activate
            </>
          )}
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Asset Management</h1>
          <p className="text-muted-foreground">
            Manage platform assets and their configurations
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 w-full justify-between lg:flex-row md:flex-row flex-col">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assets by name or symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ASSET_TYPES.map(type => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            <Button 
              variant="outline" 
              onClick={clearFilters}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Assets Table */}
      <DynamicTable
        data={assets}
        columns={columns}
        pagination={pagination}
        onPageChange={handlePageChange}
        currentPage={currentPage}
        isLoading={isLoading}
        loadingMessage="Loading assets..."
        title="Assets"
        icon={<Coins className="h-5 w-5" />}
        emptyMessage="No assets found"
      />
    </div>
  );
};

export default AdminAssets;
