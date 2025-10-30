import React, { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, 
  DollarSign, 
  Wallet, 
  Vault, 
  FileText, 
  LogOut, 
  Menu, 
  X,
  Moon,
  Sun,
  Shield,
  Bitcoin,
} from "lucide-react";
import { ConnectButton } from "../wallet/ConnectButton";

const AdminLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const location = useLocation();

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/assets", label: "Assets", icon: Bitcoin },
    { href: "/admin/fees", label: "Fees", icon: DollarSign, adminOnly: true },
    { href: "/admin/management-fees-accrued", label: "Management Fees Accrued", icon: DollarSign },
    // { href: "/admin/wallets", label: "Wallets", icon: Wallet },
    { href: "/admin/vaults", label: "Vaults", icon: Vault },
    { href: "/admin/audit-logs", label: "Audit Logs", icon: FileText },
  ];

  const isActivePath = (path: string) => location.pathname === path;

  const handleLogout = () => {
    // Mock logout - replace with actual implementation
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('authToken');
    localStorage.removeItem('authToken');
    window.location.href = "/";
  };

  return (
    <div className={`min-h-screen bg-background ${isDarkMode ? 'dark' : ''}`}>
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border-subtle bg-surface-1/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">DeFiMarkets Admin</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDarkMode(!isDarkMode)}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button> */}
            
            {/* <Badge variant="secondary" className="hidden sm:flex">
              Admin
            </Badge> */}

          <ConnectButton/>
            
            <Button
              variant="glass"
              size="sm"
              onClick={handleLogout}
              className="text-destructive hover:text-destructive"
            >
              <LogOut className="h-4 w-4 text-white" />
              <span className="hidden text-white sm:inline ml-2">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 
          transform border-r border-border-subtle bg-surface-1/50 backdrop-blur-sm
          transition-transform duration-200 ease-in-out
          lg:relative lg:top-0 lg:translate-x-0 lg:h-[calc(100vh-4rem)]
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <nav className="h-full p-4">
            <div className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={`
                      flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
                      transition-colors hover:bg-surface-2/50
                      ${isActivePath(item.href) 
                        ? 'bg-primary/10 text-primary border border-primary/20' 
                        : 'text-muted-foreground hover:text-foreground'
                      }
                    `}
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {item.adminOnly && (
                      <Badge variant="outline" className="ml-auto text-xs">
                        Admin
                      </Badge>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:ml-0">
          <div className="container py-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default AdminLayout;