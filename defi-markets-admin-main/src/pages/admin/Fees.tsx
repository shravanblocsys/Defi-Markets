import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign,
  History,
  Edit,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { feeHistoryApi, feesManagementApi } from "@/services/api";
import { useContract, useVaultFactory } from "@/hooks/useContract";
import { useAppKitProvider } from "@reown/appkit/react";
import { VAULT_FACTORY_PROGRAM_ID } from "@/components/solana/programIds/programids";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import {
  percentageToBps,
  formatBpsAsPercentage,
  getFeeTypeDisplayName,
  getFeeUnit,
  formatFeeValue,
  validateFeeRange,
  clampFeeValue,
  usdcToLamports,
} from "@/lib/helpers";

const feeSchema = z
  .object({
    entry_fee: z.number().min(0).max(100, "Fee cannot exceed 100%").optional(),
    exit_fee: z.number().min(0).max(100, "Fee cannot exceed 100%").optional(),
    vault_creation_fee: z.number().min(0, "Fee cannot be negative").optional(),
    management_min: z
      .number()
      .min(0)
      .max(100, "Fee cannot exceed 100%")
      .optional(),
    management_max: z
      .number()
      .min(0)
      .max(100, "Fee cannot exceed 100%")
      .optional(),
    vault_creator_management_fee: z
      .number()
      .min(0)
      .max(100, "Fee cannot exceed 100%")
      .optional(),
    platform_owner_management_fee: z
      .number()
      .min(0)
      .max(100, "Fee cannot exceed 100%")
      .optional(),
  })
  .superRefine((data, ctx) => {
    const {
      vault_creator_management_fee: creatorPct,
      platform_owner_management_fee: platformPct,
    } = data as any;

    const creatorProvided = creatorPct !== undefined && creatorPct !== null;
    const platformProvided = platformPct !== undefined && platformPct !== null;

    // If one provided, both must be provided
    if (
      (creatorProvided && !platformProvided) ||
      (!creatorProvided && platformProvided)
    ) {
      const message =
        "Both split percentages are required when setting management fee split";
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vault_creator_management_fee"],
        message,
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["platform_owner_management_fee"],
        message,
      });
      return;
    }

    // If both provided, they must sum to exactly 100%
    if (creatorProvided && platformProvided) {
      const sum = Number(creatorPct) + Number(platformPct);
      if (Math.abs(sum - 100) > 1e-6) {
        const message = "Split must sum to 100%";
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vault_creator_management_fee"],
          message,
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["platform_owner_management_fee"],
          message,
        });
      }
    }
  });

type FeeForm = z.infer<typeof feeSchema>;

interface FeeConfig {
  _id: string;
  fees: Array<{
    feeRate?: number;
    minFeeRate?: number;
    maxFeeRate?: number;
    description: string;
    type: string;
  }>;
  createdBy: {
    _id: string;
    username: string;
    email: string;
    name: string;
  } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

interface FeeRecord {
  _id: string;
  action: string;
  description: string;
  performedBy: {
    _id: string;
    username: string;
    email: string;
    name: string;
  } | null;
  feeId?: {
    _id: string;
    fees: Array<{
      feeRate?: number;
      minFeeRate?: number;
      maxFeeRate?: number;
      description: string;
      type: string;
    }>;
    isActive: boolean;
  } | null;
  relatedEntity: string;
  metadata?: {
    updateType?: string;
    changedFields?: string[];
    eventType?: string;
    factory?: string;
    walletAddress?: string;
    timestamp?: string;
    updatedAt?: string;
    changes?: {
      // Blockchain-based changes (FactoryFeesUpdated events)
      entryFee?: {
        from: number;
        to: number;
        unit?: string;
      };
      exitFee?: {
        from: number;
        to: number;
        unit?: string;
      };
      vaultCreationFee?: {
        from: number;
        to: number;
        unit?: string;
      };
      managementFeeMin?: {
        from: number;
        to: number;
        unit?: string;
      };
      managementFeeMax?: {
        from: number;
        to: number;
        unit?: string;
      };
      // Legacy API-based changes
      fees?: {
        [feeType: string]: {
          feeRate?: {
            from: number;
            to: number;
          };
          minFeeRate?: {
            from: number;
            to: number;
          };
          maxFeeRate?: {
            from: number;
            to: number;
          };
        };
      };
    };
    previousValues?: {
      fees?: Array<{
        feeRate?: number;
        minFeeRate?: number;
        maxFeeRate?: number;
        description: string;
        type: string;
      }>;
      isActive?: boolean;
    };
    newValues?: {
      fees?: Array<{
        feeRate?: number;
        minFeeRate?: number;
        maxFeeRate?: number;
        description: string;
        type: string;
      }>;
      isActive?: boolean;
    };
    updatedFields?: string[];
    feeRate?: number;
    effectiveDate?: string;
    description?: string;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
  __v: number;
}

interface FeeHistoryResponse {
  data: FeeRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const Fees = () => {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feeHistory, setFeeHistory] = useState<FeeRecord[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingFees, setIsLoadingFees] = useState(false);
  const [currentFeeConfig, setCurrentFeeConfig] = useState<FeeConfig | null>(
    null
  );

