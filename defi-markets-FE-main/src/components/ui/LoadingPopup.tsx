import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LoadingPopupProps {
  isOpen: boolean;
  title: string;
  currentStep: string;
  steps: string[];
  currentStepIndex: number;
}

const LoadingPopup: React.FC<LoadingPopupProps> = ({
  isOpen,
  title,
  currentStep,
  steps,
  currentStepIndex,
}) => {
  // Keep progress calculation in one place so label and bar stay in sync
  const progress = Math.max(
    0,
    Math.min(
      100,
      Math.round(((currentStepIndex + 1) / Math.max(steps.length, 1)) * 100)
    )
  );

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[400px] glass-card">
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Step Display */}
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-xs text-primary-foreground font-bold">
                    {currentStepIndex + 1}
                  </span>
                </div>
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">{currentStep}</h3>
            <p className="text-sm text-muted-foreground">
              Please wait while we process your request
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="relative w-full bg-muted rounded-full h-2 overflow-hidden border-[1px] border-white/15">
              {/* Filled track */}
              <motion.div
                className="bg-primary h-[100%] rounded-r-md relative overflow-hidden"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                {/* Moving white line animation */}
                <motion.div
                  className="absolute inset-0 bg-white"
                  // initial={{ x: "-100%" }}
                  // animate={{ x: "100%" }}
                  // transition={{
                  //   duration: 1.5,
                  //   ease: "easeInOut",
                  //   repeat: Infinity,
                  //   repeatDelay: 0.5,
                  // }}
                />
              </motion.div>
            </div>
          </div>

          {/* Steps List */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-center text-muted-foreground">
              Progress Steps
            </h4>
            <div className="space-y-2">
              {steps.map((step, index) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-300 ${
                    index < currentStepIndex
                      ? "bg-green-50 border-2 border-green-200 shadow-sm"
                      : index === currentStepIndex
                      ? "bg-primary border-2 border-primary shadow-lg ring-2 ring-primary/30"
                      : "bg-muted/20 border border-muted/30"
                  }`}
                >
                  <div className="flex-shrink-0">
                    {index < currentStepIndex ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : index === currentStepIndex ? (
                      <div className="relative">
                        <Loader2 className="w-6 h-6 text-primary-foreground animate-spin" />
                        <div className="absolute inset-0 rounded-full border-2 border-primary-foreground/30 animate-pulse"></div>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`text-sm ${
                        index < currentStepIndex
                          ? "text-green-700 font-medium"
                          : index === currentStepIndex
                          ? "text-primary-foreground font-bold text-base"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <span
                      className={`text-xs px-3 py-1 rounded-full font-semibold ${
                        index < currentStepIndex
                          ? "bg-green-100 text-green-700"
                          : index === currentStepIndex
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {index < currentStepIndex ? "✓" : index + 1}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoadingPopup;
