import { useEffect } from 'react';
import { useVaults } from '@/hooks/useVaults';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export const VaultList = () => {
  const { user, isAuthenticated } = useAuth();
  const {
    vaults,
    isLoading,
    error,
    pagination,
    filters,
    fetchVaults,
    setFilters,
    setPage,
    clearError,
  } = useVaults();

  useEffect(() => {
    if (isAuthenticated) {
      fetchVaults({ page: 1, limit: 10 });
    }
  }, [isAuthenticated, fetchVaults]);

  const handleSearch = (searchTerm: string) => {
    setFilters({ search: searchTerm });
    fetchVaults({ page: 1, limit: 10, search: searchTerm });
  };

  const handlePageChange = (page: number) => {
    setPage(page);
    fetchVaults({ page, limit: 10, search: filters.search });
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please connect your wallet to view vaults</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-destructive">Error: {error}</p>
        <Button onClick={clearError}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          placeholder="Search vaults..."
          className="flex-1 px-4 py-2 rounded-lg border border-border-strong bg-surface-1"
          onChange={(e) => handleSearch(e.target.value)}
        />
        <Button variant="outline" onClick={() => fetchVaults()}>
          Refresh
        </Button>
      </div>

      {/* Vaults Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vaults.map((vault) => (
              <Card key={vault.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{vault.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {vault.description}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        vault.riskLevel === 'low' ? 'default' :
                        vault.riskLevel === 'medium' ? 'secondary' : 'destructive'
                      }
                    >
                      {vault.riskLevel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">APY</span>
                      <span className="font-semibold text-success">
                        {vault.apy.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Value</span>
                      <span className="font-semibold">
                        ${vault.totalValue.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Participants</span>
                      <span className="font-semibold">{vault.participants}</span>
                    </div>
                    <div className="pt-2">
                      <Button className="w-full" variant="outline">
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page === pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