  // Contract-related state and hooks
  const {
    callContract,
    loading: contractLoading,
    error: contractError,
    isConnected,
    address,
    connection,
  } = useContract();
  const { walletProvider } = useAppKitProvider("solana");

  // Vault factory hook for Anchor program operations
  const {
    program,
    error: programError,
    isConnected: factoryConnected,
    address: factoryAddress,
    updateFactoryFees: anchorUpdateFactoryFees,
    getFactoryInfo,
    getFactoryPDA,
  } = useVaultFactory();

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<string>("");
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);

  // Get fees ID from environment variable
  const feesId = import.meta.env.VITE_FEES_ID;

  // Helper functions are now imported from @/lib/helpers

  const form = useForm<FeeForm>({
    resolver: zodResolver(feeSchema),
    defaultValues: {
      entry_fee: undefined,
      exit_fee: undefined,
      vault_creation_fee: undefined,
      management_min: undefined,
      management_max: undefined,
      vault_creator_management_fee: undefined,
      platform_owner_management_fee: undefined,
    },
  });

  // Fetch current fee configuration
  const fetchCurrentFees = async () => {
    if (!feesId) {
      return;
    }

    setIsLoadingFees(true);
    try {
      const response = await feesManagementApi.getFees(feesId);
      setCurrentFeeConfig(response.data);
    } catch (error) {
      toast({
        title: "Error",
        description:
          "Failed to load current fee configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFees(false);
    }
  };

  // Fetch fee history
  const fetchFeeHistory = async (page: number = 1, limit: number = 10) => {
    setIsLoadingHistory(true);
    try {
      const response = await feeHistoryApi.getFeeHistory({ page, limit });
      setFeeHistory(response.data);
      setPagination(response.pagination);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load fee history. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchCurrentFees();
    fetchFeeHistory();
  }, []);

  // Auto-populate form when editing mode is enabled and current fee config is available
  useEffect(() => {
    if (isEditing && currentFeeConfig) {
      const fees = currentFeeConfig.fees;
      form.reset({
        entry_fee: fees.find((f) => f.type === "entry_fee")?.feeRate,
        exit_fee: fees.find((f) => f.type === "exit_fee")?.feeRate,
        vault_creation_fee: fees.find((f) => f.type === "vault_creation_fee")
          ?.feeRate,
        management_min: fees.find((f) => f.type === "management")?.minFeeRate,
        management_max: fees.find((f) => f.type === "management")?.maxFeeRate,
        vault_creator_management_fee: fees.find(
          (f) => f.type === "vault_creator_management_fee"
        )?.feeRate,
        platform_owner_management_fee: fees.find(
          (f) => f.type === "platform_owner_management_fee"
        )?.feeRate,
      });
    }
  }, [isEditing, currentFeeConfig, form]);

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    fetchFeeHistory(newPage, pagination.limit);
  };

  const onSubmit = async (data: FeeForm) => {
    if (!feesId) {
      toast({
        title: "Error",
        description: "Fees ID not found. Please check configuration.",
        variant: "destructive",
      });
      return;
    }

    // Check wallet connection first
    if (!factoryConnected || !factoryAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first to update factory fees.",
        variant: "destructive",
      });
      return;
    }

