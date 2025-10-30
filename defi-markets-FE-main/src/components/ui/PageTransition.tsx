import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

const PageTransition = ({ children, className }: PageTransitionProps) => {
  const location = useLocation();

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ 
        duration: 0.15, 
        ease: "easeOut" 
      }}
      className={cn("w-full page-transition-container", className)}
      style={{
        willChange: "opacity",
      }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
