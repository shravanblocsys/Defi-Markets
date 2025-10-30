import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface RouteScrollConfig {
  path: string;
  position?: { x: number; y: number };
  behavior?: ScrollBehavior;
  delay?: number;
}

interface ScrollToTopAdvancedProps {
  /**
   * Custom scroll configurations for specific routes
   */
  routeConfigs?: RouteScrollConfig[];
  
  /**
   * Default scroll behavior for all routes
   * @default 'smooth'
   */
  defaultBehavior?: ScrollBehavior;
  
  /**
   * Default scroll position
   * @default { x: 0, y: 0 }
   */
  defaultPosition?: { x: number; y: number };
  
  /**
   * Default delay before scrolling
   * @default 100
   */
  defaultDelay?: number;
  
  /**
   * Whether to scroll to top on every route change
   * @default true
   */
  enabled?: boolean;
}

/**
 * Advanced scroll-to-top component with route-specific configurations
 * Allows different scroll behaviors for different routes
 */
const ScrollToTopAdvanced = ({ 
  routeConfigs = [],
  defaultBehavior = 'smooth',
  defaultPosition = { x: 0, y: 0 },
  defaultDelay = 100,
  enabled = true
}: ScrollToTopAdvancedProps) => {
  const location = useLocation();

  useEffect(() => {
    if (!enabled) return;

    // Find route-specific configuration
    const routeConfig = routeConfigs.find(config => 
      location.pathname === config.path || 
      location.pathname.startsWith(config.path + '/')
    );

    // Use route-specific config or defaults
    const behavior = routeConfig?.behavior || defaultBehavior;
    const position = routeConfig?.position || defaultPosition;
    const delay = routeConfig?.delay || defaultDelay;

    // Scroll to position with delay
    const timer = setTimeout(() => {
      window.scrollTo({
        top: position.y,
        left: position.x,
        behavior
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [location.pathname, routeConfigs, defaultBehavior, defaultPosition, defaultDelay, enabled]);

  return null;
};

export default ScrollToTopAdvanced;

// Example usage:
/*
<ScrollToTopAdvanced
  routeConfigs={[
    {
      path: '/create-vault',
      position: { x: 0, y: 0 },
      behavior: 'smooth',
      delay: 150
    },
    {
      path: '/vault',
      position: { x: 0, y: 0 },
      behavior: 'auto',
      delay: 50
    }
  ]}
  defaultBehavior="smooth"
  defaultPosition={{ x: 0, y: 0 }}
  defaultDelay={100}
/>
*/