    // Check if Anchor program is available
    if (!program) {
      toast({
        title: "Program Not Ready",
        description:
          programError || "Anchor program not initialized. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setIsDeploying(true);
    setDeployError(null);
    setDeploySuccess(false);
    setTransactionSignature("");
    setShowSuccessPopup(false);

    try {
      // Validate management fee range if both values are provided
      if (
        data.management_min !== undefined &&
        data.management_min !== null &&
        data.management_max !== undefined &&
        data.management_max !== null &&
        !validateFeeRange(data.management_min, data.management_max)
      ) {
        toast({
          title: "Invalid Range",
          description: "Management fee minimum cannot be greater than maximum.",
          variant: "destructive",
        });
        return;
      }

      // Check if any fees were provided
      const hasAnyFees =
        data.entry_fee !== undefined ||
        data.exit_fee !== undefined ||
        data.vault_creation_fee !== undefined ||
        data.management_min !== undefined ||
        data.management_max !== undefined ||
        data.vault_creator_management_fee !== undefined ||
        data.platform_owner_management_fee !== undefined;

      if (!hasAnyFees) {
        toast({
          title: "No Changes",
          description: "Please enter at least one fee value to update.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Updating Factory Fees...",
        description:
          "Your factory fees are being updated on the blockchain. This may take a few minutes.",
      });

      // Get current factory info to preserve existing values for unchanged fees
      let currentFactoryInfo;
      try {
        currentFactoryInfo = await getFactoryInfo();
        console.log("📊 Current factory info:", currentFactoryInfo);
      } catch (error) {
        console.warn(
          "Could not fetch current factory info, using defaults:",
          error
        );
        // Use default values if we can't fetch current info
        currentFactoryInfo = {
          entryFeeBps: 25,
          exitFeeBps: 25,
          vaultCreationFeeUsdc: 2000000, // 2 USDC in lamports (2 * 1e6)
          minManagementFeeBps: 50,
          maxManagementFeeBps: 300,
        };
      }

      // Prepare fee values - use provided values or keep existing ones
      const entryFeeBps =
        data.entry_fee !== undefined
          ? percentageToBps(data.entry_fee)
          : currentFactoryInfo.entryFeeBps;
      const exitFeeBps =
        data.exit_fee !== undefined
          ? percentageToBps(data.exit_fee)
          : currentFactoryInfo.exitFeeBps;
      // Convert USDC amount to lamports (1 USDC = 1e6 lamports)
      const vaultCreationFeeUsdc =
        data.vault_creation_fee !== undefined
          ? usdcToLamports(data.vault_creation_fee)
          : Number(currentFactoryInfo.vaultCreationFeeUsdc);
      const minManagementFeeBps =
        data.management_min !== undefined
          ? percentageToBps(data.management_min)
          : currentFactoryInfo.minManagementFeeBps;
      const maxManagementFeeBps =
        data.management_max !== undefined
          ? percentageToBps(data.management_max)
          : currentFactoryInfo.maxManagementFeeBps;
      const vaultCreatorFeeRatioBps =
        data.vault_creator_management_fee !== undefined
          ? percentageToBps(data.vault_creator_management_fee)
          : currentFactoryInfo.vaultCreatorFeeRatioBps || 70; // Default to 0.7%
      const platformFeeRatioBps =
        data.platform_owner_management_fee !== undefined
          ? percentageToBps(data.platform_owner_management_fee)
          : currentFactoryInfo.platformFeeRatioBps || 30; // Default to 0.3%

      console.log("💰 Updating factory fees with values:", {
        entryFeeBps,
        exitFeeBps,
        vaultCreationFeeUsdc,
        minManagementFeeBps,
        maxManagementFeeBps,
        vaultCreatorFeeRatioBps,
        platformFeeRatioBps,
      });

      // Use Anchor program to update factory fees (matching script.ts implementation)
      const tx = await anchorUpdateFactoryFees(
        entryFeeBps,
        exitFeeBps,
        vaultCreationFeeUsdc,
        minManagementFeeBps,
        maxManagementFeeBps,
        vaultCreatorFeeRatioBps,
        platformFeeRatioBps
      );

      setDeploySuccess(true);
      setTransactionSignature(tx);

      // Call the fees management API to record the fee update
      try {
        // Prepare fees array for API call based on what was updated
        const feesToUpdate = [];

        if (data.entry_fee !== undefined) {
          feesToUpdate.push({
            feeRate: data.entry_fee,
            description: "Entry fee for vault deposits",
            type: "entry_fee",
          });
        }

        if (data.exit_fee !== undefined) {
          feesToUpdate.push({
            feeRate: data.exit_fee,
            description: "Exit fee for vault redemptions",
            type: "exit_fee",
          });
        }

        if (data.vault_creation_fee !== undefined) {
          // IMPORTANT: vault_creation_fee feeRate is in USDC amount (e.g., 2.0 = 2 USDC)
          // NOT a percentage or basis points. Backend must interpret this correctly.
          // Other fee types (entry_fee, exit_fee, etc.) use percentage values.
          feesToUpdate.push({
            feeRate: data.vault_creation_fee, // USDC amount (e.g., 2.0)
            description: "Vault creation fee",
            type: "vault_creation_fee",
          });
        }

        if (
          data.management_min !== undefined ||
          data.management_max !== undefined
        ) {
          feesToUpdate.push({
            minFeeRate: data.management_min,
            maxFeeRate: data.management_max,
            description: "Management fee range for vault operations",
            type: "management",
          });
        }

        if (data.vault_creator_management_fee !== undefined) {
          feesToUpdate.push({
            feeRate: data.vault_creator_management_fee,
            description: "Vault creator management fee percentage",
            type: "vault_creator_management_fee",
          });
        }

        if (data.platform_owner_management_fee !== undefined) {
          feesToUpdate.push({
            feeRate: data.platform_owner_management_fee,
            description: "Platform owner management fee percentage",
            type: "platform_owner_management_fee",
          });
        }

        const result = await feesManagementApi.updateFees(feesId, feesToUpdate);

        // Show success popup after both blockchain update and API call are successful
        setShowSuccessPopup(true);
      } catch (apiError) {
        console.error("Error calling fees management API:", apiError);
        // Don't fail the entire operation if API call fails - transaction was successful
        toast({
          title: "Transaction Successful",
          description:
            "Factory fees updated on blockchain, but failed to record in backend. Transaction: " +
            tx.slice(0, 8) +
            "...",
          variant: "default",
        });

        // Still show popup even if API call fails - blockchain update was successful
        setShowSuccessPopup(true);
      }

      // Refresh both fee history and current fees
      await Promise.all([fetchFeeHistory(), fetchCurrentFees()]);

      toast({
        title: "Factory Fees Updated Successfully! 🎉",
        description: `Your factory fees have been updated on the blockchain. Transaction: ${tx.slice(
          0,
          8
        )}...`,
      });

      setIsEditing(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to update factory fees";
      setDeployError(errorMessage);

      toast({
        title: "Factory Fee Update Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsDeploying(false);
    }
  };

  // formatBpsToPercentage is now imported from @/lib/helpers as formatBpsAsPercentage

  // Helper function to get current management fee for display
  const getCurrentManagementFee = () => {
    if (!currentFeeConfig) return null;

    const managementFee = currentFeeConfig.fees.find(
      (f) => f.type === "management"
    );
    if (!managementFee) return null;

    return {
      minRate: managementFee.minFeeRate,
      maxRate: managementFee.maxFeeRate,
      description: managementFee.description,
      effectiveDate: currentFeeConfig.updatedAt,
      createdBy: currentFeeConfig.createdBy?.email || "Unknown",
    };
  };

  // Helper function to extract fee information from API response
  const getFeeInfo = (record: FeeRecord) => {
    if (record.metadata?.feeRate) {
      return {
        feeRate: record.metadata.feeRate,
        type: "management",
        description: record.metadata.description || "Management fee",
      };
    }

    if (record.feeId?.fees && record.feeId.fees.length > 0) {
      // Get the first fee or find management fee
      const managementFee = record.feeId.fees.find(
        (f) => f.type === "management"
      );
      const fee = managementFee || record.feeId.fees[0];

      return {
        feeRate: fee.feeRate || fee.minFeeRate || 0,
        type: fee.type,
        description: fee.description,
      };
    }

    return {
      feeRate: 0,
      type: "unknown",
      description: "Unknown fee type",
    };
  };

  // Helper function to get action display text
  const getActionDisplay = (action: string) => {
    switch (action) {
      case "fee_created":
        return "Created";
      case "fee_updated":
        return "Updated";
      default:
        return action
          .replace("_", " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
    }
  };

  // Helper function to get detailed changes from metadata
  const getDetailedChanges = (record: FeeRecord) => {
    // Handle blockchain-based updates (FactoryFeesUpdated events)
    if (record.metadata?.changes && !record.metadata.changes.fees) {
      const changes = record.metadata.changes;
      const changeDetails: string[] = [];

      // Entry fee changes
      if (changes.entryFee) {
        const from = changes.entryFee.from;
        const to = changes.entryFee.to;
        const unit = changes.entryFee.unit || getFeeUnit("entry_fee");
        changeDetails.push(
          `${getFeeTypeDisplayName("entry_fee")}: ${from}${unit} → ${to}${unit}`
        );
      }

      // Exit fee changes
      if (changes.exitFee) {
        const from = changes.exitFee.from;
        const to = changes.exitFee.to;
        const unit = changes.exitFee.unit || getFeeUnit("exit_fee");
        changeDetails.push(
          `${getFeeTypeDisplayName("exit_fee")}: ${from}${unit} → ${to}${unit}`
        );
      }

      // Vault creation fee changes
      if (changes.vaultCreationFee) {
        const from = changes.vaultCreationFee.from;
        const to = changes.vaultCreationFee.to;
        const unit =
          changes.vaultCreationFee.unit || getFeeUnit("vault_creation_fee");
        changeDetails.push(
          `${getFeeTypeDisplayName(
            "vault_creation_fee"
          )}: ${from}${unit} → ${to}${unit}`
        );
      }

      // Management fee min changes
      if (changes.managementFeeMin) {
        const from = changes.managementFeeMin.from;
        const to = changes.managementFeeMin.to;
        const unit =
          changes.managementFeeMin.unit || getFeeUnit("management_min");
        changeDetails.push(
          `${getFeeTypeDisplayName(
            "management_min"
          )}: ${from}${unit} → ${to}${unit}`
        );
      }

      // Management fee max changes
      if (changes.managementFeeMax) {
        const from = changes.managementFeeMax.from;
        const to = changes.managementFeeMax.to;
        const unit =
          changes.managementFeeMax.unit || getFeeUnit("management_max");
        changeDetails.push(
          `${getFeeTypeDisplayName(
            "management_max"
          )}: ${from}${unit} → ${to}${unit}`
        );
      }

      return changeDetails.length > 0
        ? changeDetails.join(", ")
        : record.description;
    }

    // Handle manual API updates (legacy format)
    if (record.metadata?.changes?.fees) {
      const changes = record.metadata.changes.fees;
      const changeDetails: string[] = [];

      Object.entries(changes).forEach(
        ([feeType, changeData]: [string, any]) => {
          if (changeData.feeRate) {
            const from = changeData.feeRate.from;
            const to = changeData.feeRate.to;
            const unit = getFeeUnit(feeType);
            changeDetails.push(
              `${getFeeTypeDisplayName(feeType)}: ${from}${unit} → ${to}${unit}`
            );
          }
          if (changeData.minFeeRate) {
            const from = changeData.minFeeRate.from;
            const to = changeData.minFeeRate.to;
            const unit = getFeeUnit(feeType);
            changeDetails.push(
              `${getFeeTypeDisplayName(
                feeType
              )} min: ${from}${unit} → ${to}${unit}`
            );
          }
          if (changeData.maxFeeRate) {
            const from = changeData.maxFeeRate.from;
            const to = changeData.maxFeeRate.to;
            const unit = getFeeUnit(feeType);
            changeDetails.push(
              `${getFeeTypeDisplayName(
                feeType
              )} max: ${from}${unit} → ${to}${unit}`
            );
          }
        }
      );

      return changeDetails.length > 0
        ? changeDetails.join(", ")
        : record.description;
    }

    return record.description;
  };

  // Helper function to get changed fields
  const getChangedFields = (record: FeeRecord) => {
    // Handle blockchain-based updates (FactoryFeesUpdated events)
    if (record.metadata?.changes && !record.metadata.changes.fees) {
      const changes = record.metadata.changes;
      const changedFields: string[] = [];

      if (changes.entryFee)
        changedFields.push(getFeeTypeDisplayName("entry_fee"));
      if (changes.exitFee)
        changedFields.push(getFeeTypeDisplayName("exit_fee"));
      if (changes.vaultCreationFee)
        changedFields.push(getFeeTypeDisplayName("vault_creation_fee"));
      if (changes.managementFeeMin)
        changedFields.push(getFeeTypeDisplayName("management_min"));
      if (changes.managementFeeMax)
        changedFields.push(getFeeTypeDisplayName("management_max"));

      return changedFields.length > 0 ? changedFields.join(", ") : "N/A";
    }

    // Handle manual API updates (legacy format)
    if (record.metadata?.changedFields) {
      return record.metadata.changedFields.join(", ");
    }

    return "N/A";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fee Management</h1>
        <p className="text-muted-foreground">
          Manage platform management fees and view historical changes
        </p>
      </div>

      {/* Current Fee Card */}
      <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Current Management Fee
          </CardTitle>
          <CardDescription>
            Active fee rate applied to all vaults
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingFees ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading fee configuration...</span>
            </div>
          ) : !isEditing ? (
            <div className="space-y-4">
              {/* Current Management Fee Display */}
              {getCurrentManagementFee() && (
                <div className="flex items-center justify-between p-4 bg-surface-2/50 rounded-lg">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-bold">
                        {getCurrentManagementFee()?.minRate}% -{" "}
                        {getCurrentManagementFee()?.maxRate}%
                      </span>
                      <Badge variant="secondary">Management Fee Range</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getCurrentManagementFee()?.description}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Effective since{" "}
                      {new Date(
                        getCurrentManagementFee()?.effectiveDate || ""
                      ).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last updated by {getCurrentManagementFee()?.createdBy}
                    </p>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <Edit className="h-4 w-4" />
                        Update Fees
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Update Fee Configuration
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will change the fee rates for all vaults. This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => setIsEditing(true)}>
                          Continue
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

              {/* All Fees Overview */}
              {currentFeeConfig && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {currentFeeConfig.fees.map((fee) => (
                    <div
                      key={fee.type}
                      className="p-3 bg-surface-2/30 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="capitalize">
                          {getFeeTypeDisplayName(fee.type)}
                        </Badge>
                      </div>
                      <div className="text-lg font-semibold">
                        {fee.feeRate
                          ? formatFeeValue(fee.type, fee.feeRate)
                          : fee.minFeeRate && fee.maxFeeRate
                          ? `${formatFeeValue(
                              fee.type,
                              fee.minFeeRate
                            )} - ${formatFeeValue(fee.type, fee.maxFeeRate)}`
                          : "N/A"}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fee.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Program Status */}
              {/* <div className="p-4 glass-surface rounded-lg">
                <div className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-info mt-0.5" />
                  <div className="space-y-2">
                    <p className="font-medium">Contract Status</p>
                    <div className="space-y-1 text-sm">
                      {!isConnected ? (
                        <div className="flex items-center gap-2 text-warning">
                          <X className="w-4 h-4" />
                          <span>Wallet not connected. Please connect your wallet to update factory fees.</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-success">
                          <Save className="w-4 h-4" />
                          <span>Ready to update factory fees using raw instructions</span>
                        </div>
                      )}

                      {contractError && (
                        <div className="flex items-center gap-2 text-destructive">
                          <X className="w-4 h-4" />
                          <span>Contract error: {contractError}</span>
                        </div>
                      )}

                      {deployError && (
                        <div className="flex items-center gap-2 text-destructive">
                          <X className="w-4 h-4" />
                          <span>Deployment error: {deployError}</span>
                        </div>
                      )}

                      {deploySuccess && transactionSignature && (
                        <div className="flex items-center gap-2 text-success">
                          <Save className="w-4 h-4" />
                          <span>Factory fees updated successfully! Transaction: {transactionSignature.slice(0, 8)}...</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Factory fees will be updated directly on the blockchain. This action requires admin privileges and cannot be undone.
                    </p>
                  </div>
                </div>
              </div> */}

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Entry Fee */}
                    <FormField
                      control={form.control}
                      name="entry_fee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Entry Fee (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="3.0"
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Exit Fee */}
                    <FormField
                      control={form.control}
                      name="exit_fee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exit Fee (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="3.0"
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Vault Creation Fee */}
                    <FormField
                      control={form.control}
                      name="vault_creation_fee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vault Creation Fee (USDC)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="2.0"
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Management Fee Min */}
                    <FormField
                      control={form.control}
                      name="management_min"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Management Fee Min (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="1.5"
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Management Fee Max */}
                    <FormField
                      control={form.control}
                      name="management_max"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Management Fee Max (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="3.0"
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Vault Creator Management Fee */}
                    <FormField
                      control={form.control}
                      name="vault_creator_management_fee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Vault Creator Management Fee (%)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="0.7"
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Platform Owner Management Fee */}
                    <FormField
                      control={form.control}
                      name="platform_owner_management_fee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Platform Owner Management Fee (%)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="0.3"
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      disabled={
                        isLoading ||
                        isDeploying ||
                        !factoryConnected ||
                        !program
                      }
                      className="gap-2"
                    >
                      {isLoading || isDeploying ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          {isDeploying
                            ? "Updating on Blockchain..."
                            : "Updating..."}
                        </>
                      ) : !factoryConnected ? (
                        <>
                          <X className="h-4 w-4" />
                          Wallet Not Connected
                        </>
                      ) : !program ? (
                        <>
                          <X className="h-4 w-4" />
                          Program Not Ready
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Update Factory Fees
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        // Reset form to empty values
                        form.reset({
                          entry_fee: undefined,
                          exit_fee: undefined,
                          vault_creation_fee: undefined,
                          management_min: undefined,
                          management_max: undefined,
                          vault_creator_management_fee: undefined,
                          platform_owner_management_fee: undefined,
                        });
                      }}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fee History */}
      <Card className="bg-surface-1/50 backdrop-blur-sm border-border-subtle">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Fee History
          </CardTitle>
          <CardDescription>
            Historical changes to fee configurations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading fee history...</span>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Changes</TableHead>
                    <TableHead>Changed Fields</TableHead>
                    <TableHead>Performed By</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeHistory.map((record) => {
                    return (
                      <TableRow key={record._id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {getActionDisplay(record.action)}
                            </Badge>
                            {record.metadata?.eventType ===
                              "FactoryFeesUpdated" && (
                              <Badge variant="outline" className="text-xs">
                                Blockchain
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="space-y-1">
                            <div className="font-medium text-sm">
                              {getDetailedChanges(record)}
                            </div>
                            {record.metadata?.updateType && (
                              <Badge variant="outline" className="text-xs">
                                {record.metadata.updateType.replace("_", " ")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {getChangedFields(record)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {record.performedBy?.name || "Unknown"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {record.performedBy?.email || "N/A"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>
                              {new Date(record.createdAt).toLocaleDateString()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(record.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total
                    )}{" "}
                    of {pagination.total} entries
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={!pagination.hasPrev || isLoadingHistory}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(5, pagination.totalPages) },
                        (_, i) => {
                          const pageNum = i + 1;
                          return (
                            <Button
                              key={pageNum}
                              variant={
                                pagination.page === pageNum
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() => handlePageChange(pageNum)}
                              disabled={isLoadingHistory}
                              className="w-8 h-8 p-0"
                            >
                              {pageNum}
                            </Button>
                          );
                        }
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={!pagination.hasNext || isLoadingHistory}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Success Popup */}
      <SuccessPopup
        isOpen={showSuccessPopup}
        onClose={() => setShowSuccessPopup(false)}
        title="Factory Fees Updated Successfully! 🎉"
        description="Your factory fees have been updated on the blockchain and are now active. The changes will apply to all new vaults created."
        transactionSignature={transactionSignature}
        actionType="Fee Update"
      />
    </div>
  );
};

export default Fees;
