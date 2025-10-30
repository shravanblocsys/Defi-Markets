import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana, solanaTestnet, solanaDevnet } from "@reown/appkit/networks";

// 0. Set up Solana Adapter
const solanaWeb3JsAdapter = new SolanaAdapter();

// 1. Get projectId from https://dashboard.reown.com (prefer env for environment-specific configs)
const projectId =
  (import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined) ||
  "860b2f6aefd1ca9efd400e1074b67b4d";
if (!import.meta.env.VITE_REOWN_PROJECT_ID) {
  console.warn(
    "VITE_REOWN_PROJECT_ID is not set; using default projectId. Configure environment variables for production."
  );
}

// 2. Create a metadata object - optional
const metadata = {
  name: "AppKit",
  description: "AppKit Solana Example",
  url: "https://example.com", // origin must match your domain & subdomain
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

// 3. Create modal
createAppKit({
  adapters: [solanaWeb3JsAdapter],
  networks: [solana],
  // networks: [solana, solanaTestnet, solanaDevnet],
  metadata: metadata,
  projectId,
  features: {
    socials: false,
    email: false,
    allWallets: false,
  },
  defaultNetwork: solana,
  // Additional options to ensure Solana-only experience
  showWallets: true, // Show wallet options (but only Solana ones due to adapter)
  allowUnsupportedChain: false, // Don't allow switching to unsupported chains
});

export { solanaWeb3JsAdapter };
