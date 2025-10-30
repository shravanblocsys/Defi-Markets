import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminVaults from "./pages/admin/AdminVaults";
import AuditLogs from "./pages/admin/AuditLogs";
import Fees from "./pages/admin/Fees";
import ManagementFeesAccrued from "./pages/admin/ManagementFeesAccrued";
import Dashboard from "./pages/admin/Dashboard";
import Login from "./pages/admin/Login";
// import Wallets from "./pages/admin/Wallets";
import AdminAssets from "./pages/admin/AdminAssets";
import AdminLayout from "./components/admin/AdminLayout";
import Auth from "./components/auth/Auth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div className="dark min-h-screen bg-background text-foreground">
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <main>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Login />} />
              
              {/* Protected Admin Routes */}
              <Route path="/admin" element={<Auth><AdminLayout /></Auth>}>
                <Route index element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="fees" element={<Fees />} />
                <Route path="management-fees-accrued" element={<ManagementFeesAccrued />} />
                {/* <Route path="wallets" element={<Wallets />} /> */}
                <Route path="vaults" element={<AdminVaults />} />
                <Route path="audit-logs" element={<AuditLogs />} />
                <Route path="assets" element={<AdminAssets />} />
              </Route>
            </Routes>
          </main>
        </BrowserRouter>
      </div>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
