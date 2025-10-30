import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Vault, Transaction } from '@/types/store';
import { vaultsApi } from '@/services/api';

interface VaultsState {
  vaults: Vault[];
  selectedVault: Vault | null;
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
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  },
  filters: {
    search: '',
    riskLevel: '',
    strategy: '',
  },
};

// Async thunks
export const fetchVaults = createAsyncThunk(
  'vaults/fetchVaults',
  async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await vaultsApi.getAll(params);
    return response.data;
  }
);

export const fetchVaultById = createAsyncThunk(
  'vaults/fetchVaultById',
  async (id: string) => {
    const response = await vaultsApi.getById(id);
    return response.data;
  }
);

export const createVault = createAsyncThunk(
  'vaults/createVault',
  async (vaultData: Omit<Vault, 'id' | 'createdAt' | 'updatedAt'>) => {
    const response = await vaultsApi.create(vaultData);
    return response.data;
  }
);

export const updateVault = createAsyncThunk(
  'vaults/updateVault',
  async ({ id, vaultData }: { id: string; vaultData: Partial<Vault> }) => {
    const response = await vaultsApi.update(id, vaultData);
    return response.data;
  }
);

export const deleteVault = createAsyncThunk(
  'vaults/deleteVault',
  async (id: string) => {
    await vaultsApi.delete(id);
    return id;
  }
);

export const depositToVault = createAsyncThunk(
  'vaults/deposit',
  async ({ vaultId, amount }: { vaultId: string; amount: number }) => {
    const response = await vaultsApi.deposit(vaultId, amount);
    return response.data;
  }
);

export const withdrawFromVault = createAsyncThunk(
  'vaults/withdraw',
  async ({ vaultId, amount }: { vaultId: string; amount: number }) => {
    const response = await vaultsApi.withdraw(vaultId, amount);
    return response.data;
  }
);

const vaultsSlice = createSlice({
  name: 'vaults',
  initialState,
  reducers: {
    setSelectedVault: (state, action: PayloadAction<Vault | null>) => {
      state.selectedVault = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setFilters: (state, action: PayloadAction<Partial<VaultsState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
      state.pagination.page = 1; // Reset to first page when filters change
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.pagination.page = action.payload;
    },
    clearVaults: (state) => {
      state.vaults = [];
      state.selectedVault = null;
      state.pagination = initialState.pagination;
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
        state.error = action.error.message || 'Failed to fetch vaults';
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
        state.error = action.error.message || 'Failed to fetch vault';
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
        state.error = action.error.message || 'Failed to create vault';
      });

    // Update Vault
    builder
      .addCase(updateVault.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateVault.fulfilled, (state, action) => {
        state.isLoading = false;
        const index = state.vaults.findIndex(vault => vault.id === action.payload.id);
        if (index !== -1) {
          state.vaults[index] = action.payload;
        }
        if (state.selectedVault?.id === action.payload.id) {
          state.selectedVault = action.payload;
        }
      })
      .addCase(updateVault.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to update vault';
      });

    // Delete Vault
    builder
      .addCase(deleteVault.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteVault.fulfilled, (state, action) => {
        state.isLoading = false;
        state.vaults = state.vaults.filter(vault => vault.id !== action.payload);
        if (state.selectedVault?.id === action.payload) {
          state.selectedVault = null;
        }
      })
      .addCase(deleteVault.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to delete vault';
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
        if (state.selectedVault?.id === action.payload.vaultId) {
          // You might want to refetch the vault data here
        }
      })
      .addCase(depositToVault.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to deposit to vault';
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
        if (state.selectedVault?.id === action.payload.vaultId) {
          // You might want to refetch the vault data here
        }
      })
      .addCase(withdrawFromVault.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to withdraw from vault';
      });
  },
});

export const {
  setSelectedVault,
  clearError,
  setFilters,
  setPage,
  clearVaults,
} = vaultsSlice.actions;

export default vaultsSlice.reducer;
