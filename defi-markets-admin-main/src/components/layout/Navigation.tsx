import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectButton } from "../wallet/ConnectButton";
import { useAuth } from "@/hooks/useAuth";

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  // console.log("user",user.user.avatar);

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/assets", label: "Assets" },
    { href: "/vaults", label: "Vaults" },
    { href: "/create-vault", label: "Create Vault" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/about", label: "About" },
  ];

  const isActive = (href: string) => location.pathname === href;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-surface border-b border-border-subtle">
      <nav className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="p-2 rounded-lg bg-gradient-primary">
              <TrendingUp className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-glow transition-all duration-normal group-hover:text-primary">
              DeFiMarkets
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "relative px-4 py-2 text-sm font-medium transition-all duration-normal",
                  "hover:text-primary",
                  isActive(item.href) ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
                {isActive(item.href) && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-primary rounded-full" />
                )}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center space-x-4">
      
            <ConnectButton />

            {isAuthenticated ? (
              <div className="w-10 h-10 rounded-full">
                <img
                  src={user?.avatar}
                  alt={user?.username}
                  className="w-full h-full rounded-full"
                />
              </div>
            ) : (
              <Button variant="hero" size="sm">
                Get Started
              </Button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "block px-3 py-2 text-base font-medium rounded-lg transition-all duration-normal",
                    isActive(item.href)
                      ? "bg-surface-2 text-primary"
                      : "text-muted-foreground hover:text-primary hover:bg-surface-1"
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <div className="pt-4 space-y-2">
                <Button variant="ghost" className="w-full justify-start">
                  Connect Wallet
                </Button>
                <Button variant="hero" className="w-full">
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Navigation;
