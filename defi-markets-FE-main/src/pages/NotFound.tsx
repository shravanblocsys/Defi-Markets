import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Home, Search } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen py-16 sm:py-20 lg:py-24 flex items-center justify-center">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
        <Card className="glass-card">
          <CardHeader className="text-center p-6 sm:p-8">
            <div className="mb-6">
              <div className="text-6xl sm:text-7xl lg:text-8xl font-bold text-primary font-architekt mb-4">
                404
              </div>
              <div className="w-24 h-1 bg-gradient-to-r from-primary to-accent mx-auto rounded-full"></div>
            </div>
            <CardTitle className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground font-architekt mb-4">
              Page Not Found
            </CardTitle>
            <CardDescription className="text-base sm:text-lg text-muted-foreground font-architekt max-w-md mx-auto">
              The page you're looking for doesn't exist or has been moved. Let's get you back on track.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="text-center p-6 sm:p-8 pt-0">
            <div className="space-y-4 sm:space-y-6">
              {/* Error Details */}
              <div className="p-4 bg-muted/20 rounded-lg border border-muted/30">
                <p className="text-sm text-muted-foreground font-mono">
                  Requested URL: <span className="text-foreground">{location.pathname}</span>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                <Button 
                  onClick={() => navigate("/")} 
                  variant="hero" 
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Button>
                <Button 
                  onClick={() => navigate("/")} 
                  variant="outline" 
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Browse Vaults
                </Button>
                <Button 
                  onClick={() => navigate(-1)} 
                  variant="ghost" 
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
              </div>

              {/* Help Text */}
              <div className="pt-4 border-t border-muted/30">
                <p className="text-sm text-muted-foreground">
                  Need help? Check out our{" "}
                  <button 
                    onClick={() => navigate("/")}
                    className="text-primary hover:text-primary/80 underline font-medium"
                  >
                    vault marketplace
                  </button>{" "}
                  or{" "}
                  <button 
                    onClick={() => navigate("/portfolio")}
                    className="text-primary hover:text-primary/80 underline font-medium"
                  >
                    portfolio
                  </button>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NotFound;
