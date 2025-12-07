import { useEffect } from 'react';

interface ShortcutConfig {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean; // Mac Command key
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  preventDefault?: boolean;
}

export const useKeyboardShortcuts = (shortcuts: ShortcutConfig[]) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      shortcuts.forEach(config => {
        const isKeyMatch = event.key.toLowerCase() === config.key.toLowerCase();
        const isCtrlMatch = config.ctrlKey ? (event.ctrlKey || event.metaKey) : true;
        const isShiftMatch = config.shiftKey ? event.shiftKey : true;
        const isAltMatch = config.altKey ? event.altKey : true;

        // Check for exact modifier matches if specified, otherwise ignore if not specified but pressed? 
        // Usually we want exact match for modifiers if specified as true.
        // Simplified logic:
        const ctrlPressed = event.ctrlKey || event.metaKey;
        const shiftPressed = event.shiftKey;
        const altPressed = event.altKey;

        if (
          isKeyMatch &&
          (config.ctrlKey === undefined || config.ctrlKey === ctrlPressed) &&
          (config.shiftKey === undefined || config.shiftKey === shiftPressed) &&
          (config.altKey === undefined || config.altKey === altPressed)
        ) {
          if (config.preventDefault !== false) {
            event.preventDefault();
          }
          config.action();
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};
