import { useCallback, useEffect, useState } from 'react';

declare global {
  interface Window {
    Cashfree: any;
  }
}

interface CashfreeCheckoutOptions {
  paymentSessionId: string;
  redirectTarget?: '_self' | '_blank' | '_modal';
}

export const useCashfree = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[useCashfree] Initializing...');
    
    // Check if already loaded
    if (window.Cashfree) {
      console.log('[useCashfree] SDK already loaded');
      setIsLoaded(true);
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="cashfree.js"]');
    if (existingScript) {
      console.log('[useCashfree] Script already exists, waiting for load...');
      existingScript.addEventListener('load', () => {
        console.log('[useCashfree] Existing script loaded');
        setIsLoaded(true);
      });
      return;
    }

    // Load Cashfree SDK
    console.log('[useCashfree] Loading SDK from CDN...');
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    
    script.onload = () => {
      console.log('[useCashfree] SDK loaded successfully');
      console.log('[useCashfree] window.Cashfree available:', !!window.Cashfree);
      setIsLoaded(true);
      setLoadError(null);
    };

    script.onerror = (error) => {
      console.error('[useCashfree] Failed to load SDK:', error);
      setLoadError('Failed to load payment SDK');
      setIsLoaded(false);
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  const checkout = useCallback(async (
    options: CashfreeCheckoutOptions, 
    environment: 'sandbox' | 'production' = 'sandbox'
  ) => {
    console.log('[useCashfree] checkout called');
    console.log('[useCashfree] - isLoaded:', isLoaded);
    console.log('[useCashfree] - window.Cashfree:', !!window.Cashfree);
    console.log('[useCashfree] - environment:', environment);
    console.log('[useCashfree] - paymentSessionId:', options.paymentSessionId?.substring(0, 20) + '...');
    console.log('[useCashfree] - redirectTarget:', options.redirectTarget);

    if (!isLoaded) {
      console.error('[useCashfree] ERROR: SDK not loaded yet');
      throw new Error('Cashfree SDK not loaded');
    }

    if (!window.Cashfree) {
      console.error('[useCashfree] ERROR: window.Cashfree is undefined');
      throw new Error('Cashfree SDK not available');
    }

    if (!options.paymentSessionId) {
      console.error('[useCashfree] ERROR: paymentSessionId is missing');
      throw new Error('Payment session ID is required');
    }

    setIsLoading(true);

    try {
      console.log('[useCashfree] Creating Cashfree instance...');
      const cashfree = window.Cashfree({
        mode: environment,
      });
      console.log('[useCashfree] Cashfree instance created');

      console.log('[useCashfree] Calling checkout...');
      const result = await cashfree.checkout({
        paymentSessionId: options.paymentSessionId,
        redirectTarget: options.redirectTarget || '_self',
      });

      console.log('[useCashfree] Checkout result:', result);
      return result;
    } catch (error) {
      console.error('[useCashfree] Checkout error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded]);

  return {
    isLoaded,
    isLoading,
    loadError,
    checkout,
  };
};
