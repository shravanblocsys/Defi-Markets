import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { User } from '@/types/store';
import { authApi } from '@/services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  solanaAuth: {
    nonce: string | null;
    message: string | null;
    signature: string | null;
    address: string | null;
  };
}

const initialState: AuthState = {
  user: null,
  token: sessionStorage.getItem('authToken'),
  isAuthenticated: !!sessionStorage.getItem('authToken'),
  isLoading: false,
  error: null,
  solanaAuth: {
    nonce: null,
    message: null,
    signature: null,
    address: null,
  },
};

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async ({ address, signature }: { address: string; signature: string }) => {
    const response = await authApi.login(address, signature);
    return response.data;
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with logout even if API call fails
    }
    return null;
  }
);

export const getProfile = createAsyncThunk(
  'auth/verify',
  async () => { 
    const response = await authApi.getProfile();
    console.log("getProfile response", response.data)
    return response.data;
  }
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (data: Partial<User>) => {
    const response = await authApi.updateProfile(data);
    return response.data;
  }
);

export const adminLogin = createAsyncThunk(
  'auth/adminLogin',
  async (data: { username: string; password: string }) => {
    const response = await authApi.adminLogin(data.username, data.password);
    return response.data;
  }
);

export const adminVerify = createAsyncThunk(
  'auth/adminVerify',
  async () => {
    const response = await authApi.adminVerify();
    return response.data;
  }
);


const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
      state.isAuthenticated = true;
      sessionStorage.setItem('authToken', action.payload);
      sessionStorage.setItem('token', action.payload);
    },
    clearAuth: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      // Clear all storage
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('token');
      localStorage.removeItem('authToken');
      state.solanaAuth = {
        nonce: null,
        message: null,
        signature: null,
        address: null,
      };
    },
    // Solana auth flow actions
    setNonce: (state, action: PayloadAction<{ nonce: string; address: string }>) => {
      state.solanaAuth.nonce = action.payload.nonce;
      state.solanaAuth.address = action.payload.address;
    },
    setMessage: (state, action: PayloadAction<string>) => {
      state.solanaAuth.message = action.payload;
    },
    setSignature: (state, action: PayloadAction<string>) => {
      state.solanaAuth.signature = action.payload;
    },
    clearSolanaAuth: (state) => {
      state.solanaAuth = {
        nonce: null,
        message: null,
        signature: null,
        address: null,
      };
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        sessionStorage.setItem('authToken', action.payload.token);
        sessionStorage.setItem('token', action.payload.token);
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Login failed';
      });

    // Logout
    builder
      .addCase(logout.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logout.fulfilled, (state) => {
        state.isLoading = false;
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        // Clear all storage
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('token');
        localStorage.removeItem('authToken');
        state.solanaAuth = {
          nonce: null,
          message: null,
          signature: null,
          address: null,
        };
      })
      .addCase(logout.rejected, (state) => {
        state.isLoading = false;
        // Still clear auth even if logout API fails
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('token');
        localStorage.removeItem('authToken');
        state.solanaAuth = {
          nonce: null,
          message: null,
          signature: null,
          address: null,
        };
      });

    // Get Profile
    builder
      .addCase(getProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
      })
      .addCase(getProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to get profile';
        // If profile fetch fails, user might not be authenticated
        if (action.error.message?.includes('401')) {
          state.user = null;
          state.token = null;
          state.isAuthenticated = false;
          sessionStorage.removeItem('authToken');
          sessionStorage.removeItem('token');
          localStorage.removeItem('authToken');
        }
      });

    // Update Profile
    builder
      .addCase(updateProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to update profile';
      });

    // Admin Login
    builder
      .addCase(adminLogin.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(adminLogin.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        sessionStorage.setItem('authToken', action.payload.token);
        sessionStorage.setItem('token', action.payload.token);
      })
      .addCase(adminLogin.rejected, (state, action) => {
        state.isLoading = false;
        // Handle ApiError objects properly
        if (action.error.message) {
          state.error = action.error.message;
        } else if (typeof action.payload === 'string') {
          state.error = action.payload;
        } else {
          state.error = 'Admin login failed';
        }
      });

    // Admin Verify
    builder
      .addCase(adminVerify.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(adminVerify.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(adminVerify.rejected, (state, action) => {
        state.isLoading = false;
        // Handle ApiError objects properly
        if (action.error.message) {
          state.error = action.error.message;
        } else if (typeof action.payload === 'string') {
          state.error = action.payload;
        } else {
          state.error = 'Failed to verify admin token';
        }
        
        // If admin verification fails, user might not be authenticated
        if (action.error.message?.includes('401') || action.error.message?.includes('Unauthorized')) {
          state.user = null;
          state.token = null;
          state.isAuthenticated = false;
          sessionStorage.removeItem('authToken');
          sessionStorage.removeItem('token');
          localStorage.removeItem('authToken');
        }
      });
  },
});

export const { 
  clearError, 
  setToken, 
  clearAuth,
  setNonce,
  setMessage,
  setSignature,
  clearSolanaAuth
} = authSlice.actions;
export default authSlice.reducer;
