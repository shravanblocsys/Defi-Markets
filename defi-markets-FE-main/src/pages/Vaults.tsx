import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";
import { formatCurrency, formatLargeNumber } from "@/lib/helpers";
import VaultCard from "@/components/ui/vault-card";
import StatsCard from "@/components/ui/stats-card";
import { chartApi, vaultsApi } from "@/services/api";
import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { Vault } from "@/types/store";
import { Search, SortDesc, Plus, Loader2 } from "lucide-react";
import FeatureVaultCard from "@/components/ui/FeatureVaultCard";
import StatsCardSkeleton from "@/components/skeleton/statscard-skeleton";
import FeatureVaultCardSkeleton from "@/components/ui/FeatureVaultCardSkeleton";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchMultipleVaultChartData } from "@/store/slices/chartSlice";
import {
  setVaultDataArray,
  setVaultSummaryData,
  setVaultFinalData,
} from "@/store/slices/vaultsSlice";
import { feesManagementApi } from "@/services/api";
import { useAPYCalculations } from "@/hooks/useAPYCalculations";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import { useToast } from "@/hooks/use-toast";
import { useAppKitAccount } from "@reown/appkit/react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

// Lightweight carousel for featured vaults
function FeaturedVaultsCarousel({
  items,
  getAPYDisplay,
  getTVLDisplay,
  formatLargeNumber,
  vaultChartData,
  isAPYCalculating,
}: any) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  useEffect(() => {
    if (!api || items.length <= 3) return;
    const interval = setInterval(() => {
      try {
        api.scrollNext();
      } catch {}
    }, 3500);
    return () => clearInterval(interval);
  }, [api, items.length]);

  return (
    <Carousel
      className="w-full"
      opts={{ loop: items.length > 3 }}
      setApi={setApi}
    >
      <CarouselContent>
        {items.map((vault: any) => (
          <CarouselItem key={vault._id} className="md:basis-1/2 lg:basis-1/3">
            <FeatureVaultCard
              id={vault._id}
              name={vault.vaultName}
              symbol={vault.vaultSymbol}
              apy={getAPYDisplay(vault.vaultName)}
              tvl={getTVLDisplay(vault)}
              assets={vault.underlyingAssets.map((asset: any) => ({
                symbol:
                  asset.assetAllocation?.symbol || asset.symbol || "Unknown",
                logoUrl: asset.assetAllocation?.logoUrl,
              }))}
              owner={
                typeof vault.creator === "object" && vault.creator?.name
                  ? vault.creator.name
                  : "Unknown Creator"
              }
              apyDate={`APY ${new Date()
                .toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
                .toUpperCase()} ${getAPYDisplay(vault.vaultName)}`}
              avatar={
                typeof vault.creator === "object" && vault.creator?.avatar
                  ? vault.creator.avatar
                  : ""
              }
              twitter_username={
                typeof vault.creator === "object" &&
                vault.creator?.twitter_username
                  ? vault.creator.twitter_username
                  : undefined
              }
              chartData={vaultChartData[vault._id] || []}
              isAPYCalculating={isAPYCalculating()}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden lg:flex" />
      <CarouselNext className="hidden lg:flex" />
    </Carousel>
  );
}

const Vaults = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { isConnected } = useAppKitAccount();
  const { vaultChartData, loadingVaults } = useAppSelector(
    (state) => state.chart
  );
  const {
    vaultDataArray,
    vaultSummaryData,
    vaultFinalData,
    apyCalculationCompleted,
  } = useAppSelector((state) => state.vaults);

  // Use the new hook for vault final data calculation
  const {
    data: calculatedFinalData,
    loading: finalDataLoading,
    error: finalDataError,
  } = useAPYCalculations(vaultDataArray, vaultSummaryData);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"apy" | "name" | "tvl" | "newest">(
    "apy"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [featuredVaults, setFeaturedVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 9,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [featuredError, setFeaturedError] = useState<string | null>(null);

  // TVL data state (contract-based TVL from API)
  const [tvlData, setTvlData] = useState<
    Record<string, { totalUsd: number; loading: boolean }>
  >({});
  const [tvlLoading, setTvlLoading] = useState(false);

  // Dashboard stats state
  const [dashboardStats, setDashboardStats] = useState({
    totalTVL: "$0",
    totalVaults: "0",
    users: "0",
    apy: "14.2%", // Keep APY hardcoded as requested
  });
  const [dashboardGrowthStats, setDashboardGrowthStats] = useState({
    tvlGrowth: 0,
    vaultsGrowth: 0,
    usersGrowth: 0,
  });
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [toastShown, setToastShown] = useState(false);
  const [walletStateInitialized, setWalletStateInitialized] = useState(false);

  // const categories = [
  //   { id: "all", label: "All Vaults", count: pagination.total },
  //   {
  //     id: "defi",
  //     label: "DeFi",
  //     count: vaults.filter((v) => v.vaultName.toLowerCase().includes("defi"))
  //       .length,
  //   },
  //   {
  //     id: "bluechip",
  //     label: "Blue Chip",
  //     count: vaults.filter(
  //       (v) =>
  //         v.vaultName.toLowerCase().includes("blue") ||
  //         v.vaultName.toLowerCase().includes("chip")
  //     ).length,
  //   },
  //   {
  //     id: "yield",
  //     label: "Yield",
  //     count: vaults.filter((v) => v.vaultName.toLowerCase().includes("yield"))
  //       .length,
  //   },
  //   {
  //     id: "experimental",
  //     label: "Experimental",
  //     count: vaults.filter((v) => v.status === "pending").length,
  //   },
  // ];

  // Fetch dashboard stats

  const fetchDashboardStats = async () => {
    try {
      setDashboardLoading(true);
      const response = await vaultsApi.getDashboardStats();

      if (response && response.data) {
        const { valueLocked, vault, users } = response.data;

        setDashboardStats({
          totalTVL: formatCurrency(valueLocked.totalValueLocked),
          totalVaults: vault.totalVaults.toString(),
          users: users.activeInvestors.toString(),
          apy: "14.2%", // Keep APY hardcoded as requested
        });
      } else {
        console.log("No dashboard data in response:", response);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard stats in Vaults:", error);
      // Keep default values on error
    } finally {
      setDashboardLoading(false);
    }
  };

  // Fetch vault summary data and process it
  const fetchVaultSummary = async () => {
    try {
      // console.log("Fetching vault summary data...");
      const response = await feesManagementApi.getVaultSummary();

      if (response && response.data && Array.isArray(response.data)) {
        // console.log("Raw vault summary response:", response.data);

        // Create a map to store the oldest NAV for each vault
        const vaultOldestData = new Map<
          string,
          {
            vaultName: string;
            vaultSymbol: string;
            gav: number;
            initialNav: number;
            date: string;
          }
        >();

        // Process each date entry (oldest dates first)
        response.data.forEach((dateEntry) => {
          const entryDate = new Date(dateEntry.date);

          dateEntry.vaults.forEach((vault) => {
            const vaultKey = vault.vaultName;

            // If this vault doesn't exist in our map, or if this date is older
            if (!vaultOldestData.has(vaultKey)) {
              vaultOldestData.set(vaultKey, {
                vaultName: vault.vaultName,
                vaultSymbol: vault.vaultSymbol,
                gav: vault.gav,
                initialNav: vault.nav,
                date: dateEntry.date,
              });
            } else {
              const existingEntry = vaultOldestData.get(vaultKey)!;
              const existingDate = new Date(existingEntry.date);

              // If this date is older than the existing one, update it
              if (entryDate < existingDate) {
                vaultOldestData.set(vaultKey, {
                  vaultName: vault.vaultName,
                  vaultSymbol: vault.vaultSymbol,
                  gav: vault.gav,
                  initialNav: vault.nav,
                  date: dateEntry.date,
                });
              }
            }
          });
        });

        // Convert map to array and sort by vault name
        const processedData = Array.from(vaultOldestData.values())
          .map(({ vaultName, vaultSymbol, gav, initialNav, date }) => ({
            vaultName,
            vaultSymbol,
            gav,
            initialNav,
            date,
          }))
          .sort((a, b) => a.vaultName.localeCompare(b.vaultName));

        // console.log(
        //   "Processed vault summary data (oldest NAV for each vault):",
        //   processedData
        // );

        // Store in global state
        dispatch(setVaultSummaryData(processedData));
        // console.log(
        //   "Vault summary data stored in global state:",
        //   processedData
        // );
      } else {
        console.error("Invalid vault summary response format:", response);
      }
    } catch (error) {
      console.error("Failed to fetch vault summary:", error);
    }
  };

  // Fetch TVL data for all vaults
  const fetchTVLData = async () => {
    try {
      setTvlLoading(true);

      const response = await chartApi.getVaultsTotalUSD();

      if (response && response.data) {
        // Create a map of vaultId to TVL data
        const tvlMap: Record<string, { totalUsd: number; loading: boolean }> =
          {};

        // Map all vaults TVL data
        response.data.data.forEach((item) => {
          tvlMap[item.vaultId] = { totalUsd: item.totalUsd, loading: false };
        });

        // Also map featured vaults TVL data (in case they're different)
        response.data.featuredVaults.forEach((item) => {
          tvlMap[item.vaultId] = { totalUsd: item.totalUsd, loading: false };
        });

        // Merge with existing TVL data to preserve loading states for vaults not in response
        setTvlData((prev) => ({
          ...prev,
          ...tvlMap,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch TVL data:", error);
      // Don't reset all TVL data on error, just log it
    } finally {
      setTvlLoading(false);
    }
  };

  // Fetch vaults on component mount
  useEffect(() => {
    fetchVaults();
    fetchFeaturedVaults();
    fetchDashboardStats();
    fetchVaultSummary();
  }, []);

  // Fetch TVL data when vaults or featured vaults are loaded
  useEffect(() => {
    if (vaults.length > 0 || featuredVaults.length > 0) {
      // Get all unique vault IDs
      const allVaultIds = [
        ...new Set([
          ...vaults.map((v) => v._id).filter(Boolean),
          ...featuredVaults.map((v) => v._id).filter(Boolean),
        ]),
      ];

      // Initialize loading state for vaults that don't have TVL data yet
      setTvlData((prev) => {
        const updated = { ...prev };
        let hasUpdates = false;

        allVaultIds.forEach((vaultId) => {
          if (!updated[vaultId]) {
            updated[vaultId] = { totalUsd: 0, loading: true };
            hasUpdates = true;
          }
        });

        return hasUpdates ? updated : prev;
      });

      // Fetch TVL data if not already loading
      if (!tvlLoading) {
        fetchTVLData();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults.length, featuredVaults.length]);

  // Update global state when calculated final data changes
  useEffect(() => {
    if (calculatedFinalData.length > 0) {
      // console.log(
      //   "Updating global state with calculated final data:",
      //   calculatedFinalData
      // );
      dispatch(setVaultFinalData(calculatedFinalData));
    }
  }, [calculatedFinalData, dispatch]);

  // Print vault data array whenever it changes in global state
  // useEffect(() => {
  //   if (vaultDataArray.length > 0) {
  //     console.log("Vault data array from global state:", vaultDataArray);
  //   }
  // }, [vaultDataArray]);

  // Print vault summary data whenever it changes in global state
  // useEffect(() => {
  //   if (vaultSummaryData.length > 0) {
  //     // console.log("Vault summary data from global state:", vaultSummaryData);
  //   }
  // }, [vaultSummaryData]);

  // Print vault final data whenever it changes in global state
  // useEffect(() => {
  //   if (vaultFinalData.length > 0) {
  //     console.log("Vault final data from global state:", vaultFinalData);
  //   }
  // }, [vaultFinalData]);

  // Wait for wallet state to be properly initialized
  useEffect(() => {
    const timer = setTimeout(() => {
      setWalletStateInitialized(true);
    }, 1000); // Wait 1 second for wallet state to initialize

    return () => clearTimeout(timer);
  }, []);

  // Show polite toast message when wallet is not connected on page load (only once)
  useEffect(() => {
    // Only proceed if wallet state is initialized
    if (!walletStateInitialized) return;

    // Only show toast on initial page load when wallet is not connected
    // Don't interfere with disconnect/connect flows by checking if this is initial load
    if (!isConnected && !toastShown) {
      toast({
        title: "💡 Connect Your Wallet",
        description:
          "Please connect your wallet to see actual APY values and personalized data.",
        variant: "default",
        duration: 5000,
      });
      setToastShown(true);
    }
  }, [walletStateInitialized]); // Only depend on walletStateInitialized, not isConnected

  // Print hook loading and error states
  // useEffect(() => {
  //   if (finalDataLoading) {
  //     console.log("🔄 Calculating final GAV and NAV...");
  //   }
  //   if (finalDataError) {
  //     console.error("❌ Error in final data calculation:", finalDataError);
  //   }
  // }, [finalDataLoading, finalDataError]);

  // Helper function to get calculated APY from global state for UI components
  // Maps vault names to their calculated APY values from the useVaultFinalData hook
  const getCalculatedAPY = (vaultName: string): number => {
    const finalData = vaultFinalData.find(
      (data) => data.vaultName === vaultName
    );
    const apy = finalData ? finalData.apy : 0;

    // Log APY mapping for debugging
    if (finalData) {
      // console.log(
      //   `📊 APY for ${vaultName}: ${apy.toFixed(2)}% (from calculated data)`
      // );
    } else {
      // console.log(`⚠️ No calculated APY found for ${vaultName}, using 0%`);
    }

    return apy;
  };

  // Helper function to get APY display value with fallback
  const getAPYDisplay = (vaultName: string): string => {
    if (finalDataLoading || !isAPYCalculationComplete()) {
      return "0.00%";
    }
    const apy = getCalculatedAPY(vaultName);

    // Handle extremely large or invalid APY values
    if (!isFinite(apy) || apy > 999999 || apy < 0) {
      return "0.00%";
    }

    // Format with exactly 2 decimal places
    return `${apy.toFixed(2)}%`;
  };

  // Helper function to check if APY is still calculating
  const isAPYCalculating = (): boolean => {
    return finalDataLoading || !isAPYCalculationComplete();
  };

  // Helper function to check if APY calculation is complete for all vaults
  const isAPYCalculationComplete = (): boolean => {
    // Use the global flag first - if it's true, calculation is complete
    if (apyCalculationCompleted) {
      // console.log("✅ APY calculation already completed globally");
      return true;
    }

    if (vaultDataArray.length === 0 || vaultSummaryData.length === 0) {
      // console.log(
      //   "🔄 APY calculation not complete: Missing vault data or summary data"
      // );
      return false;
    }

    // Check if we have calculated data for all vaults that have vaultIndex
    const vaultsWithIndex = vaultDataArray.filter(
      (vault) => vault.vaultIndex !== undefined
    );
    const calculatedVaults = vaultFinalData.length;

    const isComplete = calculatedVaults >= vaultsWithIndex.length;
    // console.log(
    //   `📊 APY calculation status: ${calculatedVaults}/${vaultsWithIndex.length} vaults calculated. Complete: ${isComplete}`
    // );

    return isComplete;
  };

  // Helper function to format TVL with 4 decimal places
  const formatTVL = (value: number): string => {
    if (value === 0) return "$0.0000";
    return `$${value.toFixed(4)}`;
  };

  // Helper function to get TVL display value with loading state
  const getTVLDisplay = (vault: Vault): string => {
    if (!vault._id) {
      return formatTVL(Number(vault.totalValueLocked || 0));
    }

    const contractTvl = tvlData[vault._id];

    // Show loading state if TVL is being fetched
    if (contractTvl?.loading || tvlLoading) {
      return "Loading...";
    }

    // Use contract-based TVL if available and > 0
    if (contractTvl?.totalUsd && contractTvl.totalUsd > 0) {
      return formatTVL(contractTvl.totalUsd);
    }

    // Fall back to backend TVL
    return formatTVL(Number(vault.totalValueLocked || 0));
  };

  const fetchVaults = async (page: number = 1, append: boolean = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      const response = await vaultsApi.getVaults(page, 9);
      // Handle direct response format (without success wrapper)
      if (response && response.data && Array.isArray(response.data)) {
        const newVaults = response.data;
        const newPagination = response.pagination;

        // Store vault data in global state and print it
        if (newVaults.length > 0) {
          const vaultData = newVaults.map((vault) => ({
            vaultName: vault.vaultName,
            vaultIndex: vault.vaultIndex,
          }));

          // console.log("Vault data from API response:", vaultData);

          // Store vault data array in global state
          dispatch(setVaultDataArray(vaultData));
          // console.log("Vault data array stored in global state:", vaultData);
        }

        if (append) {
          setVaults((prev) => [...prev, ...newVaults]);
        } else {
          setVaults(newVaults);
        }

        setPagination(newPagination);
        setCurrentPage(newPagination.page);

        // If we got fewer vaults than requested, we've reached the end
        if (newVaults.length < 9) {
          setPagination((prev) => ({ ...prev, hasNext: false }));
        }

        // Fetch chart data for all vaults using Redux
        const vaultIds = newVaults.map((vault) => vault._id);
        dispatch(fetchMultipleVaultChartData(vaultIds));
      } else {
        setError(`Failed to fetch vaults: Invalid response format`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch vaults");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchFeaturedVaults = async () => {
    try {
      setFeaturedLoading(true);
      setFeaturedError(null);

      const response = await vaultsApi.getFeaturedVaults(1, 10);

      // Handle direct response format (without success wrapper)
      if (response && response.data && Array.isArray(response.data)) {
        setFeaturedVaults(response.data);
      } else {
        setFeaturedError(
          `Failed to fetch featured vaults: Invalid response format`
        );
      }
    } catch (err) {
      setFeaturedError(
        err instanceof Error ? err.message : "Failed to fetch featured vaults"
      );
    } finally {
      setFeaturedLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (
      (pagination.hasNext || vaults.length < pagination.total) &&
      !loadingMore
    ) {
      fetchVaults(currentPage + 1, true);
    }
  };

  const handleSort = (newSortBy: "apy" | "name" | "tvl" | "newest") => {
    if (sortBy === newSortBy) {
      // Toggle sort order if same field
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // Set new sort field with default desc order
      setSortBy(newSortBy);
      setSortOrder("desc");
    }
  };

  // Note: Dashboard stats are now fetched from API instead of computed locally

  const filteredVaults = useMemo(() => {
    const filtered = vaults.filter((vault) => {
      const matchesSearch =
        vault.vaultName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vault.vaultSymbol.toLowerCase().includes(searchTerm.toLowerCase());

      let matchesCategory = true;
      if (selectedCategory !== "all") {
        switch (selectedCategory) {
          case "defi":
            matchesCategory = vault.vaultName.toLowerCase().includes("defi");
            break;
          case "bluechip":
            matchesCategory =
              vault.vaultName.toLowerCase().includes("blue") ||
              vault.vaultName.toLowerCase().includes("chip");
            break;
          case "yield":
            matchesCategory = vault.vaultName.toLowerCase().includes("yield");
            break;
          case "experimental":
            matchesCategory = vault.status === "pending";
            break;
        }
      }

      return matchesSearch && matchesCategory;
    });
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortBy) {
        case "apy":
          aValue = a.apy || 0;
          bValue = b.apy || 0;
          break;
        case "name":
          aValue = a.vaultName.toLowerCase();
          bValue = b.vaultName.toLowerCase();
          break;
        case "tvl": {
          // Prefer contract-based TVL if available, fall back to backend TVL
          const aContractTvl = a._id ? tvlData[a._id]?.totalUsd : undefined;
          const bContractTvl = b._id ? tvlData[b._id]?.totalUsd : undefined;

          aValue =
            aContractTvl && aContractTvl > 0
              ? aContractTvl
              : parseFloat(String(a.totalValueLocked)) || 0;
          bValue =
            bContractTvl && bContractTvl > 0
              ? bContractTvl
              : parseFloat(String(b.totalValueLocked)) || 0;
          break;
        }
        case "newest": {
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        }
        default:
          return 0;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortOrder === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        const aNum = Number(aValue);
        const bNum = Number(bValue);
        return sortOrder === "asc" ? aNum - bNum : bNum - aNum;
      }
    });

    return filtered;
  }, [vaults, searchTerm, selectedCategory, sortBy, sortOrder, tvlData]);

  return (
    <div className="min-h-screen py-8 sm:py-16 lg:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        {/* Header */}
        <div className="text-center space-y-8 sm:space-y-12 lg:space-y-16 mb-8 sm:mb-12 mt-8 sm:mt-12 lg:mt-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white font-architekt tracking-wider uppercase px-4">
            VAULT MARKETPLACE
          </h1>
          <p className="text-lg sm:text-xl text-white/80 font-architekt tracking-wide uppercase max-w-2xl mx-auto px-4">
            FIND YOUR DEFI VAULT INVESTMENTS AND PERFORMANCE
          </p>
        </div>
        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
          {dashboardLoading ? (
            <>
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </>
          ) : (
            <>
              <StatsCard
                title="Total Value Locked"
                value={dashboardStats.totalTVL}
              />
              <StatsCard
                title="Active Vaults"
                value={dashboardStats.totalVaults}
              />
              <StatsCard title="Average APY" value={dashboardStats.apy} />
              <StatsCard
                title="Active Investors"
                value={dashboardStats.users}
              />
            </>
          )}
        </div>
        {/* Featured Vaults */}
        <div className="flex flex-col gap-8 sm:gap-12 lg:gap-16 mb-12 sm:mb-16 mt-20 sm:mt-32 lg:mt-40 text-center">
          <h2 className="bg-gradient-to-r from-[#E8E8E8] to-[#959595] bg-clip-text text-transparent font-microgramma font-bold text-3xl sm:text-4xl lg:text-[48px] tracking-wider uppercase px-4 mb-16">
            FEATURED VAULTS
          </h2>

          {featuredLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
              <FeatureVaultCardSkeleton />
              <FeatureVaultCardSkeleton />
              <FeatureVaultCardSkeleton />
            </div>
          ) : featuredError ? (
            <div className="text-center py-12">
              <p className="text-red-500 mb-4">{featuredError}</p>
              <Button onClick={() => fetchFeaturedVaults()} variant="outline">
                Try Again
              </Button>
            </div>
          ) : featuredVaults.length > 0 ? (
            (() => {
              // If there are more than 3 vaults, use carousel with autoplay; otherwise, keep the grid of up to 3
              if (featuredVaults.length > 3) {
                return (
                  <FeaturedVaultsCarousel
                    items={featuredVaults}
                    getAPYDisplay={getAPYDisplay}
                    getTVLDisplay={getTVLDisplay}
                    formatLargeNumber={formatLargeNumber}
                    vaultChartData={vaultChartData}
                    isAPYCalculating={isAPYCalculating}
                  />
                );
              }

              return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
                  {featuredVaults.slice(0, 3).map((vault) => (
                    <FeatureVaultCard
                      key={vault._id}
                      id={vault._id}
                      name={vault.vaultName}
                      symbol={vault.vaultSymbol}
                      apy={getAPYDisplay(vault.vaultName)}
                      tvl={getTVLDisplay(vault)}
                      assets={vault.underlyingAssets.map((asset) => ({
                        symbol:
                          asset.assetAllocation?.symbol ||
                          asset.symbol ||
                          "Unknown",
                        logoUrl: asset.assetAllocation?.logoUrl,
                      }))}
                      owner={
                        typeof vault.creator === "object" && vault.creator?.name
                          ? vault.creator.name
                          : "Unknown Creator"
                      }
                      apyDate={`APY ${new Date()
                        .toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                        .toUpperCase()} ${getAPYDisplay(vault.vaultName)}`}
                      avatar={
                        typeof vault.creator === "object" &&
                        vault.creator?.avatar
                          ? vault.creator.avatar
                          : ""
                      }
                      twitter_username={
                        typeof vault.creator === "object" &&
                        vault.creator?.twitter_username
                          ? vault.creator.twitter_username
                          : undefined
                      }
                      chartData={vaultChartData[vault._id] || []}
                      isAPYCalculating={isAPYCalculating()}
                    />
                  ))}
                </div>
              );
            })()
          ) : (
            <div className="text-center py-12">
              <p className="text-white/70">No featured vaults available</p>
            </div>
          )}
        </div>
        {/* Filters and Search */}
        <div className="bg-[#0F131AB2] p-4 sm:p-6 rounded-lg">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch sm:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vaults..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                  >
                    Sort by{" "}
                    {sortBy === "apy"
                      ? "APY"
                      : sortBy === "name"
                      ? "Name"
                      : sortBy === "tvl"
                      ? "TVL"
                      : "Newest"}
                    {sortOrder === "desc" ? " ↓" : " ↑"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleSort("apy")}>
                    <SortDesc className="w-4 h-4 mr-2" />
                    APY {sortBy === "apy" && (sortOrder === "desc" ? "↓" : "↑")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSort("name")}>
                    <SortDesc className="w-4 h-4 mr-2" />
                    Name{" "}
                    {sortBy === "name" && (sortOrder === "desc" ? "↓" : "↑")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSort("tvl")}>
                    <SortDesc className="w-4 h-4 mr-2" />
                    TVL {sortBy === "tvl" && (sortOrder === "desc" ? "↓" : "↑")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSort("newest")}>
                    <SortDesc className="w-4 h-4 mr-2" />
                    Newest{" "}
                    {sortBy === "newest" && (sortOrder === "desc" ? "↓" : "↑")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="hero"
                size="sm"
                asChild
                className="w-full sm:w-auto"
              >
                <Link to="/create-vault">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Vault
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <Tabs
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          className="mb-6 sm:mb-8"
        >
          {/* <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1 bg-transparent p-1">
            {categories.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="flex flex-col gap-1 py-2 sm:py-3 text-xs sm:text-sm"
              >
                <span className="font-medium truncate">{category.label}</span>
                <Badge variant="secondary" className="text-xs">
                  {category.count}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList> */}

          <TabsContent value={selectedCategory} className="mt-8">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="ml-2">Loading vaults...</span>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-500 mb-4">{error}</p>
                <Button onClick={() => fetchVaults()} variant="outline">
                  Try Again
                </Button>
              </div>
            ) : (
              <>
                {/* Vault List */}
                <div className="flex flex-col gap-4 sm:gap-6 w-full">
                  {filteredVaults.map((vault) => (
                    <VaultCard
                      key={vault._id}
                      id={vault._id}
                      name={vault.vaultName}
                      symbol={vault.vaultSymbol}
                      apy={getAPYDisplay(vault.vaultName)} // Use calculated APY from global state
                      tvl={getTVLDisplay(vault)}
                      capacity={Math.floor(Math.random() * 100)}
                      assets={vault.underlyingAssets.map((asset) => ({
                        symbol:
                          asset.assetAllocation?.symbol ||
                          asset.symbol ||
                          "Unknown",
                        logoUrl: asset.assetAllocation?.logoUrl,
                      }))}
                      risk={
                        vault.status === "pending"
                          ? "High"
                          : ("Medium" as const)
                      }
                      nav={vault.nav}
                      creator={{
                        name:
                          typeof vault.creator === "object" &&
                          vault.creator?.name
                            ? vault.creator.name
                            : "Unknown Creator",
                        twitter:
                          typeof vault.creator === "object" &&
                          vault.creator?.email
                            ? vault.creator.email
                            : "",
                      }}
                      chartData={vaultChartData[vault._id] || []}
                      isAPYCalculating={isAPYCalculating()}
                      vaultAddress={vault.vaultAddress}
                    />
                  ))}
                </div>

                {/* Load More */}
                {(pagination.hasNext || vaults.length < pagination.total) && (
                  <div className="text-center mt-8 sm:mt-12">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="w-full sm:w-auto"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        "Load More Vaults"
                      )}
                    </Button>
                    <p className="text-sm text-white/70 mt-2">
                      Showing {vaults.length} of {pagination.total} vaults
                    </p>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>{" "}
        {/* Categories */}
      </div>
    </div>
  );
};

export default Vaults;
