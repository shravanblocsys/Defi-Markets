import {
  ApiResponse,
  PaginatedResponse,
  Vault,
  Portfolio,
  User,
  Transaction,
  VaultDepositsResponse,
  TransactionHistoryResponse,
  MultiVaultChartData,
  RedeemSwapAdminData,
} from "@/types/store";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

// Generic API request function
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  // Add auth token if available
  const token = sessionStorage.getItem("token");
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.message || `HTTP error! status: ${response.status}`,
        response.status,
        errorData.code
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : "Network error",
      0
    );
  }
}

// Auth API
export const authApi = {
  // Legacy login method
  login: (address: string, signature: string) =>
    apiRequest<ApiResponse<{ user: User; token: string }>>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ address, signature }),
    }),

  // New 4-step Solana authentication flow
  getNonce: (address: string) =>
    apiRequest<ApiResponse<{ nonce: string }>>("/user/create-nonce", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),

  createMessage: (
    domain: string,
    address: string,
    statement: string,
    uri: string,
    version: string,
    chainId: string,
    nonce: string
  ) =>
    apiRequest<ApiResponse<{ message: string }>>("/user/create-message", {
      method: "POST",
      body: JSON.stringify({
        domain,
        address,
        statement,
        uri,
        version,
        chainId,
        nonce,
      }),
    }),

  verifySignature: (message: unknown, signature: string, chainId: string) =>
    apiRequest<ApiResponse<{ user: User; token: string }>>(
      "/user/verify-payload",
      {
        method: "POST",
        body: JSON.stringify({ message, signature, chainId }),
      }
    ),

  logout: () =>
    apiRequest<ApiResponse<void>>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  getProfile: () =>
    apiRequest<{ success: boolean; data: { user?: User } & User }>(
      "/auth/verify"
    ),

  updateProfile: (data: Partial<User>) =>
    apiRequest<ApiResponse<User>>("/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

// Vaults API
export const vaultsApi = {
  getAll: (params?: { page?: number; limit?: number; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    if (params?.search) searchParams.append("search", params.search);

    return apiRequest<ApiResponse<PaginatedResponse<Vault>>>(
      `/vaults?${searchParams.toString()}`
    );
  },

  getVaults: (page: number = 1, limit: number = 9) =>
    apiRequest<{
      data: Vault[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/vault-insights/user?page=${page}&limit=${limit}`),

  getVaultsByUser: (page: number = 1, limit: number = 9) =>
    apiRequest<{
      data: Vault[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/vaults/user-vaults/list?page=${page}&limit=${limit}`),

  getById: (id: string) => {
    // Add cache-busting parameter to prevent caching issues
    const timestamp = Date.now();
    return apiRequest<ApiResponse<Vault>>(`/vaults/${id}?t=${timestamp}`);
  },

  create: (vaultData: Omit<Vault, "id" | "createdAt" | "updatedAt">) =>
    apiRequest<ApiResponse<Vault>>("/vaults", {
      method: "POST",
      body: JSON.stringify(vaultData),
    }),

  update: (id: string, vaultData: Partial<Vault>) =>
    apiRequest<ApiResponse<Vault>>(`/vaults/${id}`, {
      method: "PUT",
      body: JSON.stringify(vaultData),
    }),

  delete: (id: string) =>
    apiRequest<ApiResponse<void>>(`/vaults/${id}`, {
      method: "DELETE",
    }),

  deposit: (vaultId: string, amount: number) =>
    apiRequest<ApiResponse<Transaction>>(`/vaults/${vaultId}/deposit`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),

  withdraw: (vaultId: string, amount: number) =>
    apiRequest<ApiResponse<Transaction>>(`/vaults/${vaultId}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),

  getFeaturedVaults: (page: number = 1, limit: number = 10) =>
    apiRequest<{
      data: Vault[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/vault-insights/featured/list?page=${page}&limit=${limit}`),

  getVaultInsights: (id: string) =>
    apiRequest<
      ApiResponse<{
        totalUnderlyingAssetsCount: number;
        totalUsersCount: number;
        vaultSymbol: string;
      }>
    >(`/vault-insights/${id}`),

  getVaultPortfolio: (id: string) =>
    apiRequest<
      ApiResponse<{
        vaultSymbol: string;
        assets: Array<{
          assetName: string;
          logoUrl: string;
          percentageAllocation: number;
          price: number;
          change24h: number;
        }>;
      }>
    >(`/vault-insights/portfolio/${id}`),

  getVaultFinancials: (id: string) =>
    apiRequest<
      ApiResponse<{
        grossAssetValue: number;
        netAssetValue: number;
      }>
    >(`/vault-insights/gav-nav/${id}`),

  getVaultFees: (id: string) =>
    apiRequest<
      ApiResponse<{
        fees: Array<{
          feeRate?: number;
          minFeeRate?: number;
          maxFeeRate?: number;
          description: string;
          type: string;
        }>;
        vaultFees: number;
      }>
    >(`/vault-insights/fees/${id}`),

  getVaultDepositors: (id: string) =>
    apiRequest<
      ApiResponse<{
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
      }>
    >(`/vault-insights/user-holdings/${id}`),

  getVaultActivity: (id: string, page: number = 1, limit: number = 20) => {
    const searchParams = new URLSearchParams();
    searchParams.append("page", page.toString());
    searchParams.append("limit", limit.toString());

    return apiRequest<{
      data: Array<{
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
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/vault-insights/history/${id}?${searchParams.toString()}`);
  },

  getUserDeposits: (id: string) =>
    apiRequest<
      ApiResponse<{
        totalDeposited: number;
        totalRedeemed: number;
        currentValue: number;
        totalReturns: number;
        vaultSymbol: string;
        userAddress: string;
      }>
    >(`/vault-insights/user-deposits/${id}`),

  getDashboardStats: () =>
    apiRequest<{
      status: string;
      message: string;
      data: {
        valueLocked: {
          totalValueLocked: number;
          totalValueLockedGrowth: number;
        };
        vault: {
          totalVaults: number;
          totalVaultsGrowth: number;
          averageAPY: number;
          averageAPYGrowth: number;
        };
        users: {
          activeInvestors: number;
          activeInvestorsGrowth: number;
        };
      };
    }>("/dashboard/vault-stats"),
};

//chart Api
export const chartApi = {
  getChartDataOfMultipleVaults: (ids: string[], interval?: string) =>
    apiRequest<ApiResponse<MultiVaultChartData>>(
      `/charts/vaults/line?vaultIds=${ids}&interval=${
        interval ? interval : "1W"
      }`
    ),

  // Get vault share price chart data
  getVaultSharePriceChart: (vaultId: string, interval: string = "day") =>
    apiRequest<{
      status: string;
      message: string;
      data: {
        vaultId: string;
        vaultName: string;
        data: Array<{
          timestamp: string;
          sharePrice: number;
          nav: number;
          totalSupply: number;
          gav: number;
        }>;
        currentSharePrice: {
          timestamp: string;
          sharePrice: number;
          nav: number;
          totalSupply: number;
          gav: number;
        };
      };
    }>(`/charts/vault/${vaultId}/share-price/chart?interval=${interval}`),

  // Get all timeframes share price chart data
  getVaultSharePriceChartAll: (vaultId: string) =>
    apiRequest<{
      status: string;
      message: string;
      data: {
        vaultId: string;
        vaultName: string;
        timeframes: {
          "1D": Array<{
            timestamp: string;
            sharePrice: number;
            nav: number;
            totalSupply: number;
            gav: number;
          }>;
          "1M": Array<{
            timestamp: string;
            sharePrice: number;
            nav: number;
            totalSupply: number;
            gav: number;
          }>;
          "3M": Array<{
            timestamp: string;
            sharePrice: number;
            nav: number;
            totalSupply: number;
            gav: number;
          }>;
          "6M": Array<{
            timestamp: string;
            sharePrice: number;
            nav: number;
            totalSupply: number;
            gav: number;
          }>;
          "1Y": Array<{
            timestamp: string;
            sharePrice: number;
            nav: number;
            totalSupply: number;
            gav: number;
          }>;
        };
        currentSharePrice: {
          timestamp: string;
          sharePrice: number;
          nav: number;
          totalSupply: number;
          gav: number;
        };
      };
    }>(`/charts/vault/${vaultId}/share-price/chart/all`),

  // Get current share price only
  getVaultCurrentSharePrice: (vaultId: string) =>
    apiRequest<{
      status: string;
      message: string;
      data: {
        vaultId: string;
        vaultName: string;
        currentSharePrice: {
          timestamp: string;
          sharePrice: number;
          nav: number;
          totalSupply: number;
          gav: number;
        };
      };
    }>(`/charts/vault/${vaultId}/share-price`),

  // Get total USD (TVL) for all vaults
  getVaultsTotalUSD: () =>
    apiRequest<{
      status: string;
      message: string;
      data: {
        data: Array<{
          vaultId: string;
          vaultName: string;
          vaultIndex: number;
          totalUsd: number;
          totalUsdLamports: number;
        }>;
        featuredVaults: Array<{
          vaultId: string;
          vaultName: string;
          vaultIndex: number;
          totalUsd: number;
          totalUsdLamports: number;
        }>;
      };
    }>("/charts/vaults/total-usd"),

  // Get total USD (TVL) for specific vault(s) by vaultIds
  getVaultTotalUSD: (vaultIds: string[]) =>
    apiRequest<{
      status: string;
      message: string;
      data: {
        data: Array<{
          vaultId: string;
          vaultName: string;
          vaultIndex: number;
          totalUsd: number;
          totalUsdLamports: number;
        }>;
      };
    }>(`/charts/vaults/total-usd?vaultIds=${vaultIds.join(",")}`),
};

// Portfolio API
export const portfolioApi = {
  getPortfolio: () => apiRequest<ApiResponse<Portfolio>>("/portfolio"),

  // New portfolio APIs with real backend data
  getUserPortfolio: () =>
    apiRequest<{
      status: string;
      message: string;
      data: {
        summary: {
          totalValue: number;
          totalDeposited: number;
          totalRedeemed: number;
          totalReturns: number;
          vaultCount: number;
          averageAPY: number;
          dayChange: number;
          dayChangePercent: number;
          weekChange: number;
          weekChangePercent: number;
          lastUpdated: string;
        };
        vaults: Array<{
          vaultId: string;
          vaultName: string;
          vaultSymbol: string;
          totalDeposited: number;
          totalRedeemed: number;
          currentValue: number;
          totalReturns: number;
          apy: number;
          vaultIndex: number;
          dayChange: number;
          dayChangePercent: number;
          weekChange: number;
          weekChangePercent: number;
        }>;
      };
    }>("/vault-insights/user-portfolio/data"),

  getUserVaults: () =>
    apiRequest<{
      status: string;
      message: string;
      data: {
        vaults: Array<{
          vaultId: string;
          vaultName: string;
          vaultSymbol: string;
          totalDeposited: number;
          totalRedeemed: number;
          currentValue: number;
          totalReturns: number;
          apy: number;
          vaultIndex: number;
          dayChange: number;
          dayChangePercent: number;
          weekChange: number;
          weekChangePercent: number;
        }>;
        total: number;
      };
    }>("/vault-insights/user-vaults/data"),

  getTransactions: (params?: {
    page?: number;
    limit?: number;
    type?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    if (params?.type) searchParams.append("type", params.type);

    return apiRequest<ApiResponse<PaginatedResponse<Transaction>>>(
      `/portfolio/transactions?${searchParams.toString()}`
    );
  },

  getTransaction: (id: string) =>
    apiRequest<ApiResponse<Transaction>>(`/portfolio/transactions/${id}`),

  getDeposits: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());

    return apiRequest<VaultDepositsResponse>(
      `/vault-deposit/transactions/deposits?${searchParams.toString()}`
    );
  },

  getTransactionHistory: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());

    return apiRequest<TransactionHistoryResponse>(
      `/history/transactions-user?${searchParams.toString()}`
    );
  },

  checkMinDeposit: (minDeposit: number) =>
    apiRequest<ApiResponse<{ isValid: boolean; message?: string }>>(
      "/vault-deposit/checkMinDeposit",
      {
        method: "POST",
        body: JSON.stringify({ minDeposit }),
      }
    ),

  checkMinRedeem: (minRedeem: number) =>
    apiRequest<ApiResponse<{ isValid: boolean; message?: string }>>(
      "/vault-deposit/checkMinRedeem",
      {
        method: "POST",
        body: JSON.stringify({ minRedeem }),
      }
    ),
};

// Wallet API
export const walletApi = {
  getBalance: (address: string) =>
    apiRequest<ApiResponse<{ balance: number; network: string }>>(
      `/wallet/balance/${address}`
    ),

  getTransactionHistory: (
    address: string,
    params?: { page?: number; limit?: number }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());

    return apiRequest<ApiResponse<PaginatedResponse<Transaction>>>(
      `/wallet/transactions/${address}?${searchParams.toString()}`
    );
  },
};

type TransactionSignature = {
  transactionSignature: string;
  logoUrl: string;
  bannerUrl: string;
  description: string;
};

// Transaction Event Management API
export const transactionEventApi = {
  readTransaction: (transactionSignature: TransactionSignature) =>
    apiRequest<ApiResponse<{ acknowledged?: boolean }>>(
      "/tx-event-management/read-transaction",
      {
        method: "POST",
        body: JSON.stringify(transactionSignature),
      }
    ),

  depositTransaction: (
    transactionSignature: string,
    signatureArray?: string[]
  ) =>
    apiRequest<ApiResponse<{ acknowledged?: boolean }>>(
      "/tx-event-management/deposit-transaction",
      {
        method: "POST",
        body: JSON.stringify({ transactionSignature, signatureArray }),
      }
    ),

  redeemTransaction: (
    transactionSignature: string,
    hints?: {
      vaultAddress?: string;
      vaultIndex?: number;
      signatureArray?: string[];
    }
  ) =>
    apiRequest<ApiResponse<{ acknowledged?: boolean }>>(
      "/tx-event-management/redeem-transaction",
      {
        method: "POST",
        body: JSON.stringify({ transactionSignature, ...hints }),
      }
    ),

  adminSwapByVault: (params: {
    vaultIndex: number;
    amountInRaw: string;
    etfSharePriceRaw?: string;
  }) =>
    apiRequest<
      ApiResponse<{
        swapExecuted: boolean;
        txSignatures?: string[];
        vaultIndex: number;
        amountRequested: string;
        amountUsed: string;
        vaultUsdcBalance: string;
        swaps?: Array<{
          assetMint: string;
          usdcPortion: string;
          transferSig: string;
          swapSig: string;
        }>;
      }>
    >("/tx-event-management/swap", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  redeemSwap: (params: {
    vaultIndex: number;
    vaultTokenAmount: string;
    outputTokens: Array<{ mintAddress: string; amount: string }>;
  }) =>
    apiRequest<ApiResponse<{ txSignatures?: string[] }>>(
      "/tx-event-management/redeem-swap",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    ),

  redeemSwapAdmin: (params: {
    vaultIndex: number;
    vaultTokenAmount: string;
    etfSharePriceRaw?: string;
  }) =>
    apiRequest<ApiResponse<RedeemSwapAdminData>>(
      "/tx-event-management/redeem-swap",
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    ),
};

// File Upload API
export const uploadApi = {
  uploadToS3: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const url = `${API_BASE_URL}/s3-bucket/upload`;
    const token = sessionStorage.getItem("token");

    return fetch(url, {
      method: "POST",
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    }).then(async (response) => {
      console.log("Upload response status:", response.status);
      console.log("Upload response headers:", response.headers);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Upload error response:", errorData);
        throw new ApiError(
          errorData.message || `HTTP error! status: ${response.status}`,
          response.status,
          errorData.code
        );
      }

      const result = await response.json();
      console.log("Upload success response:", result);
      return result;
    });
  },
};

// Asset Allocation API
export const assetAllocationApi = {
  getAll: (page: number = 1, limit: number = 20, search?: string) => {
    const searchParams = new URLSearchParams();
    searchParams.append("page", page.toString());
    searchParams.append("limit", limit.toString());
    // Align asset network with app environment; default to mainnet
    const envNetwork =
      (import.meta.env.VITE_SOLANA_NETWORK as string | undefined) ||
      "mainnet-beta";
    const apiNetwork = envNetwork === "devnet" ? "devnet" : "mainnet";
    searchParams.append("network", apiNetwork);

    if (search) {
      // searchParams.append("search", search);
      searchParams.append("symbol", search.toUpperCase());
    }

    return apiRequest<{
      data: Array<{
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
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/asset-allocation/all?${searchParams.toString()}`);
  },
};

// Vault Name Check API
export const vaultNameCheckApi = {
  checkVaultName: (vaultName: string) =>
    apiRequest<ApiResponse<boolean>>("/vaults/vault-check", {
      method: "POST",
      body: JSON.stringify({ vaultName }),
    }),
};

// Fees Management API
export const feesManagementApi = {
  getFees: (feesId: string) =>
    apiRequest<{
      status: string;
      message: string;
      data: {
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
        };
        isActive: boolean;
        createdAt: string;
        updatedAt: string;
        __v: number;
      };
    }>(`/fees-management/${feesId}`),

  getVaultSummary: () =>
    apiRequest<{
      status: string;
      message: string;
      data: Array<{
        vaults: Array<{
          vaultName: string;
          vaultSymbol: string;
          gav: number;
          nav: number;
        }>;
        date: string;
      }>;
    }>("/vault-management-fees/vault-summary"),
};

export { ApiError };
