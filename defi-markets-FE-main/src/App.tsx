import { useState, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Navigation from "./components/layout/Navigation";
import Footer from "./components/layout/Footer";
import CreateVault from "./pages/CreateVault";
import Vaults from "./pages/Vaults";
import VaultDetails from "./pages/VaultDetails";
import Portfolio from "./pages/Portfolio";
import NotFound from "./pages/NotFound";
import PageTransition from "./components/ui/PageTransition";
import ScrollToTop from "./components/ui/ScrollToTop";
import { useAuthInitialization } from "./hooks/useAuthInitialization";
import heroBg from "./assets/hero-bg.png";
import lightImage from "@/assets/light.png";

const queryClient = new QueryClient();

// Wrapper component for routes with transitions
const AppRoutes = () => {
  return (
    <PageTransition>
      <Routes>
        <Route path="/" element={<Vaults />} />
        <Route path="/create-vault" element={<CreateVault />} />
        <Route path="/vault/:id" element={<VaultDetails />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </PageTransition>
  );
};

const App = () => {
  const { scrollY } = useScroll();

  // Initialize auth - fetch user profile if token exists but no user data
  useAuthInitialization();

  // Optimized Framer Motion transforms for better performance
  const heroOpacity = useTransform(scrollY, [0, 600], [1, 0]);
  const heroY = useTransform(scrollY, [0, 600], [0, -180]); // Reduced parallax for smoother performance
  const lightOpacity = useTransform(scrollY, [0, 600], [0.6, 0]); // Reduced opacity for less visual noise
  const lightY = useTransform(scrollY, [0, 600], [0, -90]); // Reduced parallax for light beams

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen text-foreground relative">
          {/* Hero Background - Desktop Only with Framer Motion Parallax */}
          <motion.div
            className="fixed inset-0 items-center justify-center pointer-events-none z-0 hidden lg:flex"
            style={{
              opacity: heroOpacity,
              y: heroY,
            }}
          >
            <motion.img
              src={heroBg}
              alt="Hero Background"
              className="w-full h-auto"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />

            {/* Light Beams - Desktop Only with Framer Motion Parallax */}
            <motion.div
              className="absolute top-0 left-0 w-full h-full items-center justify-center pointer-events-none"
              style={{
                opacity: lightOpacity,
                y: lightY,
              }}
            >
              <div className="relative w-[1155.46px] h-96">
                <motion.img
                  src={lightImage}
                  alt="Light Beam 1"
                  className="w-22 h-20 left-[120px] top-[300px] absolute"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                  }}
                  transition={{
                    delay: 0.3,
                    duration: 0.6,
                    ease: "easeOut",
                  }}
                />
                <motion.img
                  src={lightImage}
                  alt="Light Beam 2"
                  className="w-22 h-20 left-[430px] top-[500px] absolute"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                  }}
                  transition={{
                    delay: 0.4,
                    duration: 0.6,
                    ease: "easeOut",
                  }}
                />
                <motion.img
                  src={lightImage}
                  alt="Light Beam 3"
                  className="w-22 h-20 left-[1648px] top-[430px] absolute"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                  }}
                  transition={{
                    delay: 0.5,
                    duration: 0.6,
                    ease: "easeOut",
                  }}
                />
                <motion.img
                  src={lightImage}
                  alt="Light Beam 4"
                  className="w-22 h-20 left-[1384px] top-[540px] absolute"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                  }}
                  transition={{
                    delay: 0.6,
                    duration: 0.6,
                    ease: "easeOut",
                  }}
                />
                <motion.img
                  src={lightImage}
                  alt="Light Beam 5"
                  className="w-22 h-20 left-[1100px] top-[570px] absolute"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                  }}
                  transition={{
                    delay: 0.7,
                    duration: 0.6,
                    ease: "easeOut",
                  }}
                />
              </div>
            </motion.div>
          </motion.div>

          {/* Mobile/Tablet Background - Simple gradient */}
          <div className="fixed inset-0 pointer-events-none z-0 lg:hidden">
            <div className="w-full h-full bg-gradient-to-br from-[#080808] via-[#295366] to-[#CDE1EA]" />
          </div>

          <Toaster />
          <Sonner />
          <div className="relative z-10">
            <BrowserRouter>
              <ScrollToTop />
              <Navigation />
              <main className="relative" style={{ willChange: "auto" }}>
                <AppRoutes />
              </main>
              <Footer />
            </BrowserRouter>
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
