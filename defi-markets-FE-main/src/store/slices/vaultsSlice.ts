import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { Vault, Transaction } from "@/types/store";
import { vaultsApi } from "@/services/api";

// Interface for storing basic vault data (name and index for contract calls)
interface VaultData {
  vaultName: string;
  vaultIndex?: number; // Vault index used for smart contract calls
}

// Interface for storing vault summary data from API (oldest NAV for each vault)
interface VaultSummaryData {
  vaultName: string;
  vaultSymbol: string;
  gav: number; // GAV from vault summary API
  initialNav: number; // NAV from vault summary API (oldest date)
  date: string; // Date from vault summary API (used for APY time calculation)
}

// Interface for storing individual asset balance data (base10 format)
interface AssetBalance {
  mintAddress: string; // Token mint address
  balanceBase10: number; // Balance converted to base10 (human-readable format)
  decimals: number; // Token decimals used for conversion
  allocation: number; // Allocation in bps
}

// Interface for storing calculated vault performance data including APY
interface VaultFinalData {
  vaultName: string;
  vaultSymbol: string;
  vaultIndex: number;
  initialGav: number; // Initial GAV from vault summary API (oldest date)
  initialNav: number; // Initial NAV from vault summary API (oldest date)
  finalGav: number; // Current GAV from smart contract
  finalNav: number; // Current NAV from smart contract
  apy: number; // Calculated APY using formula: ((Final NAV / Initial NAV) ^ (1 / Time in Years) - 1) × 100
  initialDate: string; // Date from vault summary API (oldest NAV date)
  currentDate: string; // Current date when calculation was performed
  assets: AssetBalance[]; // Array of asset balances in base10 format for this vault
  stablecoinBalanceBase10: number; // Stablecoin balance in base10 format
}

interface VaultsState {
  vaults: Vault[];
  selectedVault: Vault | null;
  vaultDataArray: VaultData[];
  vaultSummaryData: VaultSummaryData[];
  vaultFinalData: VaultFinalData[];
  apyCalculationCompleted: boolean; // Flag to track if APY calculation has been completed
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    search: string;
    riskLevel: string;
    strategy: string;
  };
}

const initialState: VaultsState = {
  vaults: [],
  selectedVault: null,
  vaultDataArray: [],
  vaultSummaryData: [],
  vaultFinalData: [],
  apyCalculationCompleted: false, // Initialize as false
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  },
  filters: {
    search: "",
    riskLevel: "",
    strategy: "",
  },
};

// Async thunks
export const fetchVaults = createAsyncThunk(
  "vaults/fetchVaults",
  async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await vaultsApi.getAll(params);
    return response.data;
  }
);

export const fetchVaultById = createAsyncThunk(
  "vaults/fetchVaultById",
  async (id: string) => {
    const response = await vaultsApi.getById(id);
    return response.data;
  }
);

export const createVault = createAsyncThunk(
  "vaults/createVault",
  async (vaultData: Omit<Vault, "id" | "createdAt" | "updatedAt">) => {
    const response = await vaultsApi.create(vaultData);
    return response.data;
  }
);

export const updateVault = createAsyncThunk(
  "vaults/updateVault",
  async ({ id, vaultData }: { id: string; vaultData: Partial<Vault> }) => {
    const response = await vaultsApi.update(id, vaultData);
    return response.data;
  }
);

export const deleteVault = createAsyncThunk(
  "vaults/deleteVault",
  async (id: string) => {
    await vaultsApi.delete(id);
    return id;
  }
);

export const depositToVault = createAsyncThunk(
  "vaults/deposit",
  async ({ vaultId, amount }: { vaultId: string; amount: number }) => {
    const response = await vaultsApi.deposit(vaultId, amount);
    return response.data;
  }
);

export const withdrawFromVault = createAsyncThunk(
  "vaults/withdraw",
  async ({ vaultId, amount }: { vaultId: string; amount: number }) => {
    const response = await vaultsApi.withdraw(vaultId, amount);
    return response.data;
  }
);

