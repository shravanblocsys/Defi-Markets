import { useEffect, useRef } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';

export const useAppKitDisconnect = (onDisconnect: () => void) => {
  const { isConnected } = useAppKitAccount();
  const previousConnectionState = useRef(isConnected);
  const disconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Check if connection state changed from connected to disconnected
    if (previousConnectionState.current && !isConnected) {
      console.log('AppKit disconnect detected - connection state changed');
      
      // Clear any existing timeout
      if (disconnectTimeoutRef.current) {
        clearTimeout(disconnectTimeoutRef.current);
      }

      // Add a small delay to ensure the disconnect is intentional
      disconnectTimeoutRef.current = setTimeout(() => {
        onDisconnect();
      }, 100);
    }

    // Update the previous connection state
    previousConnectionState.current = isConnected;

    // Cleanup timeout on unmount
    return () => {
      if (disconnectTimeoutRef.current) {
        clearTimeout(disconnectTimeoutRef.current);
      }
    };
  }, [isConnected, onDisconnect]);

  // Also listen for custom disconnect events from the appkit-button
  useEffect(() => {
    const appkitButton = document.querySelector('appkit-button');
    
    if (!appkitButton) return;

    const handleCustomDisconnect = () => {
      console.log('AppKit custom disconnect event detected');
      onDisconnect();
    };

    // Listen for custom disconnect event
    appkitButton.addEventListener('disconnect', handleCustomDisconnect);
    
    // Listen for connection state changes via attributes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-connected') {
          const isConnected = appkitButton.getAttribute('data-connected') === 'true';
          if (!isConnected) {
            console.log('AppKit disconnect detected via attribute change');
            onDisconnect();
          }
        }
      });
    });

    observer.observe(appkitButton, {
      attributes: true,
      attributeFilter: ['data-connected', 'data-account']
    });

    // Cleanup
    return () => {
      appkitButton.removeEventListener('disconnect', handleCustomDisconnect);
      observer.disconnect();
    };
  }, [onDisconnect]);

  return null;
};
