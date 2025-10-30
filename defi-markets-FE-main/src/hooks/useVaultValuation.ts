import { useState, useEffect } from "react";
import VaultDataService from "@/services/vaultDataService";
import { useContract, useVaultCreation } from "./useContract";

interface VaultValuationData {
  gav: number; // in USD
  nav: number; // in USD
  gavPerToken: number; // in USD
  navPerToken: number; // in USD
  loading: boolean;
  error: string | null;
}

export const useVaultValuation = (vaultIndex: number | undefined) => {
  const [data, setData] = useState<VaultValuationData>({
    gav: 0,
    nav: 0,
    gavPerToken: 0,
    navPerToken: 0,
    loading: false,
    error: null,
  });

  const { connection } = useContract();
  const { program } = useVaultCreation();

  const fetchValuation = async () => {
    if (!vaultIndex || !connection || !program) {
      return;
    }

    setData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const vaultDataService = new VaultDataService(connection, program);
      const valuation = await vaultDataService.getFormattedVaultValuation(
        vaultIndex
      );

      // console.log("valuation", valuation);

      setData({
        gav: valuation.gav,
        nav: valuation.nav,
        gavPerToken: valuation.gavPerToken,
        navPerToken: valuation.navPerToken,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error("Error fetching vault valuation:", error);
      setData((prev) => ({
        ...prev,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch vault valuation",
      }));
    }
  };

  useEffect(() => {
    if (vaultIndex && connection && program) {
      fetchValuation();
    }
  }, [vaultIndex, connection, program]);

  return {
    ...data,
    refetch: fetchValuation,
  };
};
