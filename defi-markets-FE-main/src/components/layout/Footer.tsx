import {
  Twitter,
  MessageCircle,
  Linkedin,
  Instagram,
  Youtube,
} from "lucide-react";
import dfmLogo from "@/assets/bottomLogo.png";

const Footer = () => {
  return (
    <footer className="footer-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 lg:pt-16">
        {/* Main Footer Content */}
        <div className="flex flex-col sm:flex-row justify-center sm:justify-between items-center gap-6 sm:gap-8">
          {/* Logo and Brand */}
          <div className="flex items-center justify-center sm:justify-start">
            <img 
              src={dfmLogo} 
              alt="DFM Logo" 
              className="w-[250px] sm:w-[300px] lg:w-[400px] h-auto" 
            />
          </div>

          {/* Social Media Icons */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 lg:gap-6">
            <a 
              href="#" 
              className="p-2 sm:p-3 hover:opacity-80 transition-opacity duration-200"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-4 w-4 sm:h-5 sm:w-5 text-black" />
            </a>
            <a 
              href="#" 
              className="p-2 sm:p-3 hover:opacity-80 transition-opacity duration-200"
              aria-label="Instagram"
            >
              <Instagram className="h-4 w-4 sm:h-5 sm:w-5 text-black" />
            </a>
            <a 
              href="#" 
              className="p-2 sm:p-3 hover:opacity-80 transition-opacity duration-200"
              aria-label="Message"
            >
              <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 text-black" />
            </a>
            <a 
              href="#" 
              className="p-2 sm:p-3 hover:opacity-80 transition-opacity duration-200"
              aria-label="Twitter"
            >
              <Twitter className="h-4 w-4 sm:h-5 sm:w-5 text-black" />
            </a>
            <a 
              href="#" 
              className="p-2 sm:p-3 hover:opacity-80 transition-opacity duration-200"
              aria-label="YouTube"
            >
              <Youtube className="h-4 w-4 sm:h-5 sm:w-5 text-black" />
            </a>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-8 sm:mt-10 lg:mt-12 pt-6 sm:pt-8">
          <div className="flex justify-center">
            <p className="text-sm sm:text-base lg:text-lg xl:text-[24px] font-bold text-black font-architekt text-center px-4">
              © 2025 DEFIMARKETS, INC. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
