import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import { clearAuth, setToken } from "@/store/slices/authSlice";
import { authApi } from "@/services/api";
import { useToast } from "./use-toast";
import { useAppKitProvider } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import bs58 from "bs58";

// Helper function to format message for signing (matches backend format)
const formatMessageForSigning = (message: any, address: string): string => {
  const lines: string[] = [];
  if (message.domain) {
    lines.push(`${message.domain} wants you to sign in with your web3 wallet:`);
  } else {
    lines.push("Sign in with your web3 wallet:");
  }
  lines.push(address);
  lines.push("");
  if (message.statement) {
    lines.push(message.statement);
    lines.push("");
  }
  if (message.uri) lines.push(`URI: ${message.uri}`);
  if (message.version) lines.push(`Version: ${message.version}`);
  if (message.chainId) lines.push(`Chain ID: ${message.chainId}`);
  if (message.nonce) lines.push(`Nonce: ${message.nonce}`);
  if (message.issuedAt) lines.push(`Issued At: ${message.issuedAt}`);
  if (message.expirationTime)
    lines.push(`Expiration Time: ${message.expirationTime}`);
  return lines.join("\n");
};

export const useSolanaAuth = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { walletProvider } = useAppKitProvider<Provider>("solana");

  // 4-step Solana authentication flow
  const authenticateWithSolana = async (address: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Get nonce from server
      const nonceResponse = await authApi.getNonce(address);
      const { nonce } = nonceResponse.data;

      // Step 2: Create SIWS message using the nonce
      const statement = "Sign in to access the DeFi Markets platform";
      const uri = "https://defi-markets.com";
      const version = "1";
      const chainId = "solana:mainnet";
      const domain = "defi-markets.com";
      const messageResponse = await authApi.createMessage(
        domain,
        address,
        statement,
        uri,
        version,
        chainId,
        nonce
      );


      const { message } = messageResponse.data;

      // Step 3: Format the message into the signing string that the backend expects
      const signingString = formatMessageForSigning(message, address);
      // Encode the formatted message for signing
      const encodedMessage = new TextEncoder().encode(signingString);

      // Raise the modal
      const sig = await walletProvider.signMessage(encodedMessage);
      // Print the signed message in hexadecimal format

      // Step 4: Convert signature to base58 string (standard Solana format)
      const signatureString = bs58.encode(sig);

      const verifyResponse = await authApi.verifySignature(
        message,
        signatureString,
        chainId
      );

      const token = verifyResponse.data.session.token;

      // Store token in Redux and localStorage
      dispatch(setToken(token));
      sessionStorage.setItem("token", token);



      setIsLoading(false);


      return { success: true, token };
    } catch (err) {
      setIsLoading(false);
      const errorMessage =
        err instanceof Error ? err.message : "Authentication failed";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Authentication failed",
        description: errorMessage,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const logout = async () => {
    try {
      // Call logout API

      await authApi.logout();
    } catch (error) {
      console.error("Logout API error:", error);
    } finally {
      // Clear all auth data regardless of API call success

      // Clear sessionStorage
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("authToken");

      // Clear localStorage for compatibility
      localStorage.removeItem("authToken");

      // Clear Redux state
      dispatch(clearAuth());
    }
  };

  const clearError = () => {
    setError(null);
  };

  return {
    authenticateWithSolana,
    logout,
    isLoading,
    error,
    clearError,
  };
};
