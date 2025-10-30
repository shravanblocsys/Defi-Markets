import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Wallet, Transaction } from '@/types/store';
import { walletApi } from '@/services/api';

interface WalletState {
  wallet: Wallet | null;
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  isConnecting: boolean;
}

const initialState: WalletState = {
  wallet: null,
  transactions: [],
  isLoading: false,
  error: null,
  isConnecting: false,
};

// Async thunks
export const connectWallet = createAsyncThunk(
  'wallet/connect',
  async (address: string) => {
    const response = await walletApi.getBalance(address);
    return {
      address,
      balance: response.data.balance,
      network: response.data.network,
      isConnected: true,
    };
  }
);

export const fetchBalance = createAsyncThunk(
  'wallet/fetchBalance',
  async (address: string) => {
    const response = await walletApi.getBalance(address);
    return {
      address,
      balance: response.data.balance,
      network: response.data.network,
    };
  }
);

export const fetchTransactionHistory = createAsyncThunk(
  'wallet/fetchTransactionHistory',
  async ({ address, params }: { address: string; params?: { page?: number; limit?: number } }) => {
    const response = await walletApi.getTransactionHistory(address, params);
    return response.data;
  }
);

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    setWallet: (state, action: PayloadAction<Wallet>) => {
      state.wallet = action.payload;
    },
    updateBalance: (state, action: PayloadAction<number>) => {
      if (state.wallet) {
        state.wallet.balance = action.payload;
      }
    },
    disconnectWallet: (state) => {
      state.wallet = null;
      state.transactions = [];
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setConnecting: (state, action: PayloadAction<boolean>) => {
      state.isConnecting = action.payload;
    },
    addTransaction: (state, action: PayloadAction<Transaction>) => {
      state.transactions.unshift(action.payload);
    },
    updateTransaction: (state, action: PayloadAction<{ id: string; updates: Partial<Transaction> }>) => {
      const index = state.transactions.findIndex(tx => tx.id === action.payload.id);
      if (index !== -1) {
        state.transactions[index] = { ...state.transactions[index], ...action.payload.updates };
      }
    },
  },
  extraReducers: (builder) => {
    // Connect Wallet
    builder
      .addCase(connectWallet.pending, (state) => {
        state.isConnecting = true;
        state.error = null;
      })
      .addCase(connectWallet.fulfilled, (state, action) => {
        state.isConnecting = false;
        state.wallet = action.payload;
      })
      .addCase(connectWallet.rejected, (state, action) => {
        state.isConnecting = false;
        state.error = action.error.message || 'Failed to connect wallet';
      });

    // Fetch Balance
    builder
      .addCase(fetchBalance.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchBalance.fulfilled, (state, action) => {
        state.isLoading = false;
        if (state.wallet) {
          state.wallet.balance = action.payload.balance;
          state.wallet.network = action.payload.network;
        }
      })
      .addCase(fetchBalance.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch balance';
      });

    // Fetch Transaction History
    builder
      .addCase(fetchTransactionHistory.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchTransactionHistory.fulfilled, (state, action) => {
        state.isLoading = false;
        state.transactions = action.payload.data;
      })
      .addCase(fetchTransactionHistory.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch transaction history';
      });
  },
});

export const {
  setWallet,
  updateBalance,
  disconnectWallet,
  clearError,
  setConnecting,
  addTransaction,
  updateTransaction,
} = walletSlice.actions;

export default walletSlice.reducer;
