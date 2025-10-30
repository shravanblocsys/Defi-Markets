import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface ScrollToTopProps {
  /**
   * Whether to use smooth scrolling animation
   * @default true
   */
  smooth?: boolean;
  
  /**
   * Custom scroll behavior
   * @default 'smooth'
   */
  behavior?: ScrollBehavior;
  
  /**
   * Whether to scroll to top on every route change
   * @default true
   */
  scrollOnRouteChange?: boolean;
  
  /**
   * Custom scroll position (x, y)
   * @default { x: 0, y: 0 }
   */
  position?: { x: number; y: number };
}

/**
 * Component that automatically scrolls to top when route changes
 * Can be customized with different scroll behaviors and positions
 */
const ScrollToTop = ({ 
  smooth = true, 
  behavior = 'smooth',
  scrollOnRouteChange = true,
  position = { x: 0, y: 0 }
}: ScrollToTopProps) => {
  const location = useLocation();

  useEffect(() => {
    if (scrollOnRouteChange) {
      // Small delay to ensure the page has rendered
      const timer = setTimeout(() => {
        window.scrollTo({
          top: position.y,
          left: position.x,
          behavior: smooth ? behavior : 'auto'
        });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [location.pathname, smooth, behavior, scrollOnRouteChange, position.x, position.y]);

  return null; // This component doesn't render anything
};

export default ScrollToTop;