const vaultsSlice = createSlice({
  name: "vaults",
  initialState,
  reducers: {
    setSelectedVault: (state, action: PayloadAction<Vault | null>) => {
      state.selectedVault = action.payload;
    },
    setVaultDataArray: (state, action: PayloadAction<VaultData[]>) => {
      state.vaultDataArray = action.payload;
    },
    setVaultSummaryData: (state, action: PayloadAction<VaultSummaryData[]>) => {
      state.vaultSummaryData = action.payload;
    },
    setVaultFinalData: (state, action: PayloadAction<VaultFinalData[]>) => {
      state.vaultFinalData = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setFilters: (
      state,
      action: PayloadAction<Partial<VaultsState["filters"]>>
    ) => {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.page = 1; // Reset to first page when filters change
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.pagination.page = action.payload;
    },
    clearVaults: (state) => {
      state.vaults = [];
      state.selectedVault = null;
      state.vaultDataArray = [];
      state.vaultSummaryData = [];
      state.vaultFinalData = [];
      state.apyCalculationCompleted = false; // Reset APY calculation flag
      state.pagination = initialState.pagination;
    },
    setApyCalculationCompleted: (state, action: PayloadAction<boolean>) => {
      state.apyCalculationCompleted = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Fetch Vaults
    builder
      .addCase(fetchVaults.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchVaults.fulfilled, (state, action) => {
        state.isLoading = false;
        state.vaults = action.payload.data;
        state.pagination = {
          page: action.payload.page,
          limit: action.payload.limit,
          total: action.payload.total,
          totalPages: action.payload.totalPages,
        };
      })
      .addCase(fetchVaults.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to fetch vaults";
      });

    // Fetch Vault by ID
    builder
      .addCase(fetchVaultById.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchVaultById.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedVault = action.payload;
      })
      .addCase(fetchVaultById.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to fetch vault";
      });

    // Create Vault
    builder
      .addCase(createVault.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createVault.fulfilled, (state, action) => {
        state.isLoading = false;
        state.vaults.unshift(action.payload);
      })
      .addCase(createVault.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to create vault";
      });

    // Update Vault
    builder
      .addCase(updateVault.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateVault.fulfilled, (state, action) => {
        state.isLoading = false;
        const index = state.vaults.findIndex(
          (vault) => vault._id === action.payload._id
        );
        if (index !== -1) {
          state.vaults[index] = action.payload;
        }
        if (state.selectedVault?._id === action.payload._id) {
          state.selectedVault = action.payload;
        }
      })
      .addCase(updateVault.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to update vault";
      });

    // Delete Vault
    builder
      .addCase(deleteVault.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteVault.fulfilled, (state, action) => {
        state.isLoading = false;
        state.vaults = state.vaults.filter(
          (vault) => vault._id !== action.payload
        );
        if (state.selectedVault?._id === action.payload) {
          state.selectedVault = null;
        }
      })
      .addCase(deleteVault.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to delete vault";
      });

    // Deposit to Vault
    builder
      .addCase(depositToVault.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(depositToVault.fulfilled, (state, action) => {
        state.isLoading = false;
        // Update vault data if needed
        if (state.selectedVault?._id === action.payload.vaultId) {
          // You might want to refetch the vault data here
        }
      })
      .addCase(depositToVault.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to deposit to vault";
      });

    // Withdraw from Vault
    builder
      .addCase(withdrawFromVault.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(withdrawFromVault.fulfilled, (state, action) => {
        state.isLoading = false;
        // Update vault data if needed
        if (state.selectedVault?._id === action.payload.vaultId) {
          // You might want to refetch the vault data here
        }
      })
      .addCase(withdrawFromVault.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || "Failed to withdraw from vault";
      });
  },
});

export const {
  setSelectedVault,
  setVaultDataArray,
  setVaultSummaryData,
  setVaultFinalData,
  setApyCalculationCompleted,
  clearError,
  setFilters,
  setPage,
  clearVaults,
} = vaultsSlice.actions;

// Export types for use in other files
export type { AssetBalance, VaultFinalData };

export default vaultsSlice.reducer;
