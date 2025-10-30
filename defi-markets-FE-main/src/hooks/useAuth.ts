import { useAppSelector, useAppDispatch } from '@/store';
import { login, logout, getProfile, updateProfile, clearError } from '@/store/slices/authSlice';

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
    } catch (error) {
      return { success: false, error: error as string };
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
