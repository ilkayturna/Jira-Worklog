import { useState, useEffect } from 'react';

/**
 * Hook to detect if user is on a mobile device
 * Uses multiple signals: touch capability, pointer type, and user agent
 * This is different from screen size - a desktop user with small window is still desktop
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return detectMobile();
  });

  useEffect(() => {
    // Re-check on mount (in case SSR hydration)
    setIsMobile(detectMobile());

    // Listen for changes (e.g., device rotation, or dev tools device toggle)
    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const handleChange = () => setIsMobile(detectMobile());
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}

/**
 * Detect if the device is actually a mobile/touch device
 * Not just a small screen
 */
function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;

  // Method 1: Check pointer type (most reliable)
  // 'coarse' = touch/finger, 'fine' = mouse/trackpad
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  
  // Method 2: Check if touch is primary input
  const hasTouchScreen = window.matchMedia('(hover: none)').matches;
  
  // Method 3: Check touch points (backup)
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  
  // Method 4: User Agent check (fallback for edge cases)
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'android', 'webos', 'iphone', 'ipad', 'ipod', 'blackberry', 
    'windows phone', 'opera mini', 'mobile', 'tablet'
  ];
  const hasUserAgentMobile = mobileKeywords.some(keyword => userAgent.includes(keyword));

  // A device is mobile if:
  // - It has coarse pointer (touch) AND no fine pointer (no mouse)
  // - OR it's identified as mobile by user agent
  const isPrimaryTouch = hasCoarsePointer && hasTouchScreen;
  
  return isPrimaryTouch || hasUserAgentMobile;
}

/**
 * Get device type string for debugging
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';

  const userAgent = navigator.userAgent.toLowerCase();
  
  // Check for tablets specifically
  const isTablet = /ipad|tablet|playbook|silk/i.test(userAgent) ||
    (userAgent.includes('android') && !userAgent.includes('mobile'));
  
  if (isTablet) return 'tablet';
  
  if (detectMobile()) return 'mobile';
  
  return 'desktop';
}
