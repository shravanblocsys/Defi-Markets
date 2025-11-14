import { useAppSelector, useAppDispatch } from "@/store";
import {
  login,
  logout,
  getProfile,
  updateProfile,
  clearError,
} from "@/store/slices/authSlice";

export const useAuth = () => {
  const dispatch = useAppDispatch();
  const { user, token, isAuthenticated, isLoading, error } = useAppSelector(
    (state) => state.auth
  );

  const handleLogin = async (address: string, signature: string) => {
    try {
      await dispatch(login({ address, signature })).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleLogout = async () => {
    try {
      await dispatch(logout()).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleGetProfile = async () => {
    try {
      await dispatch(getProfile()).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleUpdateProfile = async (data: Partial<typeof user>) => {
    try {
      await dispatch(updateProfile(data)).unwrap();
      return { success: true };
    } catch (error: any) {
      // Extract error message from various error formats
      // Prioritize originalMessage from ApiError to preserve array format
      let errorMessage: string | string[] = "Failed to update profile";

      // Check if it's an ApiError with originalMessage (array format)
      if (error?.originalMessage) {
        errorMessage = error.originalMessage;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error?.message) {
        // Check if message is already an array (shouldn't happen but handle it)
        errorMessage = Array.isArray(error.message)
          ? error.message
          : error.message;
      } else if (error?.error) {
        errorMessage = error.error;
      } else if (Array.isArray(error)) {
        errorMessage = error;
      }

      // Return as array if it's an array, otherwise as string
      // The component will handle the formatting
      return { success: false, error: errorMessage };
    }
  };

  const handleClearError = () => {
    dispatch(clearError());
  };

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    login: handleLogin,
    logout: handleLogout,
    getProfile: handleGetProfile,
    updateProfile: handleUpdateProfile,
    clearError: handleClearError,
  };
};
