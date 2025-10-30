import { useAppSelector, useAppDispatch } from '@/store';
import {
  fetchVaults,
  fetchVaultById,
  createVault,
  updateVault,
  deleteVault,
  depositToVault,
  withdrawFromVault,
  setSelectedVault,
  setFilters,
  setPage,
  clearError,
} from '@/store/slices/vaultsSlice';

export const useVaults = () => {
  const dispatch = useAppDispatch();
  const {
    vaults,
    selectedVault,
    isLoading,
    error,
    pagination,
    filters,
  } = useAppSelector((state) => state.vaults);

  const handleFetchVaults = async (params?: { page?: number; limit?: number; search?: string }) => {
    try {
      await dispatch(fetchVaults(params)).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleFetchVaultById = async (id: string) => {
    try {
      await dispatch(fetchVaultById(id)).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleCreateVault = async (vaultData: any) => {
    try {
      await dispatch(createVault(vaultData)).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleUpdateVault = async (id: string, vaultData: any) => {
    try {
      await dispatch(updateVault({ id, vaultData })).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleDeleteVault = async (id: string) => {
    try {
      await dispatch(deleteVault(id)).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleDepositToVault = async (vaultId: string, amount: number) => {
    try {
      await dispatch(depositToVault({ vaultId, amount })).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleWithdrawFromVault = async (vaultId: string, amount: number) => {
    try {
      await dispatch(withdrawFromVault({ vaultId, amount })).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error: error as string };
    }
  };

  const handleSetSelectedVault = (vault: any) => {
    dispatch(setSelectedVault(vault));
  };

  const handleSetFilters = (newFilters: any) => {
    dispatch(setFilters(newFilters));
  };

  const handleSetPage = (page: number) => {
    dispatch(setPage(page));
  };

  const handleClearError = () => {
    dispatch(clearError());
  };

  return {
    vaults,
    selectedVault,
    isLoading,
    error,
    pagination,
    filters,
    fetchVaults: handleFetchVaults,
    fetchVaultById: handleFetchVaultById,
    createVault: handleCreateVault,
    updateVault: handleUpdateVault,
    deleteVault: handleDeleteVault,
    depositToVault: handleDepositToVault,
    withdrawFromVault: handleWithdrawFromVault,
    setSelectedVault: handleSetSelectedVault,
    setFilters: handleSetFilters,
    setPage: handleSetPage,
    clearError: handleClearError,
  };
};
