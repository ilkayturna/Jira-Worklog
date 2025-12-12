import { useEffect, useRef } from 'react';

/**
 * Trap focus within a container element (for modals, dialogs, etc.)
 */
export const trapFocus = (element: HTMLElement): (() => void) => {
  const focusableElements = element.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  };

  element.addEventListener('keydown', handleTabKey);
  
  // Focus first element on mount using requestAnimationFrame for better timing
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      firstElement?.focus();
    });
  });

  // Return cleanup function
  return () => {
    element.removeEventListener('keydown', handleTabKey);
  };
};

/**
 * Custom hook to return focus to the previously focused element when unmounting
 */
export const useFocusReturn = () => {
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Store the currently focused element
    previouslyFocusedElement.current = document.activeElement as HTMLElement;

    // Return focus when unmounting
    return () => {
      if (previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus();
      }
    };
  }, []);
};

/**
 * Generate a unique ID for accessibility attributes
 */
let idCounter = 0;
export const generateId = (prefix: string = 'a11y'): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now()}`;
};

/**
 * Announce a message to screen readers using ARIA live region
 */
export const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  // Create or get the live region element
  let liveRegion = document.getElementById('aria-live-region');
  
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'aria-live-region';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
  }

  // Update the message - clear first to ensure screen readers pick up the change
  // Some screen readers need the content to change to announce it
  if (liveRegion.textContent === message) {
    liveRegion.textContent = '';
    requestAnimationFrame(() => {
      if (liveRegion) {
        liveRegion.textContent = message;
      }
    });
  } else {
    liveRegion.textContent = message;
  }
};

/**
 * Check if an element is currently visible
 */
export const isElementVisible = (element: HTMLElement): boolean => {
  return !!(
    element.offsetWidth ||
    element.offsetHeight ||
    element.getClientRects().length
  );
};

/**
 * Get all focusable elements within a container
 */
export const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const selector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const elements = Array.from(container.querySelectorAll<HTMLElement>(selector));
  return elements.filter(isElementVisible);
};

/**
 * Custom hook to manage focus trap
 */
export const useFocusTrap = (enabled: boolean = true) => {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const cleanup = trapFocus(containerRef.current);
    return cleanup;
  }, [enabled]);

  return containerRef;
};
