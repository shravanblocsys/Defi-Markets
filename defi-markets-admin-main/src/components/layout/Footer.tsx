import { Link } from "react-router-dom";
import { TrendingUp, Twitter, Github, MessageCircle } from "lucide-react";

const Footer = () => {
  return (
    <footer className="glass-surface border-t border-border-subtle mt-24">
      <div className="container mx-auto px-4 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-gradient-primary">
                <TrendingUp className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">DeFiMarkets</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              Permissionless DeFi platform for vault creation, portfolio management, and seamless asset redemption.
            </p>
          </div>

          {/* Platform */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Platform</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/vaults" className="text-muted-foreground hover:text-primary transition-colors">
                  Browse Vaults
                </Link>
              </li>
              <li>
                <Link to="/create-vault" className="text-muted-foreground hover:text-primary transition-colors">
                  Create Vault
                </Link>
              </li>
              <li>
                <Link to="/portfolio" className="text-muted-foreground hover:text-primary transition-colors">
                  Portfolio
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors">
                  About
                </Link>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                  Security
                </a>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Community</h3>
            <div className="flex space-x-3">
              <a
                href="#"
                className="p-2 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="p-2 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="p-2 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors"
              >
                <Github className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border-subtle">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-sm text-muted-foreground">
              © 2024 DeFiMarkets. All rights reserved.
            </p>
            <div className="flex space-x-6 text-sm">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                Terms
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                Privacy
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                Cookies
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;