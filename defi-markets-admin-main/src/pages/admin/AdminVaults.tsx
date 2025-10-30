import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DynamicTable, Column } from "@/components/ui/dynamic-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Vault, Search, Filter, Pause, Play, AlertTriangle, TrendingUp, TrendingDown, Loader2, Star } from "lucide-react";
import { vaultsApi, vaultsStatsApi } from "@/services/api";
import { Vault as VaultType, PaginatedResponse } from "@/types/store";
import { useVaultFactory } from "@/hooks/useContract";
import { SuccessPopup } from "@/components/ui/SuccessPopup";

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const AdminVaults = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pauseReason, setPauseReason] = useState("");
  const [selectedVault, setSelectedVault] = useState<VaultType | null>(null);
  const [vaults, setVaults] = useState<VaultType[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [updatingFeatured, setUpdatingFeatured] = useState<string | null>(null);
  const [vaultStats, setVaultStats] = useState({
    totalVaults: 0,
    activeVaults: 0,
    pausedVaults: 0,
    pendingVaults: 0,
    closedVaults: 0,
    totalDeposits: 0,
    totalRedeems: 0,
    totalUsers: 0,
    totalUsersRedeemed: 0,
  });

  // Contract-related state and hooks
  const { 
    setVaultPaused: contractSetVaultPaused,
    error: contractError, 
    isConnected: contractConnected, 
    address: contractAddress, 
    program 
  } = useVaultFactory();

  const [isContractLoading, setIsContractLoading] = useState(false);
  const [contractSuccess, setContractSuccess] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<string>("");
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  // Fetch vault statistics from API
  const fetchVaultStats = async () => {
    setStatsLoading(true);
    try {
      const response = await vaultsStatsApi.getVaultStatistics();
      if (response.data) {
        setVaultStats(response.data);
      } else {
        console.error("Failed to fetch vault statistics:", response.message);
      }
    } catch (err) {
      console.error("Error fetching vault statistics:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch vaults from API
  const fetchVaults = async (page: number = 1, search?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await vaultsApi.getAll({
        page,
        limit: pagination.limit,
        search: search || undefined,
      });
      if (response.data) {
        setVaults(response.data);
        setPagination({
          page: response.pagination.page,
          limit: response.pagination.limit,
          total: response.pagination.total,
          totalPages: response.pagination.totalPages,
          hasNext: response.pagination.hasNext,
          hasPrev: response.pagination.hasPrev,
        });
      } else {
        setError("Failed to fetch vaults");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      toast({
        title: "Error",
        description: "Failed to fetch vaults",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load vault statistics and vaults on component mount
  useEffect(() => {
    fetchVaultStats();
    fetchVaults(1, searchTerm);
  }, []);

  // Handle search with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm !== undefined) {
        fetchVaults(1, searchTerm);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Filter vaults by status (client-side filtering for status)
  const filteredVaults = vaults.filter(vault => {
    const matchesStatus = statusFilter === "all" || vault.status === statusFilter;
    return matchesStatus;
  });

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    fetchVaults(newPage, searchTerm);
  };

  // Handle status filter change
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
  };

  const handlePauseVault = async (vault: VaultType) => {

    // Check wallet connection first
    if (!contractConnected || !contractAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first to pause the vault.",
        variant: "destructive",
      });
      return;
    }

    // Check if Anchor program is available
    if (!program) {
      toast({
        title: "Program Not Ready",
        description: contractError || "Anchor program not initialized. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsContractLoading(true);
    setContractSuccess(false);
    setTransactionSignature("");
    setShowSuccessPopup(false);

    try {
      toast({
        title: "Pausing Vault...",
        description: `${vault.vaultName} is being paused on the blockchain. This may take a few minutes.`,
      });

      // Use contract call to pause vault
      const tx = await contractSetVaultPaused(vault.vaultIndex, true);

      setContractSuccess(true);
      setTransactionSignature(tx);

      // Call API to update vault status in backend after blockchain confirmation
      let backendUpdateSuccess = false;
      try {
        await vaultsApi.pause(vault._id);
        backendUpdateSuccess = true;
      } catch (apiError) {
        console.error("Error updating vault status in backend:", apiError);
        // Show warning toast for backend failure
        toast({
          title: "Backend Update Failed",
          description: "Vault was paused on blockchain but failed to update in backend. Please refresh the page or contact support.",
          variant: "destructive",
        });
      }

      // Only update local state and show success popup if backend update succeeded
      if (backendUpdateSuccess) {
        // Update local state
        setVaults(prev => prev.map(v =>
          v._id === vault._id
            ? {
              ...v,
              status: "paused" as const,
            }
            : v
        ));

        // Refresh vault statistics
        fetchVaultStats();

        // Show success popup
        setShowSuccessPopup(true);

        toast({
          title: "Vault Paused Successfully! 🎉",
          description: `${vault.vaultName} has been paused on the blockchain. Transaction: ${tx.slice(0, 8)}...`,
        });
      } else {
        // Show partial success message for blockchain success but backend failure
        toast({
          title: "Partial Success",
          description: `${vault.vaultName} was paused on blockchain but backend update failed. Transaction: ${tx.slice(0, 8)}...`,
          variant: "destructive",
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to pause vault";
      
      toast({
        title: "Vault Pause Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsContractLoading(false);
    }

    setSelectedVault(null);
  };

  const handleResumeVault = async (vault: VaultType) => {
    // Check wallet connection first
    if (!contractConnected || !contractAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first to resume the vault.",
        variant: "destructive",
      });
      return;
    }

    // Check if Anchor program is available
    if (!program) {
      toast({
        title: "Program Not Ready",
        description: contractError || "Anchor program not initialized. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsContractLoading(true);
    setContractSuccess(false);
    setTransactionSignature("");
    setShowSuccessPopup(false);

    try {
      toast({
        title: "Resuming Vault...",
        description: `${vault.vaultName} is being resumed on the blockchain. This may take a few minutes.`,
      });

      // Use contract call to resume vault
      const tx = await contractSetVaultPaused(vault.vaultIndex, false);

      setContractSuccess(true);
      setTransactionSignature(tx);

      // Call API to update vault status in backend after blockchain confirmation
      let backendUpdateSuccess = false;
      try {
        await vaultsApi.resume(vault._id);
        backendUpdateSuccess = true;
      } catch (apiError) {
        console.error("Error updating vault status in backend:", apiError);
        // Show warning toast for backend failure
        toast({
          title: "Backend Update Failed",
          description: "Vault was resumed on blockchain but failed to update in backend. Please refresh the page or contact support.",
          variant: "destructive",
        });
      }

      // Only update local state and show success popup if backend update succeeded
      if (backendUpdateSuccess) {
        // Update local state
        setVaults(prev => prev.map(v =>
          v._id === vault._id
            ? {
              ...v,
              status: "active" as const,
            }
            : v
        ));

        // Refresh vault statistics
        fetchVaultStats();

        // Show success popup
        setShowSuccessPopup(true);

        toast({
          title: "Vault Resumed Successfully! 🎉",
          description: `${vault.vaultName} has been resumed on the blockchain. Transaction: ${tx.slice(0, 8)}...`,
        });
      } else {
        // Show partial success message for blockchain success but backend failure
        toast({
          title: "Partial Success",
          description: `${vault.vaultName} was resumed on blockchain but backend update failed. Transaction: ${tx.slice(0, 8)}...`,
          variant: "destructive",
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to resume vault";
      
      toast({
        title: "Vault Resume Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsContractLoading(false);
    }
  };

  const handleFeaturedToggle = async (vault: VaultType, isFeatured: boolean) => {
    setUpdatingFeatured(vault._id);
    try {
      const response = await vaultsApi.updateFeatured(vault._id, isFeatured);
      
      // Check for success status (backend uses 'status' field)
      const isSuccess = response.status === 'success';
      
      if (isSuccess) {
        // Refetch vaults to get the latest data from the server
        await fetchVaults(pagination.page, searchTerm);
        
        // Also refresh vault statistics
        await fetchVaultStats();

        toast({
          title: isFeatured ? "Vault Featured" : "Vault Unfeatured",
          description: `${vault.vaultName} has been ${isFeatured ? 'featured' : 'unfeatured'} successfully.`,
        });
      } else {
        toast({
          title: "Error",
          description: response.message || `Failed to ${isFeatured ? 'feature' : 'unfeature'} vault`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Featured toggle error:', error);
      toast({
        title: "Error",
        description: `Failed to ${isFeatured ? 'feature' : 'unfeature'} vault. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setUpdatingFeatured(null);
    }
  };

  // Define table columns
  const columns: Column<VaultType>[] = [
    {
      key: 'vaultName',
      label: 'Vault',
      render: (_, vault) => (
        <div>
          <div className="font-medium">{vault.vaultName}</div>
          <div className="text-sm text-muted-foreground">
            {vault.vaultSymbol}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {vault.vaultAddress?.slice(0, 8)}...{vault.vaultAddress?.slice(-8)}
          </div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (status) => (
        <Badge
          variant={status === "active" ? "default" : "secondary"}
          className={
            status === "active" 
              ? "bg-success/10 text-success" 
              : status === "pending"
              ? "bg-blue-100 text-blue-800"
              : status === "paused"
              ? "bg-warning/10 text-warning"
              : "bg-destructive/10 text-destructive"
          }
        >
          {status}
        </Badge>
      )
    },
    {
      key: 'assets',
      label: 'Assets',
      render: (_, vault) => (
        <div className="text-sm space-y-1">
          {vault.underlyingAssets?.length > 0 ? vault.underlyingAssets.map((asset, index) => (
            <div key={asset._id} className="flex items-center gap-2">
              {asset.assetAllocation?.logoUrl && (
                <img 
                  src={asset.assetAllocation.logoUrl} 
                  alt={asset.assetAllocation.symbol}
                  className="w-6 h-6 rounded-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <span>
                {asset.assetAllocation?.symbol} ({(asset.pct_bps / 100).toFixed(1)}%)
              </span>
            </div>
          )) : 'No assets'}
        </div>
      )
    },
    {
      key: 'managementFee',
      label: 'Management Fee',
      render: (_, vault) => (
        <div className="text-sm font-medium">
          {vault.feeConfig?.managementFeeBps ? (vault.feeConfig.managementFeeBps / 100).toFixed(2) + '%' : 'N/A'}
        </div>
      )
    },
    {
      key: 'featured',
      label: 'Featured',
      headerClassName: 'text-center',
      render: (_, vault) => (
        <div className="flex items-center justify-center gap-2">
          <Switch
            checked={vault.isFeaturedVault || false}
            onCheckedChange={(checked) => handleFeaturedToggle(vault, checked)}
            disabled={updatingFeatured === vault._id}
            className="data-[state=checked]:bg-primary"
          />
          {updatingFeatured === vault._id && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      )
    },
    {
      key: 'creator',
      label: 'Creator',
      render: (_, vault) => (
        <div className="text-sm">
          <div className="font-medium">{vault.creator?.name || 'Unknown'}</div>
          <div className="text-muted-foreground text-xs">
            {vault.creator?.email || vault.creatorAddress}
          </div>
        </div>
      )
    },
    {
      key: 'vaultIndex',
      label: 'Index',
      render: (_, vault) => (
        <div className="text-sm">
          <div className="font-medium">#{vault.vaultIndex}</div>
          <div className="text-muted-foreground text-xs">
            {vault.network || 'mainnet-beta'}
          </div>
        </div>
      )
    },
    {
      key: 'createdAt',
      label: 'Created',
      render: (createdAt) => new Date(createdAt).toLocaleDateString()
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, vault) => {
        if (vault.status === "active") {
          return (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-warning hover:text-warning"
                  onClick={() => setSelectedVault(vault)}
                  disabled={isContractLoading || !contractConnected || !program}
                >
                  {isContractLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                  {isContractLoading ? "Processing..." : "Pause"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Pause Vault
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will pause all operations for "{vault.vaultName}". Users will not be able to deposit or withdraw.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setPauseReason("")}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handlePauseVault(vault)}
                    className="bg-warning text-warning-foreground hover:bg-warning/90"
                  >
                    Pause Vault
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        } else if (vault.status === "paused") {
          return (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-success hover:text-success"
                  disabled={isContractLoading || !contractConnected || !program}
                >
                  {isContractLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isContractLoading ? "Processing..." : "Resume"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Resume Vault</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will resume all operations for "{vault.vaultName}". Users will be able to deposit and withdraw again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleResumeVault(vault)}
                    className="bg-success text-success-foreground hover:bg-success/90"
                  >
                    Resume Vault
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        } else {
          return (
            <span className="text-sm text-muted-foreground">
              No actions available
            </span>
          );
        }
      }
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vault Management</h1>
        <p className="text-muted-foreground">
          Monitor and control platform vaults
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vaults</CardTitle>
            <Vault className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                vaultStats.totalVaults
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Play className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                vaultStats.activeVaults
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <AlertTriangle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                vaultStats.pendingVaults
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paused</CardTitle>
            <Pause className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                vaultStats.pausedVaults
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Vaults Table */}
      {error ? (
        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => fetchVaults(pagination.page, searchTerm)}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <DynamicTable
          data={filteredVaults}
          columns={columns}
          pagination={pagination}
          onPageChange={handlePageChange}
          currentPage={pagination.page}
          isLoading={loading}
          loadingMessage="Loading vaults..."
          title="Vaults"
          icon={<Vault className="h-5 w-5" />}
          emptyMessage="No vaults found"
        />
      )}

      {/* Success Popup */}
      <SuccessPopup
        isOpen={showSuccessPopup}
        onClose={() => setShowSuccessPopup(false)}
        title="Vault Status Updated Successfully! 🎉"
        description="The vault status has been updated on the blockchain and is now active. The changes will apply immediately."
        transactionSignature={transactionSignature}
        actionType="Vault Status Update"
      />
    </div>
  );
};

export default AdminVaults;