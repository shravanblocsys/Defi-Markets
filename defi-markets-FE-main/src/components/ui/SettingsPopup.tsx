import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { authApi, uploadApi } from "@/services/api";
import { formatDate, getInitials } from "@/lib/helpers";
import { User } from "@/types/store";
import { useAuth } from "@/hooks/useAuth";
import {
  Loader2,
  User as UserIcon,
  Mail,
  AtSign,
  Calendar,
  Plus,
  Upload,
  Twitter,
} from "lucide-react";
interface SettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper to clean up error messages (remove regex patterns, make user-friendly)
const cleanErrorMessage = (msg: string): string => {
  return msg.replace(/must match \/.*\/ regular expression/g, (match) => {
    // Extract the pattern and make it more readable
    const patternMatch = match.match(/\/(.*)\//);
    if (patternMatch) {
      const pattern = patternMatch[1];
      if (pattern === "^[a-zA-Z ]+$") {
        return "must contain only letters and spaces";
      }
      return match;
    }
    return match;
  });
};

// Helper to format an array of error messages
const formatErrorArray = (errors: string[]): string => {
  return errors
    .map((msg, index) => {
      const cleanedMsg = cleanErrorMessage(msg);
      return `${index + 1}. ${cleanedMsg}`;
    })
    .join("\n");
};

// Helper function to format error messages nicely
const formatErrorMessage = (error: string | string[] | undefined): string => {
  if (!error) return "An error occurred";

  // If it's already an array, format it
  if (Array.isArray(error)) {
    return formatErrorArray(error);
  }

  // If it's a string, check if it contains comma-separated errors (from backend)
  // or line breaks (from our API service)
  const errorString = String(error);

  // Check if it's a comma-separated list that should be split
  // Common pattern: "error1, error2" or "error1,error2"
  if (errorString.includes(", ") || errorString.includes(",")) {
    // Split by comma and clean up
    const errors = errorString
      .split(/,+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (errors.length > 1) {
      return formatErrorArray(errors);
    }
  }

  // Check if it contains line breaks (from our formatted messages)
  if (errorString.includes("\n")) {
    const errors = errorString.split("\n").filter((e) => e.trim().length > 0);
    if (errors.length > 1) {
      return formatErrorArray(errors);
    }
  }

  // Single error message - clean up regex patterns
  return cleanErrorMessage(errorString);
};

const SettingsPopup = ({ isOpen, onClose }: SettingsPopupProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    name: "",
    avatar: "",
    socialLinks: [] as Array<{ platform: string; url: string }>,
  });
  const { toast } = useToast();
  const { updateProfile } = useAuth();

  const fetchUserProfile = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authApi.getProfile();

      // Check if user data is directly in response.data or nested in response.data.user
      const userData = response.data.user || response.data;

      if (userData) {
        setUser(userData);
        // Convert socialLinks array to object for easier form handling
        const twitterLink = userData.socialLinks?.find(
          (link) => link.platform === "twitter"
        );

        setFormData({
          username: userData.username || "",
          email: userData.email || "",
          name: userData.name || "",
          avatar: userData.avatar || "",
          socialLinks: userData.socialLinks || [],
        });
      }
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
      toast({
        title: "Error",
        description: "Failed to load user profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch user profile when popup opens
  useEffect(() => {
    if (isOpen) {
      fetchUserProfile();
    }
  }, [isOpen, fetchUserProfile]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSocialLinkChange = (platform: string, value: string) => {
    setFormData((prev) => {
      const existingIndex = prev.socialLinks.findIndex(
        (link) => link.platform === platform
      );
      let newSocialLinks = [...prev.socialLinks];

      if (value.trim()) {
        // Add or update the social link
        if (existingIndex >= 0) {
          newSocialLinks[existingIndex] = { platform, url: value };
        } else {
          newSocialLinks.push({ platform, url: value });
        }
      } else {
        // Remove the social link if empty
        newSocialLinks = newSocialLinks.filter(
          (link) => link.platform !== platform
        );
      }

      return {
        ...prev,
        socialLinks: newSocialLinks,
      };
    });
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      // Upload file to S3 using the new API
      const result = await uploadApi.uploadToS3(file);

      // Handle different response structures
      if (result.success && result.data) {
        // Response has success field and data
        const avatarUrl = result.data;

        setFormData((prev) => ({
          ...prev,
          avatar: avatarUrl,
        }));

        // Update the global Redux state immediately with the new avatar
        await updateProfile({ avatar: avatarUrl });

        toast({
          title: "Success",
          description: "Profile picture updated successfully",
          className:
            "border-green-500/40 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-100",
        });
      } else if (result.data && typeof result.data === "string") {
        // Response data is directly the URL string
        const avatarUrl = result.data;

        setFormData((prev) => ({
          ...prev,
          avatar: avatarUrl,
        }));

        // Update the global Redux state immediately with the new avatar
        await updateProfile({ avatar: avatarUrl });

        toast({
          title: "Success",
          description: "Profile picture updated successfully",
          className:
            "border-green-500/40 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-100",
        });
      } else {
        console.error("Unexpected response structure:", result);
        throw new Error("Unexpected response format from server");
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      // Use the Redux action to update profile, which will update the global state
      const result = await updateProfile(formData);

      if (result.success) {
        // Update local user state with the form data
        const updatedUser = {
          ...user,
          ...formData,
        };
        setUser(updatedUser);

        toast({
          title: "Success",
          description: "Profile updated successfully",
          className:
            "border-green-500/40 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-100",
        });
        onClose();
      } else {
        // Extract and format error message from result
        // result.error should already be an array if it came from originalMessage
        const errorMessage = formatErrorMessage(
          result.error || "Failed to update profile"
        );

        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to update profile:", error);

      // Extract error message from various error formats
      // Prioritize originalMessage from ApiError to preserve array format
      let errorMessage: string | string[] = "Failed to update profile";

      // Check if it's an ApiError with originalMessage (array format)
      if (error?.originalMessage) {
        errorMessage = error.originalMessage;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error?.message) {
        // Check if message is already an array
        errorMessage = Array.isArray(error.message)
          ? error.message
          : error.message;
      } else if (error?.error) {
        errorMessage = error.error;
      } else if (Array.isArray(error)) {
        errorMessage = error;
      }

      // Format the error message nicely
      const formattedMessage = formatErrorMessage(errorMessage);

      toast({
        title: "Error",
        description: formattedMessage,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectTwitter = async () => {
    try {
      const walletAddress = user?.walletAddress || user?.address;

      if (!walletAddress) {
        toast({
          title: "Error",
          description: "Wallet address not found",
          variant: "destructive",
        });
        return;
      }

      const result = await updateProfile({
        walletAddress,
        twitter_username: "",
        isTwitterConnected: false,
      });

      if (result.success) {
        // Update user state to reflect disconnection
        setUser((prev) => ({
          ...prev!,
          twitter_username: undefined,
          isTwitterConnected: false,
        }));

        toast({
          title: "Success",
          description: "Twitter account disconnected successfully",
        });

        // Refresh profile to get updated data
        fetchUserProfile();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to disconnect Twitter account",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to disconnect Twitter:", error);

      // Check if it's an ApiError with a specific message from the server
      const errorMessage =
        error?.message || "Failed to disconnect Twitter account";

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[500px] max-h-[95vh] sm:max-h-[90vh] sm:w-full glass-card overflow-y-auto">
        <DialogHeader className="pb-4 sm:pb-6">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-architekt">
            <UserIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            Profile Settings
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base font-architekt">
            Update your profile information and preferences
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 sm:py-12">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" />
            <span className="ml-2 text-sm sm:text-base font-architekt">
              Loading profile...
            </span>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="relative flex-shrink-0">
                <Avatar className="w-20 h-20 sm:w-24 sm:h-24">
                  <AvatarImage src={formData.avatar} alt="Profile" />
                  <AvatarFallback className="text-lg sm:text-xl">
                    {getInitials(formData.name, formData.username)}
                  </AvatarFallback>
                </Avatar>
                <input
                  id="profile-avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploading}
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 w-full text-center sm:text-left">
                <Label className="text-sm sm:text-base font-medium flex items-center justify-center sm:justify-start gap-2 font-architekt mb-2">
                  Profile Picture
                </Label>
                <div className="flex flex-col items-center sm:items-start gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 w-full sm:w-auto font-architekt"
                    disabled={uploading}
                    onClick={() =>
                      (
                        document.querySelector(
                          "#profile-avatar-upload"
                        ) as HTMLInputElement
                      )?.click()
                    }
                  >
                    <Plus className="w-4 h-4" />
                    {uploading ? "Uploading..." : "Upload Image"}
                  </Button>
                  <span className="text-xs sm:text-sm text-muted-foreground font-architekt">
                    JPG, PNG, GIF up to 5MB
                  </span>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label
                  htmlFor="name"
                  className="text-sm sm:text-base font-medium flex items-center gap-2 font-architekt"
                >
                  <UserIcon className="w-4 h-4 flex-shrink-0" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter your full name"
                  className="h-11 sm:h-12 text-sm sm:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="username"
                  className="text-sm sm:text-base font-medium flex items-center gap-2 font-architekt"
                >
                  <AtSign className="w-4 h-4 flex-shrink-0" />
                  Username
                </Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) =>
                    handleInputChange("username", e.target.value)
                  }
                  placeholder="Enter your username"
                  className="h-11 sm:h-12 text-sm sm:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-sm sm:text-base font-medium flex items-center gap-2 font-architekt"
                >
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="Enter your email"
                  className="h-11 sm:h-12 text-sm sm:text-base"
                />
              </div>

              {/* Twitter Connection Section */}
              <div className="space-y-2">
                <Label className="text-sm sm:text-base font-medium flex items-center gap-2 font-architekt">
                  <Twitter className="w-4 h-4 flex-shrink-0" />
                  Twitter Account
                </Label>

                {user?.isTwitterConnected && user?.twitter_username ? (
                  <div className="space-y-2">
                    <div className="p-3 sm:p-4 glass-surface rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Twitter className="w-5 h-5 text-blue-400" />
                          <span className="text-sm sm:text-base font-medium">
                            @{user.twitter_username}
                          </span>
                        </div>
                        <div className="px-2 py-1 bg-success/20 text-success rounded-md text-xs font-medium">
                          Connected
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnectTwitter}
                      className="w-full font-architekt text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      Disconnect Twitter
                    </Button>
                  </div>
                ) : (
                  <a
                    href={`${
                      import.meta.env.VITE_BASE_URL ||
                      "http://localhost:3400/api/v1"
                    }/auth/twitter`}
                    className="w-full h-11 sm:h-12 flex items-center justify-center gap-2 font-architekt border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md"
                  >
                    <Twitter className="w-4 h-4 flex-shrink-0" />
                    Authenticate with X
                  </a>
                )}
              </div>
            </div>

            {/* Read-only Information */}
            <div className="space-y-4 pt-4 sm:pt-6 border-t border-border/50">
              <h4 className="text-sm sm:text-base font-medium text-muted-foreground font-architekt">
                Account Information
              </h4>

              {(user?.walletAddress || user?.address) && (
                <div className="flex flex-col gap-2 py-2">
                  <span className="text-sm sm:text-base text-muted-foreground font-architekt">
                    Wallet Address
                  </span>
                  <span className="text-xs sm:text-sm font-mono bg-muted/50 px-3 py-2 rounded break-all">
                    {user.walletAddress || user.address}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2 py-2">
                <span className="text-sm sm:text-base text-muted-foreground flex items-center gap-2 font-architekt">
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  Member Since
                </span>
                <span className="text-sm sm:text-base font-architekt pl-6">
                  {formatDate(user?.date || user?.createdAt)}
                </span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-3 pt-4 sm:pt-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="w-full sm:w-auto font-architekt"
            size="sm"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="hero"
            onClick={handleSave}
            disabled={saving || loading || uploading}
            className="w-full sm:w-auto font-architekt order-1 sm:order-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsPopup;
//8080: oauth_sid -> sess_1761136377465_xqsv6ctb3
// sess_1761137892638_88rmmvk26
