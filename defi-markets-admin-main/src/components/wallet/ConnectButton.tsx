import { useSolanaAuth } from "@/hooks/useSolanaAuth";
import { useAppKitDisconnect } from "@/hooks/useAppKitDisconnect";
import "./wallet.css";
import { useAppKitConnection } from "@reown/appkit-adapter-solana/react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import { getProfile } from "@/store/slices/authSlice";

export function ConnectButton() {
  const { connection } = useAppKitConnection();
  const { isConnected, address } = useAppKitAccount();
  const { authenticateWithSolana, logout } = useSolanaAuth();
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  const login = async () => {
    console.log("login Success");
  };

  // Handle disconnect from AppKit
  const handleDisconnect = async () => {
    console.log("Wallet disconnected, calling logout");
    await logout();
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
    <div className="appkit-button-wrapper">
      <appkit-button size="sm" />
    </div>
  );
}
