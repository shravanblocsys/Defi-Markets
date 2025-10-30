import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { assetAllocationApi } from "@/services/api";

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

interface AssetSelectionPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onAssetSelect: (asset: { symbol: string; name: string; mintAddress?: string; logoUrl?: string }) => void;
  selectedAssets: string[]; // Array of asset symbols already selected
}

const AssetSelectionPopup = ({
  isOpen,
  onClose,
  onAssetSelect,
  selectedAssets,
}: AssetSelectionPopupProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [availableAssets, setAvailableAssets] = useState<ApiAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch assets function
  const fetchAssets = useCallback(async (page: number = 1, append: boolean = false, searchTerm?: string) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const response = await assetAllocationApi.getAll(page, 20, searchTerm);

      if (response && response.data && Array.isArray(response.data)) {
        const newAssets = response.data;
        const newPagination = response.pagination;

        if (append) {
          setAvailableAssets(prev => [...prev, ...newAssets]);
        } else {
          setAvailableAssets(newAssets);
        }

        setPagination(newPagination);
      } else {
        setError("Failed to fetch assets: Invalid response format");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch assets");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Load more assets
  const loadMoreAssets = useCallback(() => {
    if (pagination.hasNext && !loadingMore && !loading) {
      fetchAssets(pagination.page + 1, true, searchTerm);
    }
  }, [pagination.hasNext, pagination.page, loadingMore, loading, fetchAssets, searchTerm]);

  // Handle search with debouncing
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      fetchAssets(1, false, value);
    }, 500); // 500ms debounce
  }, [fetchAssets]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100; // 100px threshold

    if (isNearBottom) {
      loadMoreAssets();
    }
  }, [loadMoreAssets]);

  // Initial load when popup opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      fetchAssets(1, false);
    }
  }, [isOpen, fetchAssets]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Add scroll listener
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Get unique asset types
  const assetTypes = useMemo(() => {
    const types = [...new Set(availableAssets.map(asset => asset.type))];
    return ["all", ...types];
  }, [availableAssets]);

  // Filter assets based on search and type
  const filteredAssets = useMemo(() => {
    return availableAssets.filter(asset => {
      const matchesSearch = 
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.symbol.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = selectedType === "all" || asset.type === selectedType;
      
      return matchesSearch && matchesType && asset.active;
    });
  }, [availableAssets, searchTerm, selectedType]);

  const handleAssetClick = (asset: ApiAsset) => {
    if (!selectedAssets.includes(asset.symbol)) {
      onAssetSelect({ 
        symbol: asset.symbol, 
        name: asset.name,
        mintAddress: asset.mintAddress,
        logoUrl: asset.logoUrl
      });
    }
  };

  const isAssetSelected = (symbol: string) => selectedAssets.includes(symbol);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-architekt">Select Assets</DialogTitle>
          <DialogDescription className="font-architekt">
            Choose assets to add to your vault portfolio
          </DialogDescription>
        </DialogHeader>

        {/* Search and Filters */}
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 font-architekt"
            />
          </div>

          {/* Type Filters */}
          <div className="flex flex-wrap gap-2">
            {assetTypes.map((type) => (
              <Button
                key={type}
                variant={selectedType === type ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedType(type)}
                className="font-architekt capitalize"
              >
                {type}
              </Button>
            ))}
          </div>
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2 font-architekt">Loading assets...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-error mb-4 font-architekt">{error}</p>
              <Button variant="outline" onClick={onClose} className="font-architekt">
                Close
              </Button>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground font-architekt">
                No assets found matching your criteria
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredAssets.map((asset) => (
                <div
                  key={asset._id}
                  className={cn(
                    "p-4 glass-surface rounded-lg border transition-all duration-200 cursor-pointer",
                    isAssetSelected(asset.symbol)
                      ? "border-primary bg-primary/10"
                      : "border-border-subtle hover:border-primary/50 hover:bg-primary/5"
                  )}
                  onClick={() => handleAssetClick(asset)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Asset Logo */}
                      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {asset.logoUrl ? (
                          <img
                            src={asset.logoUrl}
                            alt={asset.symbol}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={cn(
                          "w-full h-full flex items-center justify-center text-sm font-bold font-architekt",
                          asset.logoUrl ? "hidden" : ""
                        )}>
                          {asset.symbol.slice(0, 2)}
                        </div>
                      </div>

                      {/* Asset Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-sm font-architekt">
                            {asset.symbol}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium font-architekt truncate mb-1" title={asset.name}>
                          {asset.name.length > 15 ? `${asset.name.substring(0, 15)}...` : asset.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-architekt">
                          {asset.mintAddress.slice(0, 8)}...{asset.mintAddress.slice(-8)}
                        </p>
                      </div>
                    </div>

                    {/* Selection Indicator */}
                    <div className="flex-shrink-0">
                      {isAssetSelected(asset.symbol) ? (
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-4 h-4 text-primary-foreground" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Loading More Indicator */}
          {loadingMore && (
            <div className="flex justify-center items-center py-4">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm font-architekt">Loading more assets...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t border-border-subtle">
          <div className="text-sm text-muted-foreground font-architekt">
            <p>Showing {availableAssets.length} of {pagination.total} assets</p>
            {pagination.hasNext && (
              <p className="text-xs">Scroll down to load more</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="font-architekt">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssetSelectionPopup;
