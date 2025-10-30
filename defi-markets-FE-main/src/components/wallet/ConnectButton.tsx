import { useSolanaAuth } from "@/hooks/useSolanaAuth";
import { useAppKitDisconnect } from "@/hooks/useAppKitDisconnect";
import "./wallet.css";
import { useAppKitConnection } from "@reown/appkit-adapter-solana/react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import { getProfile } from "@/store/slices/authSlice";
import { useToast } from "@/hooks/use-toast";

export function ConnectButton({ className }: { className?: string }) {
  const { connection } = useAppKitConnection();
  const { isConnected, address } = useAppKitAccount();

  const { authenticateWithSolana, logout } = useSolanaAuth();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  const login = async () => {
    if (address && !isAuthenticated) {
      try {
        // First authenticate with Solana
        const authResult = await authenticateWithSolana(address);
  

        if (authResult.success) {
          // Then get user profile
          try {
            await dispatch(getProfile()).unwrap();
            toast({
              title: "Success",
              description: "Successfully connected and authenticated!",
            });
            return {
              success: true,
            };
          } catch (profileError) {
            console.error("Failed to fetch profile:", profileError);
            toast({
              variant: "destructive",
              title: "Profile Error",
              description: "Authentication successful but failed to load profile. Please try again.",
            });
            return {
              success: false,
              error: "Failed to fetch profile",
            };
          }
        } else {
          // Authentication failed - toast is already shown in useSolanaAuth
          return authResult;
        }
      } catch (err) {
        console.error("Authentication error:", err);
        await logout();
        const errorMessage = err instanceof Error ? err.message : "Authentication failed";
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: errorMessage,
        });
        return {
          success: false,
          error: errorMessage,
        };
      }
    } else if (isAuthenticated) {
      // console.log("User is already authenticated, skipping login");
      return {
        success: true,
        message: "Already authenticated",
      };
    } else {
      toast({
        variant: "destructive",
        title: "Wallet Required",
        description: "Please connect your wallet first to authenticate.",
      });
      return {
        success: false,
        error: "No wallet address available",
      };
    }
  };

  // Handle disconnect from AppKit
  const handleDisconnect = async () => {
    try {
      // console.log("Disconnecting wallet...");
      
      // Clear session storage
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('phantom.contentScript.providerInjection');
      
      // Clear any other auth-related session storage
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.forEach(key => {
        if (key.includes('auth') || key.includes('token') || key.includes('phantom')) {
          sessionStorage.removeItem(key);
        }
      });
      
      // console.log("Session storage cleared");
      
      await logout();
      // console.log("Wallet disconnected successfully");
      toast({
        title: "Disconnected",
        description: "Wallet disconnected successfully",
      });
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
      toast({
        variant: "destructive",
        title: "Disconnect Error",
        description: "Failed to disconnect wallet properly",
      });
    }
  };

  // Use the disconnect hook
  useAppKitDisconnect(handleDisconnect);

  // Listen for connection changes
  useEffect(() => {
    if (address && isConnected && !isAuthenticated) {
      login();
    }
  }, [address, isConnected, isAuthenticated]);

  return (
    <div className={`appkit-button-wrapper ${className}`}>
      <appkit-button />
    </div>
  );
}
