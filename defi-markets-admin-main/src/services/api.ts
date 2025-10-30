import {
  ApiResponse,
  PaginatedResponse,
  Vault,
  VaultApiResponse,
  Portfolio,
  User,
  Transaction,
  Asset,
  AssetApiResponse,
} from "@/types/store";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

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
    apiRequest<ApiResponse<{ user: User; token: string }>>("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ address, signature }),
    }),

  // Admin login method
  adminLogin: (email: string, password: string) =>
    apiRequest<ApiResponse<{ user: User; token: string }>>("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  // Admin verify token method
  adminVerify: () =>
    apiRequest<ApiResponse<User>>("/auth/admin/verify", {
      method: "GET",
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

  verifySignature: (message: any, signature: string, chainId: string) =>
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

  getProfile: () => apiRequest<ApiResponse<User>>("/auth/admin/verify"),

  updateProfile: (data: Partial<User>) =>
    apiRequest<ApiResponse<User>>("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

// Dashboard API
export const dashboardApi = {
  getStatistics: () =>
    apiRequest<ApiResponse<{
      totalDepositAmount: number;
      totalDepositAmountLastMonth: number;
      depositGrowthPercentage: number;
      activeUsers: number;
      activeUsersYesterday: number;
      userGrowthCount: number;
      totalVaults: number;
      activeVaults: number;
      pausedVaults: number;
      pendingVaults: number;
      closedVaults: number;
      totalDeposits: number;
      totalRedeems: number;
      totalUsers: number;
      totalUsersRedeemed: number;
    }>>("/dashboard/dashboard-statistics"),
};

// Vaults API
export const vaultsApi = {
  getAll: (params?: { page?: number; limit?: number; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    if (params?.search) searchParams.append("search", params.search);

    return apiRequest<VaultApiResponse>(
      `/vaults?${searchParams.toString()}`
    );
  },

  getById: (id: string) => apiRequest<ApiResponse<Vault>>(`/vaults/${id}`),

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

  pause: (vaultId: string) =>
    apiRequest<ApiResponse<Vault>>(`/vaults/${vaultId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "paused" }),
    }),

  resume: (vaultId: string) =>
    apiRequest<ApiResponse<Vault>>(`/vaults/${vaultId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    }),

  updateFeatured: (vaultId: string, isFeaturedVault: boolean) =>
    apiRequest<ApiResponse<Vault>>(`/vaults/${vaultId}/featured`, {
      method: "PATCH",
      body: JSON.stringify({ isFeaturedVault }),
    }),
};

export const vaultsStatsApi = {
  getVaultStatistics: () =>
    apiRequest<ApiResponse<{
      totalVaults: number;
      activeVaults: number;
      pausedVaults: number;
      pendingVaults: number;
      closedVaults: number;
      totalDeposits: number;
      totalRedeems: number;
      totalUsers: number;
      totalUsersRedeemed: number;
    }>>("/dashboard/vault-statistics"),
};
export const auditApi = {
  getAuditLogs: (params?: { 
    page?: number; 
    limit?: number; 
    action?: string; 
    fromDate?: string; 
    toDate?: string;
    search?: string;
    relatedEntity?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    if (params?.action) searchParams.append("action", params.action);
    if (params?.fromDate) searchParams.append("fromDate", params.fromDate);
    if (params?.toDate) searchParams.append("toDate", params.toDate);
    if (params?.search) searchParams.append("search", params.search);
    if (params?.relatedEntity) searchParams.append("relatedEntity", params.relatedEntity);

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
        vaultId?: {
          _id: string;
          vaultName: string;
          vaultSymbol: string;
        } | null;
        feeId?: {
          _id: string;
          feeRate: number;
          effectiveDate: string;
        } | null;
        metadata?: {
          feeRate?: number;
          effectiveDate?: string;
          description?: string;
          [key: string]: any;
        };
        createdAt: string;
        updatedAt: string;
        __v: number;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/history?${searchParams.toString()}`);
  },
  
  getAuditLogById: (id: string) =>
    apiRequest<ApiResponse<any>>(`/history/${id}`)
      .then(response => response.data)
}

export const exportAuditApi = {
  getAuditLogs: (params?: { 
    action?: string; 
    fromDate?: string; 
    toDate?: string;
    relatedEntity?: string;
  }) => {
    const searchParams = new URLSearchParams(); 
    if (params?.action) searchParams.append("action", params.action);
    if (params?.fromDate) searchParams.append("fromDate", params.fromDate);
    if (params?.toDate) searchParams.append("toDate", params.toDate);
    if (params?.relatedEntity) searchParams.append("relatedEntity", params.relatedEntity);

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
        vaultId?: {
          _id: string;
          vaultName: string;
          vaultSymbol: string;
        } | null;
        feeId?: {
          _id: string;
          feeRate: number;
          effectiveDate: string;
        } | null;
        metadata?: {
          feeRate?: number;
          effectiveDate?: string;
          description?: string;
          [key: string]: any;
        };
        createdAt: string;
        updatedAt: string;
        __v: number;
      }>;
    }>(`/history/export?${searchParams.toString()}`);
  }
}

// Fee History API
export const feeHistoryApi = {
  getFeeHistory: (params?: { 
    page?: number; 
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());

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
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/history/fees?${searchParams.toString()}`);
  }
}

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

  updateFees: (feesId: string, fees: Array<{
    feeRate?: number;
    minFeeRate?: number;
    maxFeeRate?: number;
    description: string;
    type: string;
  }>) =>
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
    }>(`/fees-management/${feesId}`, {
      method: "PUT",
      body: JSON.stringify({ fees }),
    }),
}

// Portfolio API
export const portfolioApi = {
  getPortfolio: () => apiRequest<ApiResponse<Portfolio>>("/portfolio"),

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

// Transaction Event Management API
export const transactionEventApi = {
  updateFees: (transactionSignature: string) =>
    apiRequest<ApiResponse<unknown>>("/tx-event-management/update-fees", {
      method: "POST",
      body: JSON.stringify({ transactionSignature }),
    }),
};


// Asset Allocation API
export const assetAllocationApi = {
  getAssets: (params?: { 
    page?: number; 
    limit?: number; 
    search?: string; 
    type?: string;
    active?: boolean;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    if (params?.search) searchParams.append("search", params.search);
    if (params?.type) searchParams.append("type", params.type);
    if (params?.active !== undefined) searchParams.append("active", params.active.toString());

    return apiRequest<AssetApiResponse>(
      `/asset-allocation?${searchParams.toString()}`
    );
  },

  getAssetById: (id: string) =>
    apiRequest<ApiResponse<Asset>>(`/asset-allocation/${id}`),

  updateAsset: (id: string, assetData: Partial<Asset>) =>
    apiRequest<ApiResponse<Asset>>(`/asset-allocation/${id}`, {
      method: "PUT",
      body: JSON.stringify(assetData),
    }),

  toggleAssetStatus: (id: string) =>
    apiRequest<ApiResponse<Asset>>(`/asset-allocation/${id}/toggle-active`, {
      method: "PATCH",
      body: JSON.stringify({}),
    }),
};

// Management Fees API
export const managementFeesApi = {
  getManagementFees: (params?: { 
    page?: number; 
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append("page", params.page.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());

    return apiRequest<{
      data: Array<{
        date: string;
        etf: string;
        nav: number;
        etfCreatorFee: number;
        platformOwnerFee: number;
        todaysAum: number;
        status: 'pending' | 'allocated' | 'in_process';
        previouslyAccruedFees: number;
        newlyAccruedFees: number;
      }>;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/vault-management-fees?${searchParams.toString()}`);
  },
};

export { ApiError };
