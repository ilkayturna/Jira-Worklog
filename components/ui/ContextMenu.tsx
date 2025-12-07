import React, { useEffect, useRef } from 'react';

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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    // Adjust position if it goes off screen
    const style: React.CSSProperties = {
        top: y,
        left: x,
    };

    return (
        <div 
            ref={menuRef}
            className="fixed z-50 min-w-[180px] bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 animate-in fade-in zoom-in-95 duration-100"
            style={style}
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
