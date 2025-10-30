import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, Clock, DollarSign, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { managementFeesApi } from "@/services/api";
import { useVaultFactory } from "@/hooks/useContract";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SuccessPopup } from "@/components/ui/SuccessPopup";

interface ManagementFeeRecord {
  date: string;
  etf: string;
  nav: number;
  etfCreatorFee: number;
  platformOwnerFee: number;
  todaysAum: number;
  status: 'pending' | 'allocated' | 'in_process';
  previouslyAccruedFees: number;
  newlyAccruedFees: number;
  vaultIndex?: number;
  currentAccruedFees?: number;
  currentTimestamp?: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface ManagementFeesResponse {
  data: ManagementFeeRecord[];
  pagination: PaginationInfo;
}

const ManagementFeesAccrued = () => {
  const { toast } = useToast();
  const { readVaultLiveMetrics, readAccruedManagementFees, distributeAccruedFees, address, isConnected, getFactoryInfo } = useVaultFactory();
  const [managementFeesData, setManagementFeesData] = useState<ManagementFeeRecord[]>([]);
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
  const [currentFeesLoading, setCurrentFeesLoading] = useState(false);
  const [distributing, setDistributing] = useState<number | null>(null);
  // Dynamic fee split ratios from factory (basis points)
  const [creatorSplitBps, setCreatorSplitBps] = useState<number>(7000);
  const [platformSplitBps, setPlatformSplitBps] = useState<number>(3000);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    vaultIndex?: number;
    recordIndex?: number;
  }>({ open: false });

  // Success popup state for showing distribution transaction
  const [successPopup, setSuccessPopup] = useState<{
    isOpen: boolean;
    transactionSignature: string;
    title: string;
    description: string;
    actionType?: string;
  }>({ isOpen: false, transactionSignature: "", title: "", description: "", actionType: "Fee Distribution" });

  // Safe number formatter to avoid runtime errors when API returns null/undefined
  const toFixedSafe = (value: number | null | undefined, digits = 6) => {
    const n = typeof value === "number" ? value : 0;
    return Number.isFinite(n) ? n.toFixed(digits) : (0).toFixed(digits);
  };

