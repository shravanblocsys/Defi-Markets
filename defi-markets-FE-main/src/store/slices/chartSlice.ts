import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { VaultChartPoint } from "@/types/store";
import { chartApi } from "@/services/api";

interface ChartState {
  vaultChartData: Record<string, VaultChartPoint[]>;
  isLoading: boolean;
  error: string | null;
  loadingVaults: string[]; // Track which vaults are currently loading chart data
}

const initialState: ChartState = {
  vaultChartData: {},
  isLoading: false,
  error: null,
  loadingVaults: [],
};

export const fetchMultipleVaultChartData = createAsyncThunk(
  "chart/fetchMultipleVaultChartData",
  async (vaultIds: string[]) => {
    try {
      const response = await chartApi.getChartDataOfMultipleVaults(vaultIds);
      // Transform the API response to match our expected format
      const vaultDataArray = response.data.data || [];
      const transformedData = vaultDataArray.map((vaultData) => ({
        vaultId: vaultData.vaultId,
        data: vaultData.series || [],
      }));

      return transformedData;
    } catch (error) {
      console.error(
        `Failed to fetch chart data for vaults ${vaultIds.join(", ")}:`,
        error
      );
      return vaultIds.map((vaultId) => ({ vaultId, data: [] }));
    }
  }
);

const chartSlice = createSlice({
  name: "chart",
  initialState,
  reducers: {
    setVaultChartData: (
      state,
      action: PayloadAction<{ vaultId: string; data: VaultChartPoint[] }>
    ) => {
      state.vaultChartData[action.payload.vaultId] = action.payload.data;
    },
    setMultipleVaultChartData: (
      state,
      action: PayloadAction<Record<string, VaultChartPoint[]>>
    ) => {
      state.vaultChartData = { ...state.vaultChartData, ...action.payload };
    },
    clearVaultChartData: (state, action: PayloadAction<string>) => {
      delete state.vaultChartData[action.payload];
    },
    clearAllChartData: (state) => {
      state.vaultChartData = {};
    },
    clearError: (state) => {
      state.error = null;
    },
    setLoadingVault: (
      state,
      action: PayloadAction<{ vaultId: string; isLoading: boolean }>
    ) => {
      const { vaultId, isLoading } = action.payload;
      if (isLoading) {
        if (!state.loadingVaults.includes(vaultId)) {
          state.loadingVaults.push(vaultId);
        }
      } else {
        state.loadingVaults = state.loadingVaults.filter(
          (id) => id !== vaultId
        );
      }
    },
  },
  extraReducers: (builder) => {
    // Fetch Multiple Vault Chart Data
    builder
      .addCase(fetchMultipleVaultChartData.pending, (state, action) => {
        const vaultIds = action.meta.arg;
        state.loadingVaults = [
          ...new Set([...state.loadingVaults, ...vaultIds]),
        ];
        state.error = null;
      })
      .addCase(fetchMultipleVaultChartData.fulfilled, (state, action) => {
        action.payload.forEach(({ vaultId, data }) => {
          state.vaultChartData[vaultId] = data;
        });
        const loadedVaultIds = action.payload.map(({ vaultId }) => vaultId);
        state.loadingVaults = state.loadingVaults.filter(
          (id) => !loadedVaultIds.includes(id)
        );
      })
      .addCase(fetchMultipleVaultChartData.rejected, (state, action) => {
        const vaultIds = action.meta.arg;
        state.loadingVaults = state.loadingVaults.filter(
          (id) => !vaultIds.includes(id)
        );
        state.error = action.error.message || "Failed to fetch chart data";
      });
  },
});

export const {
  setVaultChartData,
  setMultipleVaultChartData,
  clearVaultChartData,
  clearAllChartData,
  clearError,
  setLoadingVault,
} = chartSlice.actions;

export default chartSlice.reducer;
