import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  DollarSign,
  Users,
  BarChart3,
  ArrowUpRight,
  ArrowDown,
  Target,
  Activity,
  Settings,
  User,
  RefreshCw,
  AlertCircle,
  Globe,
  ChevronDown,
  Info,
} from "lucide-react";
import type { Vault } from "@/types/store";
import { useToast } from "@/hooks/use-toast";
import FeesTab from "@/components/vault/FeesTab";
import ActivityTab from "@/components/vault/ActivityTab";
import OverviewTab from "@/components/vault/OverviewTab";
import { useParams, useNavigate } from "react-router-dom";
import MyDepositTab from "@/components/vault/MyDepositTab";
import PortfolioTab from "@/components/vault/PortfolioTab";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import LoadingPopup from "@/components/ui/LoadingPopup";
import FinancialsTab from "@/components/vault/FinancialsTab";
import DepositorsTab from "@/components/vault/DepositorsTab";
import {
  vaultsApi,
  transactionEventApi,
  portfolioApi,
  chartApi,
} from "@/services/api";
// Tabs removed; rendering all sections inline on the page

import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { useAuth } from "@/hooks/useAuth";
import * as anchor from "@coral-xyz/anchor";
import { Idl } from "@coral-xyz/anchor";
import { VAULT_FACTORY_IDL } from "@/components/solana/Idl/vaultFactory";
import { useContract, useVaultCreation } from "@/hooks/useContract";
import { VAULT_FACTORY_PROGRAM_ID } from "@/components/solana/programIds/programids";
import {
  getInitials,
  bpsToPercentage,
  bpsToPercentageString,
  formatAmount,
  formatCurrency,
} from "@/lib/helpers";

// Helper function to format percentage values properly
const formatPercentage = (value: number): string => {
  if (!isFinite(value) || Math.abs(value) > 999999) {
    return "0.00";
  }
  return value.toFixed(2);
};

// Helper function to format TVL/NAV with 4 decimal places
const formatTVL = (value: number): string => {
  if (value === 0) return "$0.0000";
  return `$${value.toFixed(4)}`;
};
import { useAppKitAccount } from "@reown/appkit/react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppSelector } from "@/store";
import { useVaultValuation } from "@/hooks/useVaultValuation";
// Raydium removed for deposit/redeem flows

const VaultDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Get calculated APY data from Redux store
  const { vaultFinalData } = useAppSelector((state) => state.vaults);

  const [vault, setVault] = useState<Vault | null>(null);
  const [vaultInsights, setVaultInsights] = useState<{
    totalUnderlyingAssetsCount: number;
    totalUsersCount: number;
    vaultSymbol: string;
  } | null>(null);
  const [portfolioData, setPortfolioData] = useState<{
    vaultSymbol: string;
    assets: Array<{
      assetName: string;
      logoUrl: string;
      percentageAllocation: number;
      price: number;
      change24h: number;
    }>;
  } | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [financials, setFinancials] = useState<{
    grossAssetValue: number;
    netAssetValue: number;
  } | null>(null);
  const [financialsLoading, setFinancialsLoading] = useState(false);
  const [feesData, setFeesData] = useState<{
    fees: Array<{
      feeRate?: number;
      minFeeRate?: number;
      maxFeeRate?: number;
      description: string;
      type: string;
    }>;
    vaultFees: number;
  } | null>(null);
  const [feesLoading, setFeesLoading] = useState(false);
  const [depositorsData, setDepositorsData] = useState<{
    totalUsers: number;
    holdings: Array<{
      walletAddress: string;
      totalHolding: number;
      sharesHeld: number;
      userProfile: {
        username: string;
        name: string;
        avatar: string;
      };
    }>;
  } | null>(null);
  const [depositorsLoading, setDepositorsLoading] = useState(false);
  const [activityData, setActivityData] = useState<Array<{
    _id: string;
    action: string;
    description: string;
    performedBy: {
      _id: string;
      username: string;
      email: string;
      name: string;
    };
    vaultId: {
      _id: string;
      vaultName: string;
      vaultSymbol: string;
    };
    relatedEntity: string;
    metadata?: {
      [key: string]: string | number;
    };
    transactionSignature?: string;
    createdAt: string;
    updatedAt: string;
    __v?: number;
  }> | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPagination, setActivityPagination] = useState<{
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  }>({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 20,
  });
  const [userDepositsData, setUserDepositsData] = useState<{
    totalDeposited: number;
    totalRedeemed: number;
    currentValue: number;
    totalReturns: number;
    vaultSymbol: string;
    userAddress: string;
  } | null>(null);
  const [userDepositsLoading, setUserDepositsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [redeemModalOpen, setRedeemModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("USDC");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<string>("");
  const [depositStepIndex, setDepositStepIndex] = useState(0);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemStep, setRedeemStep] = useState<string>("");
  const [redeemStepIndex, setRedeemStepIndex] = useState(0);
  const [showDepositSuccessPopup, setShowDepositSuccessPopup] = useState(false);
  const [showRedeemSuccessPopup, setShowRedeemSuccessPopup] = useState(false);
  const [depositTransactionSignature, setDepositTransactionSignature] =
    useState("");
  const [depositSwapSignatures, setDepositSwapSignatures] = useState<string[]>(
    []
  );
  const [redeemSwapSignatures, setRedeemSwapSignatures] = useState<string[]>(
    []
  );
  const [redeemTransactionSignature, setRedeemTransactionSignature] =
    useState("");
  const [lastRedeemTime, setLastRedeemTime] = useState<number>(0);
  const [userDepositAmount, setUserDepositAmount] = useState<number>(0);
  const [actualDepositAmount, setActualDepositAmount] = useState<string>("");
  const [actualRedeemAmount, setActualRedeemAmount] = useState<string>("");
  const [vaultFees, setVaultFees] = useState<{
    entryFeeBps: number;
    exitFeeBps: number;
    vaultManagementFees: number;
  } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // TVL/NAV from API (both use totalUsd)
  const [vaultTVL, setVaultTVL] = useState<{
    totalUsd: number;
    loading: boolean;
  }>({ totalUsd: 0, loading: false });

  // Define steps for deposit and redeem flows
  const depositSteps = [
    "Preparing accounts...",
    "Building transaction...",
    "Executing transaction...",
    "Processing deposit...",
    "Executing swaps...",
    "Refreshing data...",
  ];

  const redeemSteps = [
    "Preparing accounts...",
    "Building transaction...",
    "Processing redemption...",
    "Executing transaction...",
    "Recording transaction...",
    "Refreshing data...",
  ];

  // Helper function to add small delay for better UX
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // Fetch TVL/NAV from API
  const fetchVaultTVL = async (vaultId: string) => {
    // Guard against undefined or invalid vault IDs
    if (!vaultId || vaultId === "undefined" || vaultId.trim() === "") {
      console.warn("Cannot fetch vault TVL: invalid vault ID", vaultId);
      setVaultTVL({ totalUsd: 0, loading: false });
      return;
    }
    try {
      setVaultTVL((prev) => ({ ...prev, loading: true }));
      const response = await chartApi.getVaultTotalUSD([vaultId]);

      if (response && response.data && response.data.data.length > 0) {
        const tvlData = response.data.data[0];
        setVaultTVL({
          totalUsd: tvlData.totalUsd,
          loading: false,
        });
      } else {
        setVaultTVL({ totalUsd: 0, loading: false });
      }
    } catch (error) {
      console.error("Failed to fetch vault TVL:", error);
      setVaultTVL({ totalUsd: 0, loading: false });
    }
  };

  // Comprehensive refresh function for after successful transactions
  const refreshAllData = async () => {
    if (!id || !vault) return;

    try {
      // console.log("🔄 Refreshing all data after transaction...");

      // Refresh vault details and insights
      await fetchVaultDetails(true);

      // Refresh user-specific data
      await fetchUserDeposits(id);

      // Refresh vault-specific data (including fees from API) - sequential to avoid 504 timeout
      await fetchVaultInsights(id);
      await fetchVaultPortfolio(id);
      await fetchVaultDepositors(id);
      await fetchVaultActivity(
        id,
        activityPagination.currentPage,
        activityPagination.itemsPerPage
      );
      await fetchVaultFees(id); // Refresh fees from API as well

      // Refresh vault valuation (GAV/NAV)
      if (refetchValuation) {
        await refetchValuation();
      }

      // Refresh TVL/NAV from API
      if (vault?._id) {
        await fetchVaultTVL(vault._id);
      }

      // Trigger share price chart refresh
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("❌ Error refreshing data:", error);
    }
  };

  const { isConnected, address, connection, executeTransaction } =
    useContract();
  const { isConnected: isAuthenticated } = useAppKitAccount();

  // Use the simplified vault creation hook for program access
  const { program: vaultFactoryProgram, error: programError } =
    useVaultCreation();

  // Use vault valuation hook for GAV/NAV data
  const {
    gav,
    nav,
    loading: valuationLoading,
    refetch: refetchValuation,
  } = useVaultValuation(vault?.vaultIndex);

  // Use Raydium hook for pool discovery and account building
  // Raydium hook removed

  // Debug program initialization
  // useEffect(() => {
  //   console.log("🔍 Program initialization status:");
  //   console.log("- vaultFactoryProgram:", !!vaultFactoryProgram);
  //   console.log("- programError:", programError);
  //   if (vaultFactoryProgram) {
  //     console.log("✅ Program is ready!");
  //   } else if (programError) {
  //     console.log("❌ Program error:", programError);
  //   } else {
  //     console.log("⏳ Program is still initializing...");
  //   }
  // }, [vaultFactoryProgram, programError]);

  // Fetch vault fees when both program and vault are ready
  useEffect(() => {
    const fetchVaultFeesIfReady = async () => {
      if (vaultFactoryProgram && vault && vault.vaultIndex !== undefined) {
        // console.log(
        //   "🔍 Both program and vault are ready, fetching vault fees..."
        // );
        // console.log("- vaultFactoryProgram:", !!vaultFactoryProgram);
        // console.log("- vault.vaultIndex:", vault.vaultIndex);

        try {
          // Derive factory PDA
          const [factoryPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("factory_v2")],
            VAULT_FACTORY_PROGRAM_ID
          );
          // console.log("🏭 Factory PDA:", factoryPDA.toBase58());

          // Get vault fees
          await getVaultFees(factoryPDA, vault.vaultIndex);
          // console.log("✅ Vault fees fetched successfully!");
        } catch (feesError) {
          console.error(
            "❌ Failed to fetch vault fees from blockchain:",
            feesError
          );
          // Don't fail the entire operation if fees fetch fails
        }
      } else {
        // console.log("⏳ Waiting for program and vault to be ready...");
        // console.log("- vaultFactoryProgram:", !!vaultFactoryProgram);
        // console.log("- vault:", !!vault);
        // console.log("- vault.vaultIndex:", vault?.vaultIndex);
      }
    };

    fetchVaultFeesIfReady();
  }, [vaultFactoryProgram, vault]);

  // Fetch user deposit details when both program, vault, and user are ready
  useEffect(() => {
    const fetchUserDepositDetailsIfReady = async () => {
      if (
        vaultFactoryProgram &&
        vault &&
        vault.vaultIndex !== undefined &&
        address
      ) {
        try {
          // Derive factory PDA
          const [factoryPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("factory_v2")],
            VAULT_FACTORY_PROGRAM_ID
          );

          // Get user deposit details
          await getUserDepositDetails(factoryPDA, vault.vaultIndex);
          // console.log("✅ User deposit details fetched successfully!");
        } catch (depositDetailsError) {
          console.error(
            "❌ Failed to fetch user deposit details from blockchain:",
            depositDetailsError
          );
          // Don't fail the entire operation if deposit details fetch fails
        }
      } else {
        // console.log("⏳ Waiting for program, vault, and user to be ready...");
        // console.log("- vaultFactoryProgram:", !!vaultFactoryProgram);
        // console.log("- vault:", !!vault);
        // console.log("- vault.vaultIndex:", vault?.vaultIndex);
        // console.log("- user address:", address);
      }
    };

    fetchUserDepositDetailsIfReady();
  }, [vaultFactoryProgram, vault, address]);

  // Calculate total fees for deposit
  const calculateDepositFees = (amount: number) => {
    if (!vaultFees) return { totalFees: 0, breakdown: {} };

    const entryFee = (amount * vaultFees.entryFeeBps) / 10000;
    const managementFee = (amount * vaultFees.vaultManagementFees) / 10000;
    const totalFees = entryFee + managementFee;

    return {
      totalFees,
      breakdown: {
        entryFee,
        managementFee,
        entryFeeBps: vaultFees.entryFeeBps,
        managementFeeBps: vaultFees.vaultManagementFees,
        entryFeePercentage: bpsToPercentageString(vaultFees.entryFeeBps),
        managementFeePercentage: bpsToPercentageString(
          vaultFees.vaultManagementFees
        ),
      },
    };
  };

  // Calculate total fees for redeem
  const calculateRedeemFees = (amount: number) => {
    if (!vaultFees) return { totalFees: 0, breakdown: {} };

    const exitFee = (amount * vaultFees.exitFeeBps) / 10000;
    const managementFee = (amount * vaultFees.vaultManagementFees) / 10000;
    const totalFees = exitFee + managementFee;

    return {
      totalFees,
      breakdown: {
        exitFee,
        managementFee,
        exitFeeBps: vaultFees.exitFeeBps,
        managementFeeBps: vaultFees.vaultManagementFees,
        exitFeePercentage: bpsToPercentageString(vaultFees.exitFeeBps),
        managementFeePercentage: bpsToPercentageString(
          vaultFees.vaultManagementFees
        ),
      },
    };
  };

  // Safely convert a decimal string to anchor.BN of raw units (truncates extra fractional digits)
  const toRawUnits = (amountStr: string, decimals: number) => {
    const trimmed = (amountStr || "").trim();
    if (!trimmed) return new anchor.BN(0);
    if (!/^\d*(?:\.?\d*)?$/.test(trimmed)) {
      throw new Error("Invalid amount format");
    }
    const [intPartRaw, fracPartRaw = ""] = trimmed.split(".");
    const intPart =
      intPartRaw === "" ? "0" : intPartRaw.replace(/^0+(?=\d)/, "");
    const fracPadded = (fracPartRaw + "0".repeat(decimals)).slice(0, decimals);
    const combined = `${intPart}${fracPadded}`.replace(/^0+(?=\d)/, "");
    return new anchor.BN(combined === "" ? "0" : combined);
  };

  // Refresh share price data before deposit/redeem to ensure fresh values
  const refreshSharePriceData = async () => {
    if (!vault?._id) return;

    try {
      // Refresh TVL/NAV data (used for share price calculation)
      await fetchVaultTVL(vault._id);

      // Refresh vault details to get fresh totalTokens
      const response = await vaultsApi.getById(vault._id);
      if (response.status === "success" && response.data) {
        setVault((prev) => ({
          ...prev,
          ...response.data,
          totalTokens: response.data.totalTokens || prev?.totalTokens,
        }));
      }

      // Refresh valuation if available
      if (refetchValuation) {
        await refetchValuation();
      }

      // Small delay to ensure state updates are reflected
      await delay(200);
    } catch (error) {
      console.error("Error refreshing share price data:", error);
      // Continue with deposit even if refresh fails - will use existing data
    }
  };

  // Compute ETF share price from current state with sensible fallbacks
  const computeEtfSharePriceRaw = () => {
    // Prefer live NAV and total supply if available
    const navUsd = Number(vaultTVL?.totalUsd) || 0;
    const totalSupply = Number(vault?.totalTokens) || 0;
    let sharePrice = 0;
    if (navUsd > 0 && totalSupply > 0) {
      sharePrice = navUsd / totalSupply;
    } else if (
      vaultMetrics &&
      typeof vaultMetrics.dtfSharePrice === "number" &&
      vaultMetrics.dtfSharePrice > 0
    ) {
      sharePrice = vaultMetrics.dtfSharePrice;
    }

    return toRawUnits(String(sharePrice), 6);
  };

  // Helper function to get user deposit details
  const getUserDepositDetails = async (
    factoryPDA: PublicKey,
    vaultIndex: number
  ) => {
    if (!address) {
      console.log("❌ No user address available for deposit details");
      return null;
    }

    try {
      // Calculate vault PDA
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          factoryPDA.toBuffer(),
          new anchor.BN(vaultIndex).toArrayLike(Buffer, "le", 4),
        ],
        VAULT_FACTORY_PROGRAM_ID
      );
      // console.log("🔑 Calculated vault PDA:", vaultPDA.toBase58());

      // Calculate vault's stablecoin token account PDA
      const [vaultStablecoinAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), vaultPDA.toBuffer()],
        VAULT_FACTORY_PROGRAM_ID
      );
      // console.log(
      //   "💰 Vault stablecoin account PDA:",
      //   vaultStablecoinAccountPDA.toBase58()
      // );

      // Calculate vault mint PDA
      const [vaultMintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
        VAULT_FACTORY_PROGRAM_ID
      );
      // console.log("🪙 Vault mint PDA:", vaultMintPDA.toBase58());

      // Get user's vault token account address
      const userVaultAccountAddress = await getAssociatedTokenAddress(
        vaultMintPDA,
        new PublicKey(address)
      );
      // console.log(
      //   "👤 User vault account address:",
      //   userVaultAccountAddress.toBase58()
      // );

      // console.log("📡 Calling program.methods.getDepositDetails...");
      const depositDetails = await vaultFactoryProgram.methods
        .getDepositDetails(vaultIndex)
        .accountsStrict({
          user: new PublicKey(address),
          factory: factoryPDA,
          vault: vaultPDA,
          userVaultAccount: userVaultAccountAddress,
          vaultStablecoinAccount: vaultStablecoinAccountPDA,
        })
        .view();

      // console.log("📊 User Deposit Details:", {
      //   userVaultTokenBalance: depositDetails.userVaultTokenBalance.toString(),
      // });
      setUserDepositAmount(
        parseFloat(
          (depositDetails.userVaultTokenBalance / Math.pow(10, 6)).toFixed(6)
        )
      );
      // console.log("✅ User deposit details retrieved successfully!");
      return depositDetails;
    } catch (err) {
      console.error("❌ Get user deposit details error:", err);
      if (err instanceof Error) {
        console.error("Error message:", err.message);
        console.error("Error stack:", err.stack);
      }
      throw err;
    }
  };

  // Helper function to get vault fees (factory fees + vault management fees)
  const getVaultFees = async (factoryPDA: PublicKey, vaultIndex: number) => {
    try {
      // Calculate vault PDA
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          factoryPDA.toBuffer(),
          new anchor.BN(vaultIndex).toArrayLike(Buffer, "le", 4),
        ],
        VAULT_FACTORY_PROGRAM_ID
      );
      // console.log("🔑 Calculated vault PDA:", vaultPDA.toBase58());

      // console.log("📡 Calling program.methods.getVaultFees...");
      const vaultFees = await vaultFactoryProgram.methods
        .getVaultFees(vaultIndex)
        .accountsStrict({
          factory: factoryPDA,
          vault: vaultPDA,
        })
        .view();

      // Additional detailed logging
      // console.log("📊 Fee Breakdown:");
      // console.log(
      //   `  Entry Fee: ${vaultFees.entryFeeBps} bps (${bpsToPercentageString(
      //     vaultFees.entryFeeBps
      //   )})`
      // );
      // console.log(
      //   `  Exit Fee: ${vaultFees.exitFeeBps} bps (${bpsToPercentageString(
      //     vaultFees.exitFeeBps
      //   )})`
      // );
      // console.log(
      //   `  Management Fee: ${
      //     vaultFees.vaultManagementFees
      //   } bps (${bpsToPercentageString(vaultFees.vaultManagementFees)})`
      // );

      // console.log("✅ Vault fees retrieved successfully!");

      // Store fees in state for fee calculations
      setVaultFees({
        entryFeeBps: vaultFees.entryFeeBps,
        exitFeeBps: vaultFees.exitFeeBps,
        vaultManagementFees: vaultFees.vaultManagementFees,
      });

      return vaultFees;
    } catch (err) {
      console.error("❌ Get vault fees error:", err);
      if (err instanceof Error) {
        console.error("Error message:", err.message);
        console.error("Error stack:", err.stack);
      }
      throw err;
    }
  };

  const handleDeposit = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Sign in required",
        description: "Please connect the wallet to deposit.",
        variant: "destructive",
      });
      return;
    }
    if (!vault) {
      toast({
        title: "Vault not loaded",
        description: "Try again after vault loads.",
        variant: "destructive",
      });
      return;
    }
    if (!vaultFactoryProgram) {
      toast({
        title: "Program not ready",
        description: "Anchor program is still initializing.",
        variant: "destructive",
      });
      return;
    }
    if (!address) {
      toast({
        title: "Wallet required",
        description: "No wallet address found.",
        variant: "destructive",
      });
      return;
    }
    if (!agreedToTerms) {
      toast({
        title: "Accept Terms",
        description: "You must agree to the Terms & Conditions.",
        variant: "destructive",
      });
      return;
    }
    if (selectedToken !== "USDC") {
      toast({
        title: "Invalid Payment Token",
        description:
          "Only USDC is supported for deposits. Please select USDC as your payment token.",
        variant: "destructive",
      });
      return;
    }
    const numericAmount = parseFloat(depositAmount);
    if (!numericAmount || numericAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a positive amount.",
        variant: "destructive",
      });
      return;
    }

    // Check minimum deposit requirement
    try {
      const minDepositResponse = await portfolioApi.checkMinDeposit(
        numericAmount
      );
      if (!minDepositResponse.data.isValid) {
        toast({
          title: "Minimum deposit not met",
          description:
            minDepositResponse.data.message ||
            "Deposit amount is below the minimum requirement.",
          variant: "destructive",
        });
        return;
      }
    } catch (error) {
      console.error("Error checking minimum deposit:", error);
      toast({
        title: "Validation error",
        description: "Failed to validate deposit amount. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setDepositing(true);
    setDepositStep("Refreshing share price...");
    setDepositStepIndex(0);

    // Refresh share price data before deposit to ensure fresh values
    await refreshSharePriceData();

    setDepositStep("Preparing accounts...");
    setDepositStepIndex(0);
    // Store the actual deposit amount for success popup
    setActualDepositAmount(depositAmount);
    // Clear previous swap signatures
    setDepositSwapSignatures([]);
    try {
      // Constants (mirror reference script)
      const STABLECOIN_MINT = new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      ); // USDC
      const JUPITER_PROGRAM_ID = new PublicKey(
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
      );

      // Derive PDAs
      const [factoryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("factory_v2")],
        VAULT_FACTORY_PROGRAM_ID
      );
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          factoryPDA.toBuffer(),
          new anchor.BN(vault.vaultIndex).toArrayLike(Buffer, "le", 4),
        ],
        VAULT_FACTORY_PROGRAM_ID
      );
      const [vaultMintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
        VAULT_FACTORY_PROGRAM_ID
      );
      const [vaultStablecoinAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), vaultPDA.toBuffer()],
        VAULT_FACTORY_PROGRAM_ID
      );

      // Resolve user accounts
      const userPublicKey = new PublicKey(address);
      const userStablecoinATA = await getAssociatedTokenAddress(
        STABLECOIN_MINT,
        userPublicKey
      );
      const userVaultTokenATA = await getAssociatedTokenAddress(
        vaultMintPDA,
        userPublicKey
      );

      // We'll bundle ATA creations with deposit in a single combined transaction
      const ixs: TransactionInstruction[] = [];
      try {
        await getAccount(connection, userStablecoinATA);
      } catch {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            userPublicKey,
            userStablecoinATA,
            userPublicKey,
            STABLECOIN_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
      try {
        await getAccount(connection, userVaultTokenATA);
      } catch {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            userPublicKey,
            userVaultTokenATA,
            userPublicKey,
            vaultMintPDA,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // Resolve factory accounts (admin and fee recipient) and their USDC ATAs
      const factoryAccount = await (
        vaultFactoryProgram as any
      ).account.factory.fetch(factoryPDA);
      const factoryAdminPubkey: PublicKey = factoryAccount.admin as PublicKey;
      const factoryFeeRecipientPubkey: PublicKey =
        (factoryAccount.feeRecipient as PublicKey) ?? factoryAdminPubkey;

      // Fee recipient USDC ATA must be owned by factory.feeRecipient
      const feeRecipientUSDCAccount = await getAssociatedTokenAddress(
        STABLECOIN_MINT,
        factoryFeeRecipientPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      // Ensure fee recipient ATA exists (bundle in same tx)
      try {
        await getAccount(connection, feeRecipientUSDCAccount);
      } catch {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            userPublicKey, // payer
            feeRecipientUSDCAccount,
            factoryFeeRecipientPubkey, // owner must be fee recipient
            STABLECOIN_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // Admin USDC ATA (for vault admin stablecoin account parameter)
      const adminUSDCAccount = await getAssociatedTokenAddress(
        STABLECOIN_MINT,
        factoryAdminPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      try {
        await getAccount(connection, adminUSDCAccount);
      } catch {
        ixs.push(
          createAssociatedTokenAccountInstruction(
            userPublicKey, // payer
            adminUSDCAccount,
            factoryAdminPubkey, // owner must be admin
            STABLECOIN_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // Build deposit instruction
      setDepositStep("Building transaction...");
      setDepositStepIndex(1);
      await delay(500); // Small delay to show the step
      const rawAmount = toRawUnits(depositAmount, 6);
      // Compute current ETF share price (USD) -> raw units (6 decimals)
      const etfSharePriceRaw = computeEtfSharePriceRaw();
      const depositIx = await vaultFactoryProgram.methods
        .deposit(vault.vaultIndex, rawAmount, etfSharePriceRaw)
        .accountsStrict({
          user: userPublicKey,
          factory: factoryPDA,
          vault: vaultPDA,
          vaultMint: vaultMintPDA,
          userStablecoinAccount: userStablecoinATA,
          stablecoinMint: STABLECOIN_MINT,
          vaultStablecoinAccount: vaultStablecoinAccountPDA,
          userVaultAccount: userVaultTokenATA,
          // Pass distinct ATAs as required by program constraints
          feeRecipientStablecoinAccount: feeRecipientUSDCAccount,
          vaultAdminStablecoinAccount: adminUSDCAccount,
          jupiterProgram: JUPITER_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // SOL transfer to admin removed - no longer needed for swap fees
      ixs.push(depositIx);
      const combinedTx = new Transaction().add(...ixs);
      setDepositStep("Executing transaction...");
      setDepositStepIndex(2);
      await delay(500); // Small delay to show the step
      const txSig = await executeTransaction(combinedTx);
      // console.log("✅ Combined deposit tx:", txSig);
      setDepositTransactionSignature(txSig);

      // Start swap process after successful deposit
      try {
        setDepositStep("Processing deposit...");
        setDepositStepIndex(3);
        await delay(500); // Small delay to show the step

        // NOTE: The smart contract's deposit() function already deducts the entry fee
        // The vault's stablecoin account now contains: rawAmount - entryFee
        // We need to calculate what's actually in the vault and send that to the swap API

        console.log("🔄 ===== SWAP CALCULATION DEBUG ===== ");
        console.log("📝 Original deposit amount:", depositAmount);
        console.log("🔢 rawAmount (full amount):", rawAmount.toString());
        console.log(
          "🔢 rawAmount (USDC):",
          (Number(rawAmount.toString()) / 1e6).toFixed(6)
        );

        // Calculate entry fee that was deducted by the smart contract
        const entryFeeBps = vaultFees?.entryFeeBps ?? 0;
        const entryFeeRaw = rawAmount
          .mul(new anchor.BN(entryFeeBps))
          .div(new anchor.BN(10000));

        // Calculate net amount that's actually in the vault after entry fee deduction
        let netAmountRaw = rawAmount.sub(entryFeeRaw);
        if (netAmountRaw.isNeg()) netAmountRaw = new anchor.BN(0);

        console.log("💰 entryFeeBps:", entryFeeBps);
        console.log("💰 entryFeeRaw:", entryFeeRaw.toString());
        console.log(
          "💰 entryFeeRaw (USDC):",
          (Number(entryFeeRaw.toString()) / 1e6).toFixed(6)
        );
        console.log(
          "📤 netAmountRaw (vault balance):",
          netAmountRaw.toString()
        );
        console.log(
          "📤 netAmountRaw (USDC):",
          (Number(netAmountRaw.toString()) / 1e6).toFixed(6)
        );
        console.log("💡 Vault stablecoin account has: rawAmount - entryFee");
        console.log("💡 Using netAmountRaw for swap API call");

        setDepositStep("Executing swaps...");
        setDepositStepIndex(4);
        await delay(500); // Small delay to show the step

        // Use the net amount (rawAmount - entryFee) that's actually in the vault
        const swapResponse = await transactionEventApi.adminSwapByVault({
          vaultIndex: vault.vaultIndex,
          amountInRaw: netAmountRaw.toString(), // Net amount after entry fee
          etfSharePriceRaw: etfSharePriceRaw.toString(),
        });

        console.log("📡 API Request sent:", {
          vaultIndex: vault.vaultIndex,
          amountInRaw: netAmountRaw.toString(),
          amountInRawUSDC: (Number(netAmountRaw.toString()) / 1e6).toFixed(6),
          etfSharePriceRaw: etfSharePriceRaw.toString(),
        });

        // Extract swap signatures from response
        if (
          swapResponse.data?.swaps &&
          Array.isArray(swapResponse.data.swaps)
        ) {
          const swapSigs = swapResponse.data.swaps
            .map((swap) => swap.swapSig)
            .filter((sig) => sig); // Filter out any undefined/null values
          setDepositSwapSignatures(swapSigs);
          // console.log("🔄 Swap signatures stored:", swapSigs);

          // Call depositTransaction API with swap signatures
          try {
            const depositSuccess = await transactionEventApi.depositTransaction(
              txSig,
              swapSigs
            );
            // console.log(
            //   "🔄 Deposit transaction recorded with swap signatures:",
            //   depositSuccess
            // );
          } catch (depositApiError) {
            console.error(
              "❌ Error calling depositTransaction API:",
              depositApiError
            );
            // Continue with the flow even if this API call fails
          }
        }

        // Refresh all data after successful deposit
        try {
          setDepositStep("Refreshing data...");
          setDepositStepIndex(5);
          await delay(1000); // Longer delay to show the final step

          // Refresh on-chain details (fees and user deposits) and API data sequentially to avoid 504 timeout
          const [fPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("factory_v2")],
            VAULT_FACTORY_PROGRAM_ID
          );

          // Refresh blockchain data and API data sequentially
          await getVaultFees(fPDA, vault.vaultIndex);
          await getUserDepositDetails(fPDA, vault.vaultIndex);
          await refreshAllData(); // This includes API fees refresh

          // Additional delay to ensure all state updates are reflected in UI
          await delay(500);

          // Show success popup only after all states are updated
          setShowDepositSuccessPopup(true);
        } catch (refreshError) {
          console.error(
            "❌ Error refreshing data after deposit:",
            refreshError
          );
          // Still show success popup even if refresh fails
          setShowDepositSuccessPopup(true);
        }
      } catch (swapError) {
        console.error("❌ Swap process failed:", swapError);
        // Still show success for deposit, but mention swap issue
        setDepositStep("Refreshing data...");
        setDepositStepIndex(5);
        await delay(1000); // Show the final step even if swap failed

        // Still refresh data even if swap failed
        try {
          const [fPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("factory_v2")],
            VAULT_FACTORY_PROGRAM_ID
          );

          // Refresh both blockchain and API data sequentially to avoid 504 timeout
          await getVaultFees(fPDA, vault.vaultIndex);
          await getUserDepositDetails(fPDA, vault.vaultIndex);
          await refreshAllData();
        } catch (refreshError) {
          console.error(
            "❌ Error refreshing data after deposit (swap failed):",
            refreshError
          );
        }

        // Additional delay to ensure all state updates are reflected
        await delay(500);
        setShowDepositSuccessPopup(true);
      }

      setDepositModalOpen(false);
    } catch (err) {
      console.error("Deposit flow error", err);
      const message = err instanceof Error ? err.message : "Deposit failed";
      toast({
        title: "Deposit failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setDepositing(false);
      setDepositStep("");
      setDepositStepIndex(0);
      setDepositAmount("0");
    }
  };

  // Calculate derived metrics from vault data
  const calculateVaultMetrics = (vaultData: Vault) => {
    // Use API TVL/NAV (both use totalUsd) - no fallbacks
    const calculatedNav = vaultTVL.totalUsd || 0;
    const totalSupply = parseFloat(vaultData.totalSupply) || 0;

    // Use API TVL for assetsUnderManagement - no fallbacks
    const assetsUnderManagement = vaultTVL.totalUsd || 0;

    // Get calculated APY from global state (vaultFinalData) based on vault name or vaultIndex
    let annualizedAPY = vaultData.apy || 0;

    // Try to find the calculated APY from vaultFinalData
    const calculatedAPYData = vaultFinalData.find(
      (data) =>
        data.vaultName === vaultData.vaultName ||
        (vaultData.vaultIndex !== undefined &&
          data.vaultIndex === vaultData.vaultIndex)
    );

    if (calculatedAPYData && calculatedAPYData.apy !== undefined) {
      annualizedAPY = calculatedAPYData.apy;
      // console.log(
      //   `✅ Using calculated APY for ${vaultData.vaultName}:`,
      //   annualizedAPY
      // );
    } else {
      console.log(
        `⚠️  No calculated APY found for ${vaultData.vaultName}, using vault data APY:`,
        annualizedAPY
      );
    }

    // Calculate average monthly return from annualized APY
    // Formula: Monthly return ≈ APY / 12
    let averageMonthlyReturn = annualizedAPY / 12;

    // Handle extremely large values that result in scientific notation
    if (
      Math.abs(averageMonthlyReturn) > 999999 ||
      !isFinite(averageMonthlyReturn)
    ) {
      averageMonthlyReturn = 0; // Set to 0 for invalid/too large values
      console.warn(
        `Invalid monthly return calculated: ${averageMonthlyReturn} from APY: ${annualizedAPY}`
      );
    }

    // Mock some additional metrics that would come from separate API calls
    const depositors = Math.floor(Math.random() * 100) + 10; // This would come from a separate API

    // Calculate Share Price = NAV (totalUsd from API) / Total_Shares
    // Use only API NAV (totalUsd) - no fallbacks
    const dtfSharePrice = totalSupply > 0 ? calculatedNav / totalSupply : 0;

    // console.log(`📊 Vault Metrics for ${vaultData.vaultName}:`, {
    //   annualizedAPY: `${formatPercentage(annualizedAPY)}%`,
    //   averageMonthlyReturn: `${formatPercentage(averageMonthlyReturn)}%`,
    //   assetsUnderManagement,
    //   nav: calculatedNav,
    //   totalSupply,
    //   dtfSharePrice: dtfSharePrice.toFixed(4),
    // });

    return {
      assetsUnderManagement,
      depositors,
      averageMonthlyReturn,
      annualizedAPY,
      leverageRatio: 12.33, // This would come from strategy-specific data
      loanToValueRatio: 92.3, // This would come from strategy-specific data
      sharePriceChange: 2.47, // This would come from historical data API
      sharePriceChangePeriod: "1W",
      nav: calculatedNav, // NAV from API totalUsd only
      dtfSharePrice, // Share Price = NAV (API totalUsd) / Total_Shares
    };
  };

  const fetchVaultInsights = async (vaultId: string) => {
    // Guard against undefined or invalid vault IDs
    if (!vaultId || vaultId === "undefined" || vaultId.trim() === "") {
      console.warn("Cannot fetch vault insights: invalid vault ID", vaultId);
      return;
    }
    try {
      const response = await vaultsApi.getVaultInsights(vaultId);
      if (response.status === "success" && response.data) {
        setVaultInsights(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch vault insights:", error);
      // Don't show error toast for insights as it's not critical
    }
  };

  const fetchVaultPortfolio = async (vaultId: string) => {
    // Guard against undefined or invalid vault IDs
    if (!vaultId || vaultId === "undefined" || vaultId.trim() === "") {
      console.warn("Cannot fetch vault portfolio: invalid vault ID", vaultId);
      return;
    }
    try {
      setPortfolioLoading(true);
      const response = await vaultsApi.getVaultPortfolio(vaultId);
      if (response.status === "success" && response.data) {
        setPortfolioData(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch vault portfolio:", error);
      // Don't show error toast for portfolio as it's not critical
    } finally {
      setPortfolioLoading(false);
    }
  };

  // const fetchVaultFinancials = async (vaultId: string) => {
  //   try {
  //     setFinancialsLoading(true);
  //     const response = await vaultsApi.getVaultFinancials(vaultId);
  //     if (response.status === "success" && response.data) {
  //       setFinancials(response.data);
  //     }
  //   } catch (error) {
  //     console.error("Failed to fetch vault financials:", error);
  //   } finally {
  //     setFinancialsLoading(false);
  //   }
  // };

  const fetchVaultFees = async (vaultId: string) => {
    // Guard against undefined or invalid vault IDs
    if (!vaultId || vaultId === "undefined" || vaultId.trim() === "") {
      console.warn("Cannot fetch vault fees: invalid vault ID", vaultId);
      return;
    }
    try {
      setFeesLoading(true);
      const response = await vaultsApi.getVaultFees(vaultId);
      if (response.status === "success" && response.data) {
        setFeesData(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch vault fees:", error);
    } finally {
      setFeesLoading(false);
    }
  };

  const fetchVaultDepositors = async (vaultId: string) => {
    // Guard against undefined or invalid vault IDs
    if (!vaultId || vaultId === "undefined" || vaultId.trim() === "") {
      console.warn("Cannot fetch vault depositors: invalid vault ID", vaultId);
      return;
    }
    try {
      setDepositorsLoading(true);
      const response = await vaultsApi.getVaultDepositors(vaultId);
      // console.log("depositors response", response);
      if (response.status === "success" && response.data) {
        setDepositorsData(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch vault depositors:", error);
    } finally {
      setDepositorsLoading(false);
    }
  };

  const fetchVaultActivity = async (
    vaultId: string,
    page: number = 1,
    limit: number = 20
  ) => {
    // Guard against undefined or invalid vault IDs
    if (!vaultId || vaultId === "undefined" || vaultId.trim() === "") {
      console.warn("Cannot fetch vault activity: invalid vault ID", vaultId);
      return;
    }
    try {
      setActivityLoading(true);
      const response = await vaultsApi.getVaultActivity(vaultId, page, limit);
      if (response && response.data) {
        setActivityData(response.data);

        // Update pagination info if available
        if (response.pagination) {
          setActivityPagination({
            currentPage: response.pagination.page || page,
            totalPages: response.pagination.totalPages || 1,
            totalItems: response.pagination.total || 0,
            itemsPerPage: response.pagination.limit || limit,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch vault activity:", error);
    } finally {
      setActivityLoading(false);
    }
  };

  const fetchUserDeposits = async (vaultId: string) => {
    try {
      setUserDepositsLoading(true);
      const response = await vaultsApi.getUserDeposits(vaultId);
      if (response.status === "success" && response.data) {
        setUserDepositsData(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch user deposits:", error);
    } finally {
      setUserDepositsLoading(false);
    }
  };

  const fetchVaultDetails = async (isRefresh = false) => {
    // Guard against undefined or invalid vault IDs
    if (!id || id === "undefined" || id.trim() === "") {
      console.warn("Cannot fetch vault details: invalid vault ID", id);
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch vault details and insights sequentially to avoid 504 timeout
      const vaultResponse = await vaultsApi.getById(id);
      await fetchVaultInsights(id);

      if (vaultResponse.status === "success" && vaultResponse.data) {
        // Verify that the returned vault matches the requested ID
        if (vaultResponse.data._id !== id) {
          console.error(
            "ID mismatch! Requested:",
            id,
            "Got:",
            vaultResponse.data._id
          );
          throw new Error(
            `Vault ID mismatch. Expected ${id}, got ${vaultResponse.data._id}`
          );
        }

        setVault(vaultResponse.data);
        // Set default selected token to the first payment token
        if (
          vaultResponse.data.paymentTokens &&
          vaultResponse.data.paymentTokens.length > 0
        ) {
          setSelectedToken(vaultResponse.data.paymentTokens[0].symbol);
        }

        // Note: Vault fees will be fetched in a separate useEffect when both program and vault are ready
      } else {
        throw new Error(
          vaultResponse.message || "Failed to fetch vault details"
        );
      }
    } catch (error) {
      console.error("Failed to fetch vault details:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load vault details";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Force refresh when ID changes to prevent stale data
    if (id) {
      fetchVaultDetails(true); // Force refresh
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch TVL/NAV when vault is loaded
  useEffect(() => {
    if (vault?._id) {
      fetchVaultTVL(vault._id);
    }
  }, [vault?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch portfolio for main page
  useEffect(() => {
    if (id && !portfolioData && !portfolioLoading) {
      fetchVaultPortfolio(id);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load financials only when Financials tab is opened
  // useEffect(() => {
  //   if (activeTab === "financials" && id && !financials && !financialsLoading) {
  //     fetchVaultFinancials(id);
  //   }
  // }, [activeTab, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load fees for main page
  useEffect(() => {
    if (id && !feesData && !feesLoading) {
      fetchVaultFees(id);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load depositors for main page
  useEffect(() => {
    if (id && !depositorsData && !depositorsLoading) {
      fetchVaultDepositors(id);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load activity for main page
  useEffect(() => {
    if (id && !activityData && !activityLoading) {
      fetchVaultActivity(
        id,
        activityPagination.currentPage,
        activityPagination.itemsPerPage
      );
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle activity page change
  const handleActivityPageChange = (page: number) => {
    if (id && page !== activityPagination.currentPage) {
      setActivityPagination((prev) => ({ ...prev, currentPage: page }));
      fetchVaultActivity(id, page, activityPagination.itemsPerPage);
    }
  };

  // Load user deposits for main page
  useEffect(() => {
    if (id && !userDepositsData && !userDepositsLoading) {
      fetchUserDeposits(id);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top when component mounts or id changes
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [id]);

  const handleRedeem = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Sign in required",
        description: "Please connect the wallet to redeem.",
        variant: "destructive",
      });
      return;
    }
    if (!vault) {
      toast({
        title: "Vault not loaded",
        description: "Try again after vault loads.",
        variant: "destructive",
      });
      return;
    }
    if (!vaultFactoryProgram) {
      toast({
        title: "Program not ready",
        description: "Anchor program is still initializing.",
        variant: "destructive",
      });
      return;
    }
    if (!address) {
      toast({
        title: "Wallet required",
        description: "No wallet address found.",
        variant: "destructive",
      });
      return;
    }
    const numericAmount = parseFloat(redeemAmount);
    if (!numericAmount || numericAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a positive amount.",
        variant: "destructive",
      });
      return;
    }
    // Round both values to 6 decimal places before comparison to avoid floating point precision issues
    const roundedAmount = Math.round(numericAmount * 1000000) / 1000000;
    const roundedBalance = Math.round(userDepositAmount * 1000000) / 1000000;
    if (roundedAmount > roundedBalance) {
      toast({
        title: "Insufficient balance",
        description: `You only have ${userDepositAmount.toFixed(
          6
        )} vault tokens.`,
        variant: "destructive",
      });
      return;
    }

    // Check minimum redeem requirement
    try {
      const minRedeemResponse = await portfolioApi.checkMinRedeem(
        numericAmount
      );
      if (!minRedeemResponse.data.isValid) {
        toast({
          title: "Minimum redeem not met",
          description:
            minRedeemResponse.data.message ||
            "Redeem amount is below the minimum requirement.",
          variant: "destructive",
        });
        return;
      }
    } catch (error) {
      console.error("Error checking minimum redeem:", error);
      toast({
        title: "Validation error",
        description: "Failed to validate redeem amount. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsRedeeming(true);
    setRedeemStep("Refreshing share price...");
    setRedeemStepIndex(0);

    // Refresh share price data before redeem to ensure fresh values
    await refreshSharePriceData();

    setRedeemStep("Preparing accounts...");
    setRedeemStepIndex(0);
    // Clear previous redeem swap signatures
    setRedeemSwapSignatures([]);
    // Store the actual redeem amount for success popup
    setActualRedeemAmount(redeemAmount);
    try {
      // Constants
      const STABLECOIN_MINT = new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      ); // USDC
      const userPublicKey = new PublicKey(address);

      // Derive PDAs
      const [factoryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("factory_v2")],
        VAULT_FACTORY_PROGRAM_ID
      );
      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vault"),
          factoryPDA.toBuffer(),
          new anchor.BN(vault.vaultIndex).toArrayLike(Buffer, "le", 4),
        ],
        VAULT_FACTORY_PROGRAM_ID
      );
      const [vaultMintPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_mint"), vaultPDA.toBuffer()],
        VAULT_FACTORY_PROGRAM_ID
      );
      const [vaultUSDCAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_stablecoin_account"), vaultPDA.toBuffer()],
        VAULT_FACTORY_PROGRAM_ID
      );

      // Resolve factory admin (to optionally top-up SOL for backend swap fees)
      const factoryAccount = await (
        vaultFactoryProgram as any
      ).account.factory.fetch(factoryPDA);
      const factoryAdminPubkey: PublicKey = factoryAccount.admin as PublicKey;

      // Resolve user ATAs
      const userVaultTokenATA = await getAssociatedTokenAddress(
        vaultMintPDA,
        userPublicKey
      );
      const userUSDCATA = await getAssociatedTokenAddress(
        STABLECOIN_MINT,
        userPublicKey
      );
      // Do NOT send separate txs for these; we'll include missing ATAs in phase 1 combined tx

      // 1) Build a single combined v0 transaction for: create ATAs and optional SOL top-up
      setRedeemStep("Building transaction...");
      setRedeemStepIndex(1);
      await delay(500); // Small delay to show the step
      const rawVaultTokenAmount = toRawUnits(redeemAmount, 6);
      // Capture ETF share price once at redeem start and reuse it throughout
      const redeemEtfSharePriceRaw = computeEtfSharePriceRaw();

      // Swaps are executed by backend admin; do not withdraw underlying here

      // Prepare pre-finalize instructions: create ATAs (user vault & USDC, fee ATAs) + optional SOL top-up
      const preFinalizeIxs: TransactionInstruction[] = [];

      // Ensure userVaultTokenATA and userUSDCATA in same combined tx if missing
      try {
        await getAccount(connection, userVaultTokenATA);
      } catch {
        preFinalizeIxs.push(
          createAssociatedTokenAccountInstruction(
            userPublicKey,
            userVaultTokenATA,
            userPublicKey,
            vaultMintPDA,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
      try {
        await getAccount(connection, userUSDCATA);
      } catch {
        preFinalizeIxs.push(
          createAssociatedTokenAccountInstruction(
            userPublicKey,
            userUSDCATA,
            userPublicKey,
            STABLECOIN_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // SOL transfer to admin removed - no longer needed for swap fees

      // Do not withdraw underlying to user; backend will withdraw to admin and perform swaps

      // Resolve fee recipients: factory admin (exit fee + 30% mgmt), vault creator/admin (70% mgmt)
      let vaultCreatorPubkey: PublicKey = factoryAdminPubkey;
      try {
        const vaultAccount: any = await (
          vaultFactoryProgram as any
        ).account.vault.fetch(vaultPDA);
        // Try common field names for creator/admin on vault
        const adminKey = (vaultAccount?.creator ||
          vaultAccount?.admin ||
          vaultAccount?.vaultAdmin) as PublicKey | undefined;
        if (adminKey) vaultCreatorPubkey = new PublicKey(adminKey);
      } catch {}

      const feeRecipientUSDCAccount = await getAssociatedTokenAddress(
        new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
        factoryAdminPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const vaultAdminUSDCAccount = await getAssociatedTokenAddress(
        new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
        vaultCreatorPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      // Ensure both fee ATAs exist (payer: user)
      try {
        await getAccount(connection, feeRecipientUSDCAccount);
      } catch {
        preFinalizeIxs.push(
          createAssociatedTokenAccountInstruction(
            userPublicKey,
            feeRecipientUSDCAccount,
            factoryAdminPubkey,
            new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
      try {
        await getAccount(connection, vaultAdminUSDCAccount);
      } catch {
        preFinalizeIxs.push(
          createAssociatedTokenAccountInstruction(
            userPublicKey,
            vaultAdminUSDCAccount,
            vaultCreatorPubkey,
            new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // 3) Finalize redeem
      // Use backend's adjustedVaultTokenAmount if provided; fallback to requested
      setRedeemStep("Processing redemption...");
      setRedeemStepIndex(2);
      await delay(500); // Small delay to show the step
      let finalizeAmountRaw = new anchor.BN(rawVaultTokenAmount.toString());
      let vaultUsdcBalanceBn: anchor.BN | null = null;
      let redeemSwapSigs: string[] = []; // Store swap signatures locally
      console.log(
        "🔄 Raw vault token amount for redeem:",
        rawVaultTokenAmount.toString()
      );
      console.log(
        "🔄 ETF share price raw redeem:",
        redeemEtfSharePriceRaw.toString()
      );
      try {
        const adminResp = await transactionEventApi.redeemSwapAdmin({
          vaultIndex: vault.vaultIndex,
          vaultTokenAmount: rawVaultTokenAmount.toString(),
          etfSharePriceRaw: redeemEtfSharePriceRaw.toString(),
        });
        await delay(2000);
        // console.log("🔄 Backend admin redeem swaps done:", adminResp);
        const adj = adminResp?.data?.adjustedVaultTokenAmount;
        const vaultUsdcBalance = adminResp?.data?.vaultUsdcBalance;

        // Extract swap signatures from response
        if (adminResp.data?.swaps && Array.isArray(adminResp.data.swaps)) {
          redeemSwapSigs = adminResp.data.swaps
            .map((swap) => swap.sig)
            .filter((sig) => sig); // Filter out any undefined/null values
          setRedeemSwapSignatures(redeemSwapSigs);
          // console.log("🔄 Redeem swap signatures stored:", redeemSwapSigs);
        }
        if (
          vaultUsdcBalance &&
          typeof vaultUsdcBalance === "string" &&
          /^\d+$/.test(vaultUsdcBalance)
        ) {
          vaultUsdcBalanceBn = new anchor.BN(vaultUsdcBalance);
        }
        if (adj && typeof adj === "string" && /^\d+$/.test(adj)) {
          const adjBn = new anchor.BN(adj);
          if (adjBn.gt(new anchor.BN(0))) {
            finalizeAmountRaw = adjBn;
            // console.log(
            //   "✅ Using adjusted finalize amount from backend:",
            //   finalizeAmountRaw.toString()
            // );
          }
        }
        // Clamp to vaultUsdcBalance and add a small cushion to avoid SPL rounding errors
        if (vaultUsdcBalanceBn && finalizeAmountRaw.gt(vaultUsdcBalanceBn)) {
          finalizeAmountRaw = vaultUsdcBalanceBn;
        }
        if (finalizeAmountRaw.gt(new anchor.BN(10))) {
          finalizeAmountRaw = finalizeAmountRaw.sub(new anchor.BN(10));
        }
      } catch (adminErr) {
        console.error("❌ Backend redeem-swap admin failed:", adminErr);
      }

      setRedeemStep("Executing transaction...");
      setRedeemStepIndex(3);
      await delay(10000); // Small delay to show the step it takes to execute the transaction
      console.log(
        "🔄 rawVaultTokenAmount amount raw redeem :",
        rawVaultTokenAmount.toString()
      );
      console.log(
        "🔄 Redeem ETF share price raw:",
        redeemEtfSharePriceRaw.toString()
      );
      const finalizeIx = await (vaultFactoryProgram as any).methods
        .finalizeRedeem(
          new anchor.BN(vault.vaultIndex),
          new anchor.BN(rawVaultTokenAmount.toString()),
          new anchor.BN(redeemEtfSharePriceRaw.toString())
        )
        .accountsStrict({
          user: userPublicKey,
          factory: factoryPDA,
          vault: vaultPDA,
          vaultMint: vaultMintPDA,
          userVaultAccount: userVaultTokenATA,
          vaultStablecoinAccount: vaultUSDCAccountPDA,
          userStablecoinAccount: userUSDCATA,
          feeRecipientStablecoinAccount: feeRecipientUSDCAccount,
          vaultAdminStablecoinAccount: vaultAdminUSDCAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Append finalize and send a SINGLE transaction including prelude (ATA + SOL top-up)
      {
        let finalizeSig: string | null = null;
        try {
          const { blockhash } = await connection.getLatestBlockhash();
          const instructions = [...preFinalizeIxs, finalizeIx];
          const messageV0 = new TransactionMessage({
            payerKey: userPublicKey,
            recentBlockhash: blockhash,
            instructions,
          }).compileToV0Message();
          const vtx = new VersionedTransaction(messageV0);
          finalizeSig = await executeTransaction(vtx);
          // console.log("✅ Finalize tx:", finalizeSig);
        } catch (primaryErr) {
          console.error(
            "❌ Finalize failed, attempting cushion retry:",
            primaryErr
          );
          // Retry once with additional cushion to avoid insufficient funds due to fee rounding
          const retryAmount = finalizeAmountRaw.gt(new anchor.BN(1000))
            ? finalizeAmountRaw.sub(new anchor.BN(1000))
            : finalizeAmountRaw;
          const finalizeIxRetry = await (vaultFactoryProgram as any).methods
            .finalizeRedeem(
              new anchor.BN(vault.vaultIndex),
              new anchor.BN(retryAmount.toString()),
              new anchor.BN(redeemEtfSharePriceRaw.toString())
            )
            .accountsStrict({
              user: userPublicKey,
              factory: factoryPDA,
              vault: vaultPDA,
              vaultMint: vaultMintPDA,
              userVaultAccount: userVaultTokenATA,
              vaultStablecoinAccount: vaultUSDCAccountPDA,
              userStablecoinAccount: userUSDCATA,
              feeRecipientStablecoinAccount: feeRecipientUSDCAccount,
              vaultAdminStablecoinAccount: vaultAdminUSDCAccount,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .instruction();
          const { blockhash: bh2 } = await connection.getLatestBlockhash();
          const instructions2 = [...preFinalizeIxs, finalizeIxRetry];
          const msg2 = new TransactionMessage({
            payerKey: userPublicKey,
            recentBlockhash: bh2,
            instructions: instructions2,
          }).compileToV0Message();
          const vtx2 = new VersionedTransaction(msg2);
          finalizeSig = await executeTransaction(vtx2);
          // console.log("✅ Finalize (retry cushion) tx:", finalizeSig);
        }
        if (finalizeSig) {
          try {
            setRedeemStep("Recording transaction...");
            setRedeemStepIndex(4);
            await delay(500); // Small delay to show the step
            setRedeemTransactionSignature(finalizeSig);
            const vaultAddressHint = vaultPDA.toBase58();
            const resp = await transactionEventApi.redeemTransaction(
              finalizeSig,
              {
                vaultAddress: vaultAddressHint,
                vaultIndex: vault.vaultIndex,
                signatureArray: redeemSwapSigs,
              }
            );
            // console.log("📬 Redeem transaction recorded:", resp);
          } catch (postErr) {
            console.error("❌ Redeem-transaction API call failed:", postErr);
          }
        }
      }

      // Finalize executed once above; no duplicate finalize needed

      // Success UI
      try {
        setRedeemStep("Refreshing data...");
        setRedeemStepIndex(5);
        await delay(1000); // Longer delay to show the final step

        // Refresh on-chain details (fees and user deposits) and API data sequentially to avoid 504 timeout
        const [fPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("factory_v2")],
          VAULT_FACTORY_PROGRAM_ID
        );

        // Refresh blockchain data and API data sequentially
        await getVaultFees(fPDA, vault.vaultIndex);
        await getUserDepositDetails(fPDA, vault.vaultIndex);
        await refreshAllData(); // This includes API fees refresh

        // Additional delay to ensure all state updates are reflected in UI
        await delay(500);

        // Show success popup only after all states are updated
        setShowRedeemSuccessPopup(true);
      } catch (refreshErr) {
        console.error("❌ Error refreshing data after redeem:", refreshErr);
        // Still show success popup even if refresh fails
        setShowRedeemSuccessPopup(true);
      }
      setRedeemModalOpen(false);
    } catch (err) {
      console.error("Redeem flow error", err);

      let errorMessage = "Redeem failed";
      let errorTitle = "Redeem Failed";

      if (err instanceof Error) {
        if (err.message.includes("insufficient funds")) {
          errorTitle = "Insufficient Vault Balance";
          errorMessage =
            "The vault doesn't have enough USDC to complete this redemption. Please try a smaller amount or contact support.";
        } else if (err.message.includes("User rejected")) {
          errorTitle = "Transaction Cancelled";
          errorMessage = "You cancelled the transaction. No changes were made.";
        } else if (err.message.includes("custom program error")) {
          errorTitle = "Transaction Failed";
          errorMessage =
            "The redeem transaction failed on-chain. This may be due to insufficient vault balance or other constraints.";
        } else {
          errorMessage = err.message;
        }
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsRedeeming(false);
      setRedeemStep("");
      setRedeemStepIndex(0);
      setRedeemAmount("0");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen py-16 sm:py-20 lg:py-24 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Loading vault details...
          </p>
        </div>
      </div>
    );
  }

  if (error && !vault) {
    return (
      <div className="min-h-screen py-16 sm:py-20 lg:py-24 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-error mx-auto mb-4" />
          <h1 className="text-xl sm:text-2xl font-bold mb-4">
            Failed to Load Vault
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mb-6">
            {error}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => fetchVaultDetails()}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Vaults
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="min-h-screen py-16 sm:py-20 lg:py-24 flex items-center justify-center">
        <div className="text-center px-4">
          <h1 className="text-xl sm:text-2xl font-bold mb-4">
            Vault Not Found
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mb-6">
            The vault you're looking for doesn't exist.
          </p>
          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Vaults
          </Button>
        </div>
      </div>
    );
  }

  // Calculate metrics when vault data is available
  const vaultMetrics = vault ? calculateVaultMetrics(vault) : null;
  const monthlyRevenueUsd = vaultMetrics
    ? vaultMetrics.assetsUnderManagement *
      (vaultMetrics.averageMonthlyReturn / 100)
    : 0;

  return (
    <div className="min-h-screen py-16 sm:py-20 lg:py-24 ">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">
          <span
            className="cursor-pointer hover:text-foreground"
            onClick={() => navigate("/")}
          >
            Vaults
          </span>
          <span>›</span>
          <span className="truncate">{vault.vaultName}</span>
        </div>

        {/* Header moved inside OverviewTab to match reference layout */}

        {/* Main content (all sections inline) */}
        <div className="space-y-8 mt-6 sm:mt-8">
          <OverviewTab
            vault={vault}
            vaultInsights={vaultInsights}
            vaultMetrics={vaultMetrics}
            portfolioData={portfolioData}
            portfolioLoading={portfolioLoading}
            feesData={feesData}
            feesLoading={feesLoading}
            createdOn={(activityData && activityData[0]?.createdAt) || null}
            vaultFees={vaultFees}
            depositAmount={depositAmount}
            setDepositAmount={setDepositAmount}
            redeemAmount={redeemAmount}
            setRedeemAmount={setRedeemAmount}
            agreedToTerms={agreedToTerms}
            setAgreedToTerms={(v) => setAgreedToTerms(v)}
            selectedToken={selectedToken}
            userDepositAmount={userDepositAmount}
            depositing={depositing}
            depositStep={depositStep}
            depositStepIndex={depositStepIndex}
            depositSteps={depositSteps}
            isRedeeming={isRedeeming}
            redeemStep={redeemStep}
            redeemStepIndex={redeemStepIndex}
            redeemSteps={redeemSteps}
            onDeposit={handleDeposit}
            onRedeem={handleRedeem}
            gav={vaultTVL.totalUsd || 0}
            nav={vaultTVL.totalUsd || 0}
            valuationLoading={vaultTVL.loading}
            refetchValuation={refetchValuation}
            vaultIndex={vault?.vaultIndex}
            miniDeposit={vault?.miniDeposit}
            miniRedeem={vault?.miniRedeem}
            dtfSharePrice={vaultMetrics?.dtfSharePrice || 0}
            refreshTrigger={refreshTrigger}
            userAddress={address}
            connection={connection}
            totalSupply={vault?.totalTokens}
            onRefreshUserBalance={async () => {
              if (vaultFactoryProgram && vault?.vaultIndex && address) {
                const [factoryPDA] = PublicKey.findProgramAddressSync(
                  [Buffer.from("factory_v2")],
                  VAULT_FACTORY_PROGRAM_ID
                );
                await getUserDepositDetails(factoryPDA, vault.vaultIndex);
              }
            }}
          />

          {/* <FinancialsTab
            data={financials}
            loading={financialsLoading}
            vaultIndex={vault?.vaultIndex}
          />

          <DepositorsTab
            depositorsData={depositorsData}
            loading={depositorsLoading}
          />

          <ActivityTab
            activityData={activityData}
            loading={activityLoading}
            pagination={activityPagination}
            onPageChange={handleActivityPageChange}
          /> */}

          {/* <MyDepositTab
            depositData={userDepositsData}
            loading={userDepositsLoading}
          /> */}
        </div>
      </div>

      {/* Deposit Modal */}
      {/* glass-card */}
      <Dialog open={depositModalOpen} onOpenChange={setDepositModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Deposit</DialogTitle>
            <DialogDescription>
              Choose amount and token to deposit:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <div className="flex gap-3">
                <Input
                  id="amount"
                  type="number"
                  placeholder="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="flex-1"
                />
                <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 rounded-lg">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{selectedToken}</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {depositAmount} {selectedToken}
              </p>
              {/* <p className="text-sm text-muted-foreground">${depositAmount}</p> */}
            </div>

            {/* User's Current Balance */}
            {/* {userDepositAmount > 0 && (
              <div className="p-3 bg-info/10 border border-info/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-info" />
                  <span className="text-sm font-medium text-info">
                    Your Current Balance
                  </span>
                </div>
                <p className="text-sm text-info/80">
                  You currently own {userDepositAmount} vault tokens
                </p>
              </div>
            )} */}

            {/* Fee Calculation Display */}
            <AnimatePresence>
              {depositAmount && parseFloat(depositAmount) > 0 && vaultFees && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="p-4 bg-muted/20 rounded-lg border border-muted/30"
                >
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Transaction Fees
                  </h4>
                  {(() => {
                    const amount = parseFloat(depositAmount);
                    const fees = calculateDepositFees(amount);
                    const totalAmount = amount + fees.totalFees;

                    return (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Deposit Amount:
                          </span>
                          <span className="font-medium">
                            {amount.toFixed(4)} {selectedToken}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Entry Fee ({fees.breakdown.entryFeePercentage}):
                          </span>
                          <span className="font-medium">
                            {fees.breakdown.entryFee.toFixed(4)} {selectedToken}
                          </span>
                        </div>
                        {/* Management fee hidden per requirements */}

                        {/* comment the following below code */}
                        {/* <div className="border-t border-muted/30 pt-2">
                        <div className="flex justify-between font-semibold">
                          <span>Total Required:</span>
                          <span className="text-primary">{totalAmount.toFixed(2)} {selectedToken}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Additional {fees.totalFees.toFixed(2)} {selectedToken} in fees will be deducted
                        </p>
                      </div> */}
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>

            {/* <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Shares Lock-Up Time
                </span>
                <Info className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium">1 day</span>
            </div> */}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-accent">
                  Advanced Settings
                </span>
                <ChevronDown className="w-4 h-4 text-accent" />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) =>
                  setAgreedToTerms(checked === true)
                }
              />
              <Label htmlFor="terms" className="text-sm">
                I have read & agree to the{" "}
                <a href="#" className="text-accent underline">
                  Terms & Conditions.
                </a>
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDepositModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeposit}
              disabled={depositing}
              variant="hero"
            >
              {depositing ? depositStep || "Processing..." : "Deposit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem Modal */}
      <Dialog open={redeemModalOpen} onOpenChange={setRedeemModalOpen}>
        <DialogContent className="sm:max-w-[500px] glass-card">
          <DialogHeader>
            <DialogTitle>Redeem</DialogTitle>
            <DialogDescription>
              To redeem your investment, please submit a request. It will be
              reviewed and executed alongside other redemption requests on a
              FIFO (First In, First Out) basis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">
                Your Current Balance
              </span>
              <span className="text-sm font-medium">
                {userDepositAmount > 0
                  ? Number(userDepositAmount).toFixed(4)
                  : "0"}{" "}
                shares
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="redeem-amount">Request shares to redeem</Label>
              <Input
                id="redeem-amount"
                type="number"
                placeholder="0"
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                disabled={userDepositAmount === 0}
              />
              {userDepositAmount === 0 && (
                <p className="text-xs text-muted-foreground">
                  You don't have any vault tokens to redeem. Make a deposit
                  first.
                </p>
              )}
            </div>

            {/* Fee Calculation Display for Redeem */}
            <AnimatePresence>
              {redeemAmount && parseFloat(redeemAmount) > 0 && vaultFees && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="p-4 bg-muted/20 rounded-lg border border-muted/30"
                >
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Redemption Fees
                  </h4>
                  {(() => {
                    const amount = parseFloat(redeemAmount);
                    const fees = calculateRedeemFees(amount);
                    const totalAmount = amount + fees.totalFees;

                    return (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Redeem Amount:
                          </span>
                          <span className="font-medium">
                            {amount.toFixed(4)} shares
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Exit Fee ({fees.breakdown.exitFeePercentage}):
                          </span>
                          <span className="font-medium">
                            {fees.breakdown.exitFee.toFixed(4)} shares
                          </span>
                        </div>
                        {/* Management fee and total fees hidden per requirements */}
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <DialogFooter className="gap-2">
            {/* <Button
              variant="outline"
              className="bg-primary/20 text-primary border-primary/30"
            >
              Approve
            </Button> */}
            {isRedeeming ? (
              <Button variant="hero" disabled>
                {redeemStep || "Processing..."}
              </Button>
            ) : (
              <Button
                variant="hero"
                onClick={handleRedeem}
                disabled={userDepositAmount === 0}
              >
                {userDepositAmount === 0
                  ? "No Balance to Redeem"
                  : "Request Redemption"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deposit Loading Popup */}
      <LoadingPopup
        isOpen={depositing}
        title="Processing Deposit"
        currentStep={depositStep}
        steps={depositSteps}
        currentStepIndex={depositStepIndex}
      />

      {/* Redeem Loading Popup */}
      <LoadingPopup
        isOpen={isRedeeming}
        title="Processing Redemption"
        currentStep={redeemStep}
        steps={redeemSteps}
        currentStepIndex={redeemStepIndex}
      />

      {/* Deposit Success Popup */}
      <SuccessPopup
        isOpen={showDepositSuccessPopup}
        onClose={() => setShowDepositSuccessPopup(false)}
        title="Deposit Successful! 🎉"
        description={`Successfully deposited ${actualDepositAmount} ${selectedToken} into the vault. Your transaction has been confirmed on the blockchain.`}
        transactionSignature={depositTransactionSignature}
        vaultName={vault?.vaultName || ""}
        swapSignatures={depositSwapSignatures}
      />

      {/* Redeem Success Popup */}
      <SuccessPopup
        isOpen={showRedeemSuccessPopup}
        onClose={() => setShowRedeemSuccessPopup(false)}
        title="Redeem Successful! 🎉"
        description={`Successfully redeemed ${actualRedeemAmount} vault tokens from the vault. Your transaction has been confirmed on the blockchain.`}
        transactionSignature={redeemTransactionSignature}
        vaultName={vault?.vaultName || ""}
        swapSignatures={redeemSwapSignatures}
      />
    </div>
  );
};

export default VaultDetails;