  // Fetch management fees from API
  const fetchManagementFees = async (page: number = 1) => {
    setLoading(true);
    setError(null);

    try {
      const response = await managementFeesApi.getManagementFees({
        page,
        limit: pagination.limit
      });

      setManagementFeesData(response.data);
      setPagination(response.pagination);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch management fees";
      setError(errorMessage);
      toast({
        title: "Error",
        description: "Failed to fetch management fees data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  // Read current fees for all vaults in the current data
  const fetchCurrentFeesForAllVaults = async () => {
    if (managementFeesData.length === 0) return;
    
    setCurrentFeesLoading(true);
    try {
      const updatedData = await Promise.all(
        managementFeesData.map(async (record) => {
          const vaultIndex = record.vaultIndex;
          if (vaultIndex === undefined || vaultIndex === null) {
            console.log(`No vault index found for ETF: ${record.etf}`);
            return record; // Skip if no vault index found
          }

          try {
            const result = await readVaultLiveMetrics(vaultIndex);
            return {
              ...record,
              currentAccruedFees: result.newlyAccruedFees,
              currentTimestamp: Math.floor(Date.now() / 1000)
            };
          } catch (e) {
            console.error(`Failed to read vault ${vaultIndex}:`, e);
            return record;
          }
        })
      );
      
      setManagementFeesData(updatedData);
    } catch (e) {
      console.error("Failed to fetch current fees:", e);
    } finally {
      setCurrentFeesLoading(false);
    }
  };

  // Auto-read vault metrics on component mount
  const autoReadVaultMetrics = async () => {
    try {
      // Read vault 0 by default (you can change this to any vault index)
      const vaultIndex = 0;
      const result = await readVaultLiveMetrics(vaultIndex);
      console.log("🔎 Auto-read vault metrics result:", result);
    } catch (e: any) {
      console.error("Failed to auto-read vault metrics:", e);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchManagementFees();
    autoReadVaultMetrics();
  }, []);

  // Fetch dynamic fee split ratios from factory on mount
  useEffect(() => {
    const loadFactorySplits = async () => {
      try {
        const info: any = await getFactoryInfo();
        if (info) {
          if (typeof info.vaultCreatorFeeRatioBps === "number") {
            setCreatorSplitBps(info.vaultCreatorFeeRatioBps);
          }
          if (typeof info.platformFeeRatioBps === "number") {
            setPlatformSplitBps(info.platformFeeRatioBps);
          }
        }
      } catch (e) {
        console.warn("Unable to load factory fee split ratios, using defaults 70/30", e);
      }
    };
    loadFactorySplits();
  }, [getFactoryInfo]);

  // Fetch current fees when management fees data is loaded
  useEffect(() => {
    if (managementFeesData.length > 0) {
      fetchCurrentFeesForAllVaults();
    }
  }, [managementFeesData.length]);

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    fetchManagementFees(newPage);
  };

  // Handle fee distribution
  const handleDistributeFees = async (vaultIndex: number, recordIndex: number) => {
    if (vaultIndex === undefined || vaultIndex === null) {
      toast({
        title: "Error",
        description: "Vault index not found for this record",
        variant: "destructive",
      });
      return;
    }

    // Show confirmation dialog
    setConfirmDialog({
      open: true,
      vaultIndex,
      recordIndex
    });
  };

  const confirmDistributeFees = async () => {
    console.log("🔥 confirmDistributeFees function triggered!");
    const { vaultIndex, recordIndex } = confirmDialog;
    console.log("🚀 confirmDistributeFees called with:", { vaultIndex, recordIndex });
    
    if (vaultIndex === undefined || vaultIndex === null || recordIndex === undefined) {
      console.log("❌ Missing vaultIndex or recordIndex");
      return;
    }

    if (!isConnected || !address) {
      console.log("❌ Wallet not connected:", { isConnected, address });
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to distribute fees.",
        variant: "destructive",
      });
      return;
    }

    console.log("✅ Wallet connected:", { isConnected, address });
    setDistributing(recordIndex);
    setConfirmDialog({ open: false });
    
    try {

      // Optionally read accrued fees for verification (but don't fail if it doesn't work)
      try {
        console.log(`Reading accrued fees for vault ${vaultIndex}...`);
        const accruedFees = await readAccruedManagementFees(vaultIndex);
        console.log("Accrued fees result:", accruedFees);
      } catch (readError) {
        console.warn("Could not read accrued fees, proceeding with distribution:", readError);
      }

      // Distribute the fees
      console.log(`🚀 Starting distribution for vault ${vaultIndex}...`);
      const txSignature = await distributeAccruedFees(vaultIndex);
      console.log(`✅ Distribution completed! Transaction: ${txSignature}`);

      toast({
        title: "Fees Distributed Successfully! 🎉",
        description: `Accrued fees have been distributed as ETF tokens. Transaction: ${txSignature.slice(0, 8)}...`,
      });

      // Show success popup with Solscan link
      setSuccessPopup({
        isOpen: true,
        transactionSignature: txSignature,
        title: "Fees Distributed Successfully!",
        description: `Accrued fees have been distributed for vault ${vaultIndex}.`,
        actionType: "Fee Distribution",
      });

      // Refresh the data to show updated status
      await fetchManagementFees(pagination.page);
      await fetchCurrentFeesForAllVaults();

    } catch (error: any) {
      console.error("Error distributing fees:", error);
      toast({
        title: "Distribution Failed",
        description: error?.message || "Failed to distribute accrued fees",
        variant: "destructive",
      });
    } finally {
      setDistributing(null);
    }
  };


  const getStatusButton = (status: string, vaultIndex?: number, recordIndex?: number) => {
    switch (status) {
      case 'allocated':
        return (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-success hover:text-success"
          >
            <CheckCircle className="h-4 w-4" />
            Allocated
          </Button>
        );
      case 'pending':
        return (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-warning hover:text-warning"
            onClick={() => vaultIndex !== undefined && recordIndex !== undefined ? handleDistributeFees(vaultIndex, recordIndex) : undefined}
            disabled={distributing === recordIndex}
          >
            {distributing === recordIndex ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            {distributing === recordIndex ? "Distributing..." : "Distribute"}
          </Button>
        );
      case 'in_process':
        return (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-blue-600 hover:text-blue-600"
          >
            <Clock className="h-4 w-4" />
            In Process
          </Button>
        );
      default:
        return (
          <Button variant="outline" size="sm">
            Unknown
          </Button>
        );
    }
  };

  // Calculate totals based on newlyAccruedFees with dynamic distribution
  const creatorSplit = creatorSplitBps / 10000; // fraction
  const platformSplit = platformSplitBps / 10000; // fraction
  const totalNewlyAccruedFees = managementFeesData.reduce((sum, record) => sum + (record.newlyAccruedFees || 0), 0);
  const totalEtfCreator = totalNewlyAccruedFees * creatorSplit;
  const totalPlatformOwner = totalNewlyAccruedFees * platformSplit;
  const totalFees = totalEtfCreator + totalPlatformOwner;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Management Fees Accrued</h1>
        <p className="text-muted-foreground">
          Track and monitor management fees allocation across all ETFs
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total ETF Creator Fees</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalEtfCreator.toFixed(6)}</div>
            <p className="text-xs text-muted-foreground">
              {(creatorSplitBps / 100).toFixed(0)}% of {totalNewlyAccruedFees.toFixed(6)} newly accrued fees
            </p>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Platform Owner Fees</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalPlatformOwner.toFixed(6)}</div>
            <p className="text-xs text-muted-foreground">
              {(platformSplitBps / 100).toFixed(0)}% of {totalNewlyAccruedFees.toFixed(6)} newly accrued fees
            </p>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Newly Accrued Fees</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalNewlyAccruedFees.toFixed(6)}</div>
            <p className="text-xs text-muted-foreground">
              From {managementFeesData.length} ETF transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Management Fees Table */}
      <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Management Fees Accrued
          </CardTitle>
          <CardDescription>
            Detailed breakdown of management fees by ETF and date
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead className="w-[120px]">ETF</TableHead>
                  <TableHead className="w-[120px]">NAV</TableHead>
                  <TableHead className="w-[150px]">
                    <div className="flex flex-col">
                      <span>ETF Creator</span>
                      <span className="text-xs text-muted-foreground font-normal">({(creatorSplitBps / 100).toFixed(0)}%)</span>
                    </div>
                  </TableHead>
                  <TableHead className="w-[150px]">
                    <div className="flex flex-col">
                      <span>Platform Owner</span>
                      <span className="text-xs text-muted-foreground font-normal">({(platformSplitBps / 100).toFixed(0)}%)</span>
                    </div>
                  </TableHead>
                  <TableHead className="w-[150px]">Accrued Fees</TableHead>
                  <TableHead className="w-[150px]">Current Accrued Fees</TableHead>
                  <TableHead className="w-[150px]">Today's AUM</TableHead>
                  <TableHead className="w-[150px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading management fees...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <div className="text-destructive">
                        <p className="mb-2">{error}</p>
                        <Button onClick={() => fetchManagementFees(pagination.page)}>
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : managementFeesData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <span className="text-muted-foreground">No management fees data found</span>
                    </TableCell>
                  </TableRow>
                ) : (
                  managementFeesData.map((record, index) => {
                    // Calculate dynamic distribution from newlyAccruedFees
                    const baseNewly = (record.newlyAccruedFees || 0);
                    const etfCreatorFee = baseNewly * creatorSplit;
                    const platformOwnerFee = baseNewly * platformSplit;

                    return (
                      <TableRow key={`${record.date}-${record.etf}-${index}`}>
                        <TableCell className="font-medium">
                          {new Date(record.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{record.etf}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{toFixedSafe(record.nav, 6)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{toFixedSafe(etfCreatorFee, 6)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{toFixedSafe(platformOwnerFee, 6)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{toFixedSafe(record.newlyAccruedFees, 6)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">
                                {record.currentAccruedFees !== undefined 
                                  ? `$${(record.currentAccruedFees / 1_000_000).toFixed(6)}` 
                                  : currentFeesLoading ? "Loading..." : "N/A"
                                }
                              </span>
                            </div>
                            {record.currentTimestamp && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(record.currentTimestamp * 1000).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{toFixedSafe(record.todaysAum, 6)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusButton(record.status, record.vaultIndex, index)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} entries
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrev || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <Button
                        key={pageNum}
                        variant={pagination.page === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        disabled={loading}
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
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.hasNext || loading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Distribute Accrued Fees</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to distribute the accrued fees for vault {confirmDialog.vaultIndex}?
              <br /><br />
              This will distribute the fees as ETF tokens to the fee recipient and vault admin.
              <br /><br />
              <strong>Note:</strong> This will send a transaction to the blockchain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDialog({ open: false })}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              console.log("🎯 AlertDialogAction clicked!");
              confirmDistributeFees();
            }}>
              Distribute Fees
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success Popup for transactions */}
      <SuccessPopup
        isOpen={successPopup.isOpen}
        onClose={() => setSuccessPopup((prev) => ({ ...prev, isOpen: false }))}
        title={successPopup.title}
        description={successPopup.description}
        transactionSignature={successPopup.transactionSignature}
        actionType={successPopup.actionType}
      />
    </div>
  );
};

export default ManagementFeesAccrued;
