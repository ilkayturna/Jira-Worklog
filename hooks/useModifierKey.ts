import { useState, useEffect } from 'react';

export const useModifierKey = (key: 'Control' | 'Meta' | 'Alt' | 'Shift' = 'Control') => {
    const [isPressed, setIsPressed] = useState(false);

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

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [key]);

    return isPressed;
};
