import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Plus,
  Minus,
  Target,
  Settings,
  Rocket,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FeeConfig } from "@/types/store";
import { PublicKey } from "@solana/web3.js";
import { useToast } from "@/hooks/use-toast";
import { useVaultCreation } from "@/hooks/useContract";
import { TOKEN_MINTS } from "@/components/solana/programIds/programids";
import {
  transactionEventApi,
  uploadApi,
  vaultNameCheckApi,
  feesManagementApi,
  assetAllocationApi,
} from "@/services/api";
import { generateSymbol, getInitials } from "@/lib/helpers";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import AssetSelectionPopup from "@/components/ui/AssetSelectionPopup";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { ConnectButton } from "@/components/wallet/ConnectButton";

interface Asset {
  symbol: string;
  name: string;
  mintAddress?: string;
  logoUrl?: string;
  allocation: number;
}

interface ApiAsset {
  _id: string;
  mintAddress: string;
  name: string;
  symbol: string;
  type: string;
  decimals: number;
  logoUrl?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const CreateVault = () => {
  const { toast } = useToast();
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const [currentStep, setCurrentStep] = useState(1);
  const [vaultConfig, setVaultConfig] = useState({
    name: "",
    symbol: "",
    description: "",
    managementFee: 2,
  });
  const [assets, setAssets] = useState<Asset[]>([]);
  const [initialAssets, setInitialAssets] = useState<ApiAsset[]>([]);
  const [initialAssetsLoading, setInitialAssetsLoading] = useState(true);
  const [showAssetPopup, setShowAssetPopup] = useState(false);
  const [uploading, setUploading] = useState({
    logoUrl: false,
    bannerUrl: false,
  });
  const [imageData, setImageData] = useState({
    logoUrl: "",
    bannerUrl: "",
  });

  // Vault name validation state
  const [vaultNameValidation, setVaultNameValidation] = useState({
    isChecking: false,
    isValid: true,
    error: "",
    lastCheckedName: "",
  });

  // Use the simplified vault creation hook
  const { createVault, program, loading, error, isConnected, address } =
    useVaultCreation();

  // Get fees ID from environment variable
  const feesId = import.meta.env.VITE_FEES_ID;

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<string>("");
  const [lastDeployTime, setLastDeployTime] = useState<number>(0);
  const [lastCreatedVaultName, setLastCreatedVaultName] = useState("");
  const [currentFeeConfig, setCurrentFeeConfig] = useState<FeeConfig | null>(
    null
  );

  // Derived management fee bounds from current fee configuration
  const managementFeeConfig = currentFeeConfig?.fees?.find((fee) =>
    fee?.type?.toLowerCase()?.includes("management")
  );
  const minManagementFee = managementFeeConfig?.minFeeRate ?? 0;
  const maxManagementFee = managementFeeConfig?.maxFeeRate ?? 5;

  // Ensure current value stays within allowed bounds when they change
  useEffect(() => {
    setVaultConfig((prev) => {
      const clamped = Math.min(
        maxManagementFee,
        Math.max(minManagementFee, prev.managementFee)
      );
      if (clamped === prev.managementFee) return prev;
      return { ...prev, managementFee: clamped };
    });
  }, [minManagementFee, maxManagementFee]);

  // get the management fee from the BE
  useEffect(() => {
    const fetchCurrentFee = async () => {
      if (!isAuthenticated) {
        return; // Don't fetch fees if user is not authenticated
      }

      if (!feesId) {
        toast({
          title: "Error",
          description:
            "Failed to load current fee configuration. Please try again.",
          variant: "destructive",
        });
        return;
      }
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
      }
    };
    fetchCurrentFee();
  }, [isAuthenticated]);

