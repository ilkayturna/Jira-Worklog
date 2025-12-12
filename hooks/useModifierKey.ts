import { useState, useEffect, useCallback } from 'react';

export const useModifierKey = (key: 'Control' | 'Meta' | 'Alt' | 'Shift' = 'Control') => {
    const [isPressed, setIsPressed] = useState(false);

    const resetState = useCallback(() => {
        setIsPressed(false);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === key || (key === 'Control' && e.metaKey) || (key === 'Meta' && e.ctrlKey)) {
                setIsPressed(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === key || (key === 'Control' && !e.metaKey) || (key === 'Meta' && !e.ctrlKey)) {
                setIsPressed(false);
            }
        };

        // Reset when window loses focus (user switched tabs/apps)
        // This prevents the key from staying "pressed" when user releases outside window
        const handleBlur = () => {
            setIsPressed(false);
        };

        // Also reset on visibility change (tab becomes hidden)
        const handleVisibilityChange = () => {
            if (document.hidden) {
                setIsPressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [key]);

    return isPressed;
};
