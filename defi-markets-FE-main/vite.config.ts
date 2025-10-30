import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://0.0.0.0:3400",
        changeOrigin: true,
        secure: false,
      },
    },
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "5c269e365d6e.ngrok-free.app",
      ".ngrok-free.app", // Allow all ngrok subdomains
      ".ngrok.io", // Allow legacy ngrok domains
    ],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(
    Boolean
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer"],
  },
}));