  // Vault name availability check via API (renamed to avoid confusion)
  const checkVaultNameAvailability = async (name: string): Promise<boolean> => {
    if (!name.trim()) {
      setVaultNameValidation({
        isChecking: false,
        isValid: true,
        error: "",
        lastCheckedName: "",
      });
      return true; // Empty name is considered valid
    }

    // Don't check if it's the same name we already checked
    if (name === vaultNameValidation.lastCheckedName) {
      return vaultNameValidation.isValid;
    }

    // Set checking state
    setVaultNameValidation((prev) => ({
      ...prev,
      isChecking: true,
      error: "",
    }));

    try {
      const response = await vaultNameCheckApi.checkVaultName(name);

      if (response.status === "success" && response.data !== undefined) {
        // data: false = vault name is available (doesn't exist in DB)
        // data: true = vault name exists in DB (not available)
        const isAvailable = !response.data; // Invert the boolean logic

        setVaultNameValidation({
          isChecking: false,
          isValid: isAvailable,
          error: isAvailable ? "" : "Vault name already exists",
          lastCheckedName: name,
        });

        if (!isAvailable) {
          toast({
            title: "Vault Name Already Exists",
            description:
              "This vault name is already taken. Please choose a different name.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Vault Name Available",
            description: "This vault name is available and ready to use.",
          });
        }

        return isAvailable;
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Error checking vault name:", error);
      setVaultNameValidation({
        isChecking: false,
        isValid: false,
        error: "Failed to check vault name availability",
        lastCheckedName: name,
      });

      toast({
        title: "Validation Error",
        description:
          "Failed to check vault name availability. Please try again.",
        variant: "destructive",
      });

      return false;
    }
  };

  // Handle name change and auto-generate symbol
  const handleNameChange = (name: string) => {
    const generatedSymbol = generateSymbol(name);
    const previousSymbol = vaultConfig.symbol;

    setVaultConfig((prev) => ({
      ...prev,
      name,
      symbol: generatedSymbol,
    }));

    // Show loading state immediately when user starts typing
    if (name.trim()) {
      setVaultNameValidation((prev) => ({
        ...prev,
        isChecking: true,
        isValid: true, // Reset to neutral state while checking
        error: "",
      }));
    } else {
      // Reset validation state for empty name
      setVaultNameValidation((prev) => ({
        ...prev,
        isChecking: false,
        isValid: true,
        error: "",
      }));
    }

    // Show toast when symbol is auto-generated and different from previous
    if (name.trim() && generatedSymbol && generatedSymbol !== previousSymbol) {
      toast({
        title: "Symbol Auto-Generated",
        description: `Symbol "${generatedSymbol}" has been generated from your vault name.`,
      });
    }
  };

  // Handle vault name input blur (when user moves focus away)
  const handleVaultNameBlur = async () => {
    if (vaultConfig.name.trim()) {
      await checkVaultNameAvailability(vaultConfig.name);
    }
  };

  const totalAllocation = assets.reduce(
    (sum, asset) => sum + asset.allocation,
    0
  );
  const isValidAllocation = totalAllocation === 100;

  // Original: Fetch initial assets (SOL, USDC, USDT) from API
  // useEffect(() => {
  //   const fetchInitialAssets = async () => {
  //     try {
  //       setInitialAssetsLoading(true);

  //       const targetSymbols = ["SOL", "USDC", "USDT"];
  //       const allFilteredAssets: ApiAsset[] = [];

  //       for (const symbol of targetSymbols) {
  //         const response = await assetAllocationApi.getAll(1, 10, symbol);
  //         if (response && response.data && Array.isArray(response.data)) {
  //           const foundAsset = response.data.find((asset) => asset.symbol === symbol);
  //           if (foundAsset) allFilteredAssets.push(foundAsset);
  //         }
  //       }

  //       setInitialAssets(allFilteredAssets);

  //       const initialAssetsWithAllocation: Asset[] = allFilteredAssets.map((apiAsset) => {
  //         let allocation = 0;
  //         if (apiAsset.symbol === "SOL") allocation = 20;
  //         else if (apiAsset.symbol === "USDC") allocation = 10;
  //         else if (apiAsset.symbol === "USDT") allocation = 10;
  //         return {
  //           symbol: apiAsset.symbol,
  //           name: apiAsset.name,
  //           mintAddress: apiAsset.mintAddress,
  //           logoUrl: apiAsset.logoUrl,
  //           allocation,
  //         };
  //       });
  //       setAssets(initialAssetsWithAllocation);
  //     } catch (err) {
  //       console.error("Error fetching initial assets:", err);
  //       setAssets([
  //         { symbol: "SOL", name: "Solana", mintAddress: TOKEN_MINTS.MAINNET.SOL.toBase58(), allocation: 20 },
  //         { symbol: "USDC", name: "USD Coin", mintAddress: TOKEN_MINTS.MAINNET.USDC.toBase58(), allocation: 10 },
  //         { symbol: "USDT", name: "USDT", mintAddress: TOKEN_MINTS.MAINNET.USDT.toBase58(), allocation: 10 },
  //       ]);
  //     } finally {
  //       setInitialAssetsLoading(false);
  //     }
  //   };
  //   fetchInitialAssets();
  // }, []);

  // Load initial assets: ETH, SOL, USDT by default. Try API by symbol; fallback to hardcoded ETH/SOL/USDT

  useEffect(() => {
    if (!isAuthenticated) {
      return; // Don't load assets if user is not authenticated
    }

    let cancelled = false;
    const load = async () => {
      setInitialAssetsLoading(true);
      try {
        const targetSymbols = ["ETH", "SOL", "USDT"];
        const responses = await Promise.all(
          targetSymbols.map((sym) => assetAllocationApi.getAll(1, 10, sym))
        );
        // console.log("responses of assets:", responses);
        if (cancelled) return;

        const apiFound = responses
          .flatMap((r) => (r && Array.isArray(r.data) ? r.data : []))
          .filter(
            (a) =>
              a && a.symbol && targetSymbols.includes(a.symbol.toUpperCase())
          );
        setInitialAssets(apiFound);

        const findBy = (sym: string) =>
          apiFound.find((a) => a.symbol?.toUpperCase() === sym);
        const eth = findBy("ETH");
        const sol = findBy("SOL");
        const usdt = findBy("USDT");

        // Prefer API-provided assets where available; fill missing with hardcoded defaults
        const selected = [
          usdt
            ? {
                symbol: "USDT",
                name: usdt.name,
                mintAddress: usdt.mintAddress,
                logoUrl: usdt.logoUrl,
                allocation: 34,
              }
            : {
                symbol: "USDT",
                name: "Tether USD",
                mintAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
                logoUrl:
                  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
                allocation: 34,
              },
          eth
            ? {
                symbol: "ETH",
                name: eth.name,
                mintAddress: eth.mintAddress,
                logoUrl: eth.logoUrl,
                allocation: 33,
              }
            : {
                symbol: "ETH",
                name: "Ethereum",
                mintAddress: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
                logoUrl:
                  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png",
                allocation: 33,
              },
          sol
            ? {
                symbol: "SOL",
                name: sol.name,
                mintAddress: sol.mintAddress,
                logoUrl: sol.logoUrl,
                allocation: 33,
              }
            : {
                symbol: "SOL",
                name: "Solana",
                mintAddress: "So11111111111111111111111111111111111111112",
                logoUrl:
                  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
                allocation: 33,
              },
        ];
        setAssets(selected);
        return;
      } catch (_) {
        if (cancelled) return;
        // Final fallback to hardcoded ETH, SOL, USDT
        setAssets([
          {
            symbol: "USDT",
            name: "Tether USD",
            mintAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
            logoUrl:
              "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
            allocation: 34,
          },
          {
            symbol: "ETH",
            name: "Ethereum",
            mintAddress: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
            logoUrl:
              "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png",
            allocation: 33,
          },
          {
            symbol: "SOL",
            name: "Solana",
            mintAddress: "So11111111111111111111111111111111111111112",
            logoUrl:
              "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
            allocation: 33,
          },
        ]);
      } finally {
        if (!cancelled) setInitialAssetsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const addAsset = (assetToAdd: {
    symbol: string;
    name: string;
    mintAddress?: string;
    logoUrl?: string;
  }) => {
    if (!assets.find((asset) => asset.symbol === assetToAdd.symbol)) {
      // Calculate how much allocation to give to the new asset
      // If current total is 100%, reduce existing assets proportionally
      // If current total is less than 100%, give the new asset the remaining allocation
      const currentTotal = assets.reduce(
        (sum, asset) => sum + asset.allocation,
        0
      );
      let newAssetAllocation = 0;
      let updatedAssets = [...assets];

      if (currentTotal >= 100) {
        // If already at 100%, reduce existing assets by 10% and give that to new asset
        newAssetAllocation = 10;
        updatedAssets = assets.map((asset) => ({
          ...asset,
          allocation: Math.max(0, asset.allocation - asset.allocation * 0.1), // Reduce by 10%
        }));
      } else {
        // Give remaining allocation to new asset, but cap at 20%
        newAssetAllocation = Math.min(20, 100 - currentTotal);
      }

      setAssets([
        ...updatedAssets,
        { ...assetToAdd, allocation: newAssetAllocation },
      ]);

      toast({
        title: "Asset Added",
        description: `${assetToAdd.name} (${assetToAdd.symbol}) has been added to your vault with ${newAssetAllocation}% allocation.`,
      });
    } else {
      toast({
        title: "Asset Already Added",
        description: `${assetToAdd.name} (${assetToAdd.symbol}) is already in your vault.`,
        variant: "destructive",
      });
    }
  };

  const removeAsset = (symbolToRemove: string) => {
    const assetToRemove = assets.find(
      (asset) => asset.symbol === symbolToRemove
    );

    if (!assetToRemove) return;

    // Prevent removing the last asset
    if (assets.length === 1) {
      toast({
        title: "Cannot Remove Last Asset",
        description:
          "You must have at least one asset in your vault. Add another asset first before removing this one.",
        variant: "destructive",
      });
      return;
    }

    const remainingAssets = assets.filter(
      (asset) => asset.symbol !== symbolToRemove
    );

    // If there are remaining assets, redistribute the removed asset's allocation proportionally
    if (remainingAssets.length > 0 && assetToRemove.allocation > 0) {
      const totalRemainingAllocation = remainingAssets.reduce(
        (sum, asset) => sum + asset.allocation,
        0
      );
      const allocationToRedistribute = assetToRemove.allocation;

      // Safeguard: if totalRemainingAllocation is 0 (edge case), distribute evenly
      const updatedAssets =
        totalRemainingAllocation > 0
          ? remainingAssets.map((asset) => {
              const proportion = asset.allocation / totalRemainingAllocation;
              const additionalAllocation =
                allocationToRedistribute * proportion;
              return {
                ...asset,
                allocation: asset.allocation + additionalAllocation,
              };
            })
          : remainingAssets.map((asset) => ({
              ...asset,
              allocation:
                asset.allocation +
                allocationToRedistribute / remainingAssets.length,
            }));

      setAssets(updatedAssets);
    } else {
      setAssets(remainingAssets);
    }

    toast({
      title: "Asset Removed",
      description: `${assetToRemove.name} (${assetToRemove.symbol}) has been removed from your vault.`,
    });
  };

  const updateAllocation = (symbol: string, allocation: number) => {
    setAssets((prevAssets) => {
      // Calculate current total without the asset being updated
      const otherAssetsTotal = prevAssets
        .filter((asset) => asset.symbol !== symbol)
        .reduce((sum, asset) => sum + asset.allocation, 0);

      // Calculate maximum allowed for this asset to not exceed 100%
      const maxAllowed = 100 - otherAssetsTotal;

      // Cap the allocation to prevent exceeding 100%
      const cappedAllocation = Math.min(allocation, maxAllowed);

      // Show warning if allocation was capped
      if (allocation > maxAllowed) {
        toast({
          title: "Allocation Capped",
          description: `Cannot set ${symbol} to ${allocation}% as it would exceed 100% total. Capped at ${maxAllowed}%.`,
          variant: "destructive",
        });
      }

      return prevAssets.map((asset) =>
        asset.symbol === symbol
          ? { ...asset, allocation: cappedAllocation }
          : asset
      );
    });
  };

  const steps = [
    { number: 1, title: "Basic Info", icon: <Settings className="w-4 h-4" /> },
    {
      number: 2,
      title: "Asset Allocation",
      icon: <Target className="w-4 h-4" />,
    },
    {
      number: 3,
      title: "Review & Deploy",
      icon: <Rocket className="w-4 h-4" />,
    },
  ];

  // Helper function to convert percentage to basis points
  const percentageToBps = (percentage: number): number => {
    return Math.round(percentage * 100);
  };

  const getDefaultAssets = (): Asset[] => {
    return [
      {
        symbol: "USDC",
        name: "USD Coin",
        mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        allocation: 60, // 6000 bps = 60%
        logoUrl:
          "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
      },
      {
        symbol: "USDT",
        name: "USDT",
        mintAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        allocation: 40, // 4000 bps = 40%
        logoUrl:
          "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
      },
    ];
  };

  const resetCreateVaultForm = () => {
    setVaultConfig({ name: "", symbol: "", description: "", managementFee: 2 });
    setAssets(getDefaultAssets());
    setImageData({ logoUrl: "", bannerUrl: "" });
    setVaultNameValidation({
      isChecking: false,
      isValid: true,
      error: "",
      lastCheckedName: "",
    });
    setShowAssetPopup(false);
  };

  const handleDeployVault = async () => {
    // Prevent rapid successive calls (debounce)
    const now = Date.now();
    if (now - lastDeployTime < 5000) {
      // 5 second cooldown
      toast({
        title: "Please Wait",
        description: "Please wait a moment before deploying again.",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected || !address) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first to create a vault.",
        variant: "destructive",
      });
      return;
    }

    if (!program) {
      toast({
        title: "Program Not Ready",
        description: "Vault factory program is not ready. Please wait...",
        variant: "destructive",
      });
      return;
    }

    if (error) {
      toast({
        title: "Program Error",
        description: `Program error: ${error}`,
        variant: "destructive",
      });
      return;
    }

    try {
      setLastDeployTime(now);
      setIsDeploying(true);
      setDeployError(null);
      setDeploySuccess(false);
      setShowSuccessPopup(false);
      setTransactionSignature("");

      toast({
        title: "Deploying Vault...",
        description:
          "Your vault is being deployed to the blockchain. This may take a few minutes.",
      });

      // Format assets for Anchor program - use mint addresses from API
      // This ensures we use the correct mint addresses for each asset as provided by the API,
      // supporting custom tokens with the same symbols but different mint addresses
      const underlyingAssets = assets.map((asset) => {
        // Use mint address from API data, with validation
        if (!asset.mintAddress) {
          throw new Error(
            `Missing mint address for asset: ${asset.symbol}. Please ensure the asset has a valid mint address from the API.`
          );
        }

        try {
          const mintAddress = new PublicKey(asset.mintAddress);
          // console.log(
          //   `📋 Using mint address for ${
          //     asset.symbol
          //   }: ${mintAddress.toBase58()}`
          // );
          return {
            mintAddress,
            mintBps: percentageToBps(asset.allocation),
          };
        } catch (error) {
          throw new Error(
            `Invalid mint address for asset ${asset.symbol}: ${asset.mintAddress}`
          );
        }
      });

      // console.log("📋 Formatted assets:", underlyingAssets);

      // Validate total allocation is exactly 100%
      const totalBps = underlyingAssets.reduce(
        (sum, asset) => sum + asset.mintBps,
        0
      );
      // console.log(
      //   "📊 Total BPS allocation:",
      //   totalBps,
      //   "(should be 10000 for 100%)"
      // );

      if (totalBps !== 10000) {
        throw new Error(
          `Total allocation must be exactly 100% (10000 bps), but got ${totalBps} bps`
        );
      }

      // Create vault using the simplified hook (exactly like script.ts)
      const tx = await createVault(
        vaultConfig.name, // vault_name
        vaultConfig.symbol, // vault_symbol
        underlyingAssets, // properly formatted assets
        percentageToBps(vaultConfig.managementFee) // management_fees in basis points
      );

      setDeploySuccess(true);
      setTransactionSignature(tx);
      setLastCreatedVaultName(vaultConfig.name);

      // Call the transaction event management API
      try {
        const result = await transactionEventApi.readTransaction({
          transactionSignature: tx,
          logoUrl: imageData.logoUrl,
          bannerUrl: imageData.bannerUrl,
          description: vaultConfig.description,
        });

        // Show success popup after both vault creation and API call are successful
        setShowSuccessPopup(true);
        resetCreateVaultForm();
      } catch (apiError) {
        console.error(
          "Error calling transaction event management API:",
          apiError
        );
        // Still show popup even if API call fails - vault creation was successful
        setShowSuccessPopup(true);
        resetCreateVaultForm();
      }

      toast({
        title: "Vault Created Successfully! 🎉",
        description: `Your vault "${
          vaultConfig.name
        }" has been deployed to the blockchain. Transaction: ${tx.slice(
          0,
          8
        )}...`,
      });
    } catch (error) {
      console.error("Failed to create vault:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create vault";
      setDeployError(errorMessage);

      toast({
        title: "Vault Creation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsDeploying(false);
      setCurrentStep(1);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, []);

  // Check if user is authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center mt-16 px-4">
        <Card className="glass-card max-w-md w-full text-center">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-bold">
              Connect your wallet
            </CardTitle>
            <CardDescription>
              Sign in to create and manage your vaults.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderStepIndicator = () => (
    <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center">
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 transition-all duration-normal",
              currentStep >= step.number
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border-strong text-muted-foreground"
            )}
          >
            {currentStep > step.number ? (
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <div className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">
                {step.icon}
              </div>
            )}
          </div>
          <span
            className={cn(
              "ml-2 text-xs sm:text-sm font-medium font-architekt",
              currentStep >= step.number
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            {step.title}
          </span>
          {index < steps.length - 1 && (
            <div
              className={cn(
                "w-8 sm:w-16 h-0.5 ml-2 sm:ml-4",
                currentStep > step.number ? "bg-primary" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    imageType: "logo" | "banner"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploading((prev) => {
      const newLoadingData = {
        ...prev,
        ...(imageType === "logo" ? { logoUrl: true } : { bannerUrl: true }),
      };
      return newLoadingData;
    });

    try {
      // Upload file to S3 using the new API
      const result = await uploadApi.uploadToS3(file);

      // Handle different response structures
      if (result.success && result.data) {
        // Response has success field and data
        setImageData((prev) => {
          const newImageData = {
            ...prev,
            ...(imageType === "logo"
              ? { logoUrl: result.data }
              : { bannerUrl: result.data }),
          };
          return newImageData;
        });
        toast({
          title: "Success",
          description: `${
            imageType === "logo" ? "Vault Logo" : "Vault Banner"
          } uploaded successfully`,
        });
      } else if (result.data && typeof result.data === "string") {
        // Response data is directly the URL string
        setImageData((prev) => {
          const newImageData = {
            ...prev,
            ...(imageType === "logo"
              ? { logoUrl: result.data }
              : { bannerUrl: result.data }),
          };
          return newImageData;
        });
        toast({
          title: "Success",
          description: `${
            imageType === "logo" ? "Vault Logo" : "Vault Banner"
          } uploaded successfully`,
        });
      } else {
        console.error("Unexpected response structure:", result);
        throw new Error("Unexpected response format from server");
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading({
        logoUrl: false,
        bannerUrl: false,
      });
    }
  };

  return (
    <div className="min-h-screen py-16 sm:py-20 lg:py-24 mt-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <div className="text-center space-y-8 sm:space-y-12 lg:space-y-16 mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white font-architekt tracking-wider uppercase">
            Create New Vault
          </h1>
          <p className="text-lg sm:text-xl text-white/80 font-architekt tracking-wide uppercase max-w-2xl mx-auto">
            Configure your permissionless ETF vault with custom asset allocation
          </p>
        </div>

        <div className="mb-8 sm:mb-12">{renderStepIndicator()}</div>

        {/* Step 1: Basic Information */}
        {currentStep === 1 && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Vault Configuration
              </CardTitle>
              <CardDescription>
                Set up the basic details for your vault
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Vault Logo */}
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  <div className="relative flex-shrink-0">
                    <Avatar className="w-20 h-20 sm:w-24 sm:h-24">
                      <AvatarImage src={imageData.logoUrl} alt="Profile" />
                      <AvatarFallback className="text-lg sm:text-xl">
                        {getInitials(vaultConfig.name)}
                      </AvatarFallback>
                    </Avatar>
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, "logo")}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploading.logoUrl}
                    />
                    {uploading.logoUrl && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 w-full text-center sm:text-left">
                    <Label className="text-sm sm:text-base font-medium flex items-center justify-center sm:justify-start gap-2 font-architekt mb-2">
                      Vault Logo
                    </Label>
                    <div className="flex flex-col items-center sm:items-start gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 w-full sm:w-auto font-architekt"
                        disabled={uploading.logoUrl}
                        onClick={() =>
                          (
                            document.getElementById(
                              "logo-upload"
                            ) as HTMLInputElement
                          )?.click()
                        }
                      >
                        <Plus className="w-4 h-4" />
                        {uploading.logoUrl ? "Uploading..." : "Upload Image"}
                      </Button>
                      <span className="text-xs sm:text-sm text-muted-foreground font-architekt">
                        JPG, PNG, GIF up to 5MB
                      </span>
                    </div>
                  </div>
                </div>

                {/* Vault Banner */}
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  <div className="relative flex-shrink-0">
                    <Avatar className="w-20 h-20 sm:w-24 sm:h-24">
                      <AvatarImage src={imageData.bannerUrl} alt="Profile" />
                      <AvatarFallback className="text-lg sm:text-xl">
                        {getInitials(vaultConfig.name)}
                      </AvatarFallback>
                    </Avatar>
                    <input
                      id="banner-upload"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, "banner")}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploading.bannerUrl}
                    />
                    {uploading.bannerUrl && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 w-full text-center sm:text-left">
                    <Label className="text-sm sm:text-base font-medium flex items-center justify-center sm:justify-start gap-2 font-architekt mb-2">
                      Vault Banner
                    </Label>
                    <div className="flex flex-col items-center sm:items-start gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 w-full sm:w-auto font-architekt"
                        disabled={uploading.bannerUrl}
                        onClick={() =>
                          (
                            document.getElementById(
                              "banner-upload"
                            ) as HTMLInputElement
                          )?.click()
                        }
                      >
                        <Plus className="w-4 h-4" />
                        {uploading.bannerUrl ? "Uploading..." : "Upload Image"}
                      </Button>
                      <span className="text-xs sm:text-sm text-muted-foreground font-architekt">
                        JPG, PNG, GIF up to 5MB
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="name"
                    className="text-sm sm:text-base font-architekt"
                  >
                    Vault Name
                  </Label>
                  <div className="relative">
                    <Input
                      id="name"
                      placeholder="e.g., Blue Chip Portfolio"
                      value={vaultConfig.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      onBlur={handleVaultNameBlur}
                      className={cn(
                        "h-10 sm:h-11",
                        vaultNameValidation.isValid === false &&
                          !vaultNameValidation.isChecking &&
                          "border-destructive focus-visible:ring-destructive",
                        vaultNameValidation.isValid === true &&
                          vaultConfig.name &&
                          !vaultNameValidation.isChecking &&
                          "border-success focus-visible:ring-success"
                      )}
                    />
                    {vaultNameValidation.isChecking && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {vaultNameValidation.isValid === true &&
                      vaultConfig.name &&
                      !vaultNameValidation.isChecking && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <CheckCircle className="w-4 h-4 text-success" />
                        </div>
                      )}
                    {vaultNameValidation.isValid === false &&
                      !vaultNameValidation.isChecking && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <AlertCircle className="w-4 h-4 text-destructive" />
                        </div>
                      )}
                  </div>
                  {vaultNameValidation.isChecking && (
                    <p className="text-xs sm:text-sm text-muted-foreground font-architekt">
                      🔄 Checking vault name availability...
                    </p>
                  )}
                  {vaultNameValidation.error &&
                    !vaultNameValidation.isChecking && (
                      <p className="text-xs sm:text-sm text-destructive font-architekt">
                        ❌ {vaultNameValidation.error}
                      </p>
                    )}
                  {vaultNameValidation.isValid === true &&
                    vaultConfig.name &&
                    !vaultNameValidation.isChecking && (
                      <p className="text-xs sm:text-sm text-success font-architekt">
                        ✓ Vault name is available
                      </p>
                    )}
                  <p className="text-xs sm:text-sm text-muted-foreground font-architekt">
                    The symbol will be auto-generated from your vault name
                  </p>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="symbol"
                    className="text-sm sm:text-base font-architekt"
                  >
                    Token Symbol
                  </Label>
                  <Input
                    id="symbol"
                    placeholder="e.g., BCP-ETF"
                    value={vaultConfig.symbol}
                    onChange={(e) =>
                      setVaultConfig({ ...vaultConfig, symbol: e.target.value })
                    }
                    className="bg-muted/50 h-10 sm:h-11"
                  />
                  <p className="text-xs sm:text-sm text-muted-foreground font-architekt">
                    Auto-generated from vault name (you can edit if needed)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="description"
                  className="text-sm sm:text-base font-architekt"
                >
                  Description
                </Label>
                <Input
                  id="description"
                  placeholder="Brief description of your vault strategy"
                  value={vaultConfig.description}
                  onChange={(e) =>
                    setVaultConfig({
                      ...vaultConfig,
                      description: e.target.value,
                    })
                  }
                  className="h-10 sm:h-11"
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm sm:text-base font-architekt">
                    Management Fee (%)
                  </Label>
                  {!feesId ? (
                    <p className="text-sm sm:text-base text-muted-foreground font-architekt">
                      Management fee configuration is unavailable. Set
                      `VITE_FEES_ID` to enable.
                    </p>
                  ) : (
                    <>
                      <Slider
                        value={[vaultConfig.managementFee]}
                        onValueChange={(value) => {
                          const next = value[0];
                          const clamped = Math.min(
                            maxManagementFee,
                            Math.max(minManagementFee, next)
                          );
                          setVaultConfig({
                            ...vaultConfig,
                            managementFee: clamped,
                          });
                        }}
                        min={0}
                        max={5}
                        step={0.1}
                        className="w-full"
                        disabled={minManagementFee === maxManagementFee}
                      />
                      <p className="text-sm sm:text-base text-muted-foreground font-architekt">
                        {vaultConfig.managementFee}% annually
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={async () => {
                    // Check for missing fields and show specific alerts
                    const missingFields = [];

                    if (!vaultConfig.name) {
                      missingFields.push("Vault Name");
                    }
                    if (!vaultConfig.symbol) {
                      missingFields.push("Token Symbol");
                    }
                    if (!imageData.logoUrl) {
                      missingFields.push("Vault Logo");
                    }
                    if (!imageData.bannerUrl) {
                      missingFields.push("Vault Banner");
                    }
                    if (!feesId || !currentFeeConfig) {
                      missingFields.push("Management Fee Configuration");
                    }

                    // Show specific alerts for missing fields
                    if (missingFields.length > 0) {
                      toast({
                        title: "Missing Required Information",
                        description: `Please complete the following fields before proceeding: ${missingFields.join(
                          ", "
                        )}`,
                        variant: "destructive",
                      });
                      return;
                    }

                    // If vault name exists but hasn't been validated yet, trigger validation
                    let isVaultNameValid = vaultNameValidation.isValid;
                    if (
                      vaultConfig.name.trim() &&
                      vaultNameValidation.lastCheckedName !== vaultConfig.name
                    ) {
                      isVaultNameValid = await checkVaultNameAvailability(
                        vaultConfig.name
                      );
                    }

                    // Check if validation is still in progress (shouldn't happen with proper awaiting)
                    if (vaultNameValidation.isChecking) {
                      toast({
                        title: "Please Wait",
                        description:
                          "Vault name is being validated. Please wait for the validation to complete.",
                        variant: "destructive",
                      });
                      return;
                    }

                    // Check if vault name is invalid
                    if (!isVaultNameValid) {
                      toast({
                        title: "Invalid Vault Name",
                        description:
                          "The vault name is not available. Please choose a different name.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setCurrentStep(2);
                    toast({
                      title: "Configuration Complete! ✅",
                      description:
                        "Great! Now let's configure your asset allocation.",
                    });
                  }}
                  className="w-full sm:w-auto font-architekt"
                >
                  Next: Asset Allocation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Asset Allocation */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Asset Allocation
                </CardTitle>
                <CardDescription>
                  Configure the portfolio composition for your vault
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6">
                {/* Allocation Status */}
                <div className="p-3 sm:p-4 glass-surface rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm sm:text-base font-medium font-architekt">
                      Total Allocation
                    </span>
                    <span
                      className={cn(
                        "text-sm sm:text-base font-bold font-architekt",
                        isValidAllocation ? "text-success" : "text-warning"
                      )}
                    >
                      {totalAllocation}%
                    </span>
                  </div>
                  <Progress
                    value={totalAllocation}
                    className={cn(
                      "h-2 sm:h-3",
                      totalAllocation === 100 && "opacity-75"
                    )}
                  />
                  {totalAllocation === 100 && (
                    <div className="flex items-center gap-2 mt-2 text-sm sm:text-base text-success font-architekt">
                      <CheckCircle className="w-4 h-4" />
                      Perfect! Progress bar locked at 100% allocation.
                    </div>
                  )}
                  {!isValidAllocation && totalAllocation < 100 && (
                    <div className="flex items-center gap-2 mt-2 text-sm sm:text-base text-warning font-architekt">
                      <AlertCircle className="w-4 h-4" />
                      Allocation must equal 100%
                    </div>
                  )}
                </div>

                {/* Current Assets */}
                <div className="space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold font-architekt">
                    Portfolio Assets
                  </h3>
                  {assets.map((asset) => {
                    return (
                      <div
                        key={asset.symbol}
                        className="p-3 sm:p-4 glass-surface rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 sm:gap-3">
                            {/* Asset Logo */}
                            <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {asset.logoUrl ? (
                                <img
                                  src={asset.logoUrl}
                                  alt={asset.symbol}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = "none";
                                    target.nextElementSibling?.classList.remove(
                                      "hidden"
                                    );
                                  }}
                                />
                              ) : null}
                              <div
                                className={`w-full h-full flex items-center justify-center text-xs font-bold font-architekt ${
                                  asset.logoUrl ? "hidden" : ""
                                }`}
                              >
                                {asset.symbol.slice(0, 2)}
                              </div>
                            </div>
                            <Badge
                              variant="secondary"
                              className="text-xs sm:text-sm font-architekt"
                            >
                              {asset.symbol}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAsset(asset.symbol)}
                            disabled={assets.length === 1}
                            className="h-8 w-8 sm:h-9 sm:w-9"
                            title={
                              assets.length === 1
                                ? "Cannot remove the last asset"
                                : "Remove asset"
                            }
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm sm:text-base">
                            <span className="font-architekt">Allocation</span>
                            <span className="font-medium font-architekt">
                              {asset.allocation}%
                            </span>
                          </div>
                          <Slider
                            value={[asset.allocation]}
                            onValueChange={(value) =>
                              updateAllocation(asset.symbol, value[0])
                            }
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add More Assets Button */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg sm:text-xl font-semibold font-architekt">
                      Add More Assets
                    </h3>
                    <Button
                      variant="outline"
                      onClick={() => setShowAssetPopup(true)}
                      className="font-architekt"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Browse Assets
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCurrentStep(1);
                      toast({
                        title: "Back to Configuration",
                        description:
                          "You can modify your vault settings and try again.",
                      });
                    }}
                    className="w-full sm:w-auto font-architekt"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      if (!isValidAllocation) {
                        toast({
                          title: "Invalid Allocation",
                          description:
                            "Total allocation must equal 100%. Please adjust your asset allocations.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (assets.length === 0) {
                        toast({
                          title: "No Assets Selected",
                          description:
                            "Please add at least one asset to your vault before proceeding.",
                          variant: "destructive",
                        });
                        return;
                      }
                      setCurrentStep(3);
                      toast({
                        title: "Ready to Deploy! 🚀",
                        description:
                          "Your vault configuration looks good. Review the details and deploy when ready.",
                      });
                    }}
                    disabled={!isValidAllocation || assets.length === 0}
                    className="w-full sm:w-auto font-architekt"
                  >
                    Review & Deploy
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Review & Deploy */}
        {currentStep === 3 && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="w-5 h-5" />
                Review & Deploy
              </CardTitle>
              <CardDescription>
                Review your vault configuration before deployment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              {/* Vault Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold font-architekt">
                    Vault Details
                  </h3>
                  <div className="space-y-2 text-sm sm:text-base">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-architekt">
                        Name:
                      </span>
                      <span className="font-medium font-architekt">
                        {vaultConfig.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-architekt">
                        Symbol:
                      </span>
                      <span className="font-medium font-architekt">
                        {vaultConfig.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-architekt">
                        Management Fee:
                      </span>
                      <span className="font-medium font-architekt">
                        {vaultConfig.managementFee}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold font-architekt">
                    Asset Allocation
                  </h3>
                  <div
                    className={`space-y-2  ${
                      assets.length > 4
                        ? "max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
                        : ""
                    }`}
                  >
                    {assets.map((asset) => {
                      return (
                        <div
                          key={asset.symbol}
                          className="flex justify-between items-center text-sm sm:text-base"
                        >
                          <div className="flex items-center gap-2">
                            {/* Asset Logo */}
                            <div className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {asset.logoUrl ? (
                                <img
                                  src={asset.logoUrl}
                                  alt={asset.symbol}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = "none";
                                    target.nextElementSibling?.classList.remove(
                                      "hidden"
                                    );
                                  }}
                                />
                              ) : null}
                              <div
                                className={`w-full h-full flex items-center justify-center text-xs font-bold font-architekt ${
                                  asset.logoUrl ? "hidden" : ""
                                }`}
                              >
                                {asset.symbol.slice(0, 2)}
                              </div>
                            </div>
                            <Badge
                              variant="secondary"
                              className="text-xs sm:text-sm font-architekt"
                            >
                              {asset.symbol}
                            </Badge>
                          </div>
                          <span className="font-medium font-architekt">
                            {asset.allocation}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Deployment Info */}
              <div className="mt-3 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  <span className="font-medium text-warning font-architekt">
                    Vault Creation requires a 10 USDC fee, automatically
                    deducted from your wallet upon deployment.
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0 ">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentStep(2);
                    toast({
                      title: "Back to Asset Allocation",
                      description:
                        "You can modify your asset allocations and try again.",
                    });
                  }}
                  className="w-full sm:w-auto font-architekt"
                >
                  Back
                </Button>
                <Button
                  variant="hero"
                  className="px-6 sm:px-8 w-full sm:w-auto font-architekt"
                  onClick={handleDeployVault}
                  disabled={isDeploying || !program || !!error}
                >
                  {isDeploying ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Deploying...
                    </>
                  ) : !program ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Initializing Program...
                    </>
                  ) : error ? (
                    <>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Program Error
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4 mr-2" />
                      Deploy Vault
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Success Popup */}
      <SuccessPopup
        isOpen={showSuccessPopup}
        onClose={() => setShowSuccessPopup(false)}
        title="Vault Created Successfully! 🎉"
        description="Your vault has been deployed to the blockchain and is ready for use. You can now view the transaction details on Solscan."
        transactionSignature={transactionSignature}
        vaultName={lastCreatedVaultName || vaultConfig.name}
      />

      <AssetSelectionPopup
        isOpen={showAssetPopup}
        onClose={() => setShowAssetPopup(false)}
        selectedAssets={assets.map((asset) => asset.symbol)}
        onAssetSelect={addAsset}
      />
    </div>
  );
};

export default CreateVault;
