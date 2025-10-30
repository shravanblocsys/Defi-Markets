import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectButton } from "../wallet/ConnectButton";
import { useAuth } from "@/hooks/useAuth";
import SettingsPopup from "@/components/ui/SettingsPopup";
import logo from "@/assets/logo.png";

// Following is the fallback of avatar which is shown when there is no user avatar or the user avatar does not give valid outp
const UserAvatar = ({
  user,
  className,
}: {
  user: { avatar?: string; name?: string } | null;
  className?: string;
}) => {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  if (imageError || !user?.avatar) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gray-600",
          className
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M19 21V19C19 17.9391 18.5786 16.9217 17.8284 16.1716C17.0783 15.4214 16.0609 15 15 15H9C7.93913 15 6.92172 15.4214 6.17157 16.1716C5.42143 16.9217 5 17.9391 5 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={user.avatar}
      alt={user.name || "User"}
      className="w-full h-full object-cover"
      onError={handleImageError}
    />
  );
};

const Navigation = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState(false);
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useMotionValueEvent(scrollY, "change", (latest) => {
    // Disable scroll animations on mobile
    if (isMobile) return;

    if (latest > 20) {
      setScrolled(true);
    } else {
      setScrolled(false);
    }
  });

  const navItems = [
    { href: "/", label: "VAULTS" },
    { href: "/create-vault", label: "CREATE VAULT" },
    { href: "/portfolio", label: "PORTFOLIO" },
  ];

  const isActive = (href: string) => location.pathname === href;

  return (
    <motion.nav
      animate={
        isMobile
          ? {
              backdropFilter: scrolled ? "blur(20px)" : "blur(8px)",
            }
          : {
              backdropFilter: scrolled ? "blur(20px)" : "blur(8px)",
              boxShadow: scrolled
                ? "rgba(0, 0, 0, 0.3) 0px 8px 32px 0px, rgba(255, 255, 255, 0.1) 0px 0px 0px 1px"
                : "rgba(0, 0, 0, 0.1) 0px 1px 3px 0px",
              width: scrolled ? "70%" : "100%",
              y: scrolled ? 20 : 0,
              borderRadius: scrolled ? "24px" : "0px",
              backgroundColor: scrolled
                ? "rgba(0, 0, 0, 0.4)"
                : "rgba(0, 0, 0, 0.2)",
            }
      }
      transition={
        isMobile
          ? {}
          : {
              type: "spring",
              stiffness: 200,
              damping: 50,
            }
      }
      style={{
        minWidth: "300px",
      }}
      className="fixed inset-x-0 top-0 z-50 mx-auto flex h-16 sm:h-18 lg:h-20 items-center justify-between border-b border-white/10"
    >
      <div className="container mx-auto relative">
        <div className="flex items-center justify-between w-full sm:px-6 lg:px-8">
          {/* Logo */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{ willChange: "transform" }}
          >
            <Link to="/" className="flex items-center group">
              <img
                src={logo}
                alt="DFM Logo"
                className="w-24 h-8 sm:w-28 sm:h-10 lg:w-32 lg:h-12"
              />
            </Link>
          </motion.div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-8 xl:space-x-12">
            {navItems.map((item, index) => (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
              >
                <Link
                  to={item.href}
                  className={cn(
                    "relative px-3 xl:px-4 py-2 text-xs xl:text-sm font-medium font-architekt tracking-wider block rounded-full",
                    isActive(item.href)
                      ? "bg-white/20 text-white"
                      : "text-foreground hover:text-white hover:bg-white/5"
                  )}
                  onMouseEnter={() => !isMobile && setHovered(index)}
                  onMouseLeave={() => !isMobile && setHovered(null)}
                >
                  {hovered === index && (
                    <motion.span
                      layoutId="hovered-span"
                      className="absolute inset-0 h-full w-full rounded-md bg-white/10"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className={cn("relative z-10")}>{item.label}</span>
                  {/* underline removed; active uses background */}
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center space-x-3 xl:space-x-4 font-mono">
            <ConnectButton />

            {isAuthenticated && user && (
              <div
                className="w-8 h-8 xl:w-10 xl:h-10 rounded-full border-2 border-accent overflow-hidden cursor-pointer hover:border-accent/80 transition-colors"
                onClick={() => setShowSettings(true)}
                title="Open profile settings"
              >
                <UserAvatar
                  user={user}
                  className="w-full h-full rounded-full"
                />
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden text-foreground hover:text-white p-2"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? (
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            ) : (
              <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
            )}
          </Button>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              className="absolute top-full left-0 right-0 lg:hidden backdrop-blur-xl bg-black/60 border-t border-white/10 z-40"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <div className="px-4 sm:px-6 pt-4 pb-6 space-y-2">
                {navItems.map((item, index) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.3 }}
                  >
                    <Link
                      to={item.href}
                      className={cn(
                        "block px-4 py-3 text-sm sm:text-base font-medium rounded-lg font-architekt tracking-wider",
                        isActive(item.href)
                          ? "bg-white/10 text-white"
                          : "text-foreground hover:text-white hover:bg-white/5"
                      )}
                      onClick={() => setIsOpen(false)}
                    >
                      <motion.span
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 17,
                        }}
                        className="block"
                      >
                        {item.label}
                      </motion.span>
                    </Link>
                  </motion.div>
                ))}

                {/* Mobile CTA Section */}
                <motion.div
                  className="pt-4 space-y-3 border-t border-white/10"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                >
                  <ConnectButton />
                  {isAuthenticated && user && (
                    <div
                      className="flex items-center space-x-3 px-4 py-2 cursor-pointer hover:bg-white/5 rounded-lg transition-colors"
                      onClick={() => {
                        setShowSettings(true);
                        setIsOpen(false); // Close mobile menu when opening settings
                      }}
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-accent overflow-hidden">
                        <UserAvatar
                          user={user}
                          className="w-full h-full rounded-full"
                        />
                      </div>
                      <span className="text-sm text-foreground font-architekt">
                        {user.name || "User"}
                      </span>
                    </div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Settings Popup */}
      <SettingsPopup
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </motion.nav>
  );
};

export default Navigation;
