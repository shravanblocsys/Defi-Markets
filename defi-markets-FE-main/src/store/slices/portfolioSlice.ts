import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Portfolio, Transaction } from '@/types/store';
import { portfolioApi } from '@/services/api';

interface PortfolioState {
  portfolio: Portfolio | null;
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const initialState: PortfolioState = {
  portfolio: null,
  transactions: [],
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  },
};

// Async thunks
export const fetchPortfolio = createAsyncThunk(
  'portfolio/fetchPortfolio',
  async () => {
    const response = await portfolioApi.getPortfolio();
    return response.data;
  }
);

export const fetchTransactions = createAsyncThunk(
  'portfolio/fetchTransactions',
  async (params?: { page?: number; limit?: number; type?: string }) => {
    const response = await portfolioApi.getTransactions(params);
    return response.data;
  }
);

export const fetchTransaction = createAsyncThunk(
  'portfolio/fetchTransaction',
  async (id: string) => {
    const response = await portfolioApi.getTransaction(id);
    return response.data;
  }
);

const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.pagination.page = action.payload;
    },
    addTransaction: (state, action: PayloadAction<Transaction>) => {
      state.transactions.unshift(action.payload);
      // Update portfolio totals if needed
      if (state.portfolio) {
        // You might want to update portfolio totals based on transaction type
        // This is a simplified example
        if (action.payload.type === 'deposit') {
          state.portfolio.totalValue += action.payload.amount;
        } else if (action.payload.type === 'withdraw') {
          state.portfolio.totalValue -= action.payload.amount;
        }
      }
    },
    updateTransaction: (state, action: PayloadAction<{ id: string; updates: Partial<Transaction> }>) => {
      const index = state.transactions.findIndex(tx => tx.id === action.payload.id);
      if (index !== -1) {
        state.transactions[index] = { ...state.transactions[index], ...action.payload.updates };
      }
    },
    clearPortfolio: (state) => {
      state.portfolio = null;
      state.transactions = [];
      state.pagination = initialState.pagination;
    },
  },
  extraReducers: (builder) => {
    // Fetch Portfolio
    builder
      .addCase(fetchPortfolio.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchPortfolio.fulfilled, (state, action) => {
        state.isLoading = false;
        state.portfolio = action.payload;
      })
      .addCase(fetchPortfolio.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch portfolio';
      });

    // Fetch Transactions
    builder
      .addCase(fetchTransactions.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.isLoading = false;
        state.transactions = action.payload.data;
        state.pagination = {
          page: action.payload.page,
          limit: action.payload.limit,
          total: action.payload.total,
          totalPages: action.payload.totalPages,
        };
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch transactions';
      });

    // Fetch Transaction
    builder
      .addCase(fetchTransaction.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchTransaction.fulfilled, (state, action) => {
        state.isLoading = false;
        // Update the transaction in the list if it exists
        const index = state.transactions.findIndex(tx => tx.id === action.payload.id);
        if (index !== -1) {
          state.transactions[index] = action.payload;
        } else {
          state.transactions.unshift(action.payload);
        }
      })
      .addCase(fetchTransaction.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch transaction';
      });
  },
});

export const {
  clearError,
  setPage,
  addTransaction,
  updateTransaction,
  clearPortfolio,
} = portfolioSlice.actions;

export default portfolioSlice.reducer;
