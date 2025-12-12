import React, { useEffect, useRef, useState } from 'react';

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    actions: {
        label: string;
        icon?: React.ReactNode;
        onClick: () => void;
        disabled?: boolean;
        danger?: boolean;
    }[];
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, actions }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: y, left: x });

    // Calculate safe position after mount (when we know menu dimensions)
    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const padding = 8; // Safety margin from edges
            
            let adjustedX = x;
            let adjustedY = y;
            
            // Prevent horizontal overflow
            if (x + rect.width > viewportWidth - padding) {
                adjustedX = Math.max(padding, viewportWidth - rect.width - padding);
            }
            
            // Prevent vertical overflow
            if (y + rect.height > viewportHeight - padding) {
                adjustedY = Math.max(padding, viewportHeight - rect.height - padding);
            }
            
            // Only update if position changed to avoid re-render loop
            if (adjustedX !== x || adjustedY !== y) {
                setPosition({ top: adjustedY, left: adjustedX });
            }
        }
    }, [x, y]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        // Also close on Escape key
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    return (
        <div 
            ref={menuRef}
            className="fixed z-50 min-w-[180px] bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 animate-in fade-in zoom-in-95 duration-100"
            style={position}
        >
            {actions.map((action, index) => (
                <button
                    key={index}
                    onClick={() => {
                        action.onClick();
                        onClose();
                    }}
                    disabled={action.disabled}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
                        ${action.danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200'}
                        ${action.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                >
                    {action.icon && <span className="w-4 h-4">{action.icon}</span>}
                    {action.label}
                </button>
            ))}
        </div>
    );
};
