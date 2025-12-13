import React, { useEffect, useState } from 'react';
import { X, Bell, Undo2, CheckCircle2, AlertCircle, Info, Clock, Trash2, ChevronDown } from 'lucide-react';
import { NotificationHistoryItem } from '../types';

interface NotificationHistoryProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: NotificationHistoryItem[];
    onUndo: (notification: NotificationHistoryItem) => void;
    onClear: () => void;
    onDelete: (id: string) => void;
}

export const NotificationHistory: React.FC<NotificationHistoryProps> = ({
    isOpen,
    onClose,
    notifications,
    onUndo,
    onClear,
    onDelete
}) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);
    
    if (!isOpen) return null;

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Az önce';
        if (diffMins < 60) return `${diffMins} dk önce`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} saat önce`;
        
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle2 size={18} style={{ color: 'var(--color-success)' }} />;
            case 'error': return <AlertCircle size={18} style={{ color: 'var(--color-error)' }} />;
            case 'warning': return <AlertCircle size={18} style={{ color: 'var(--color-warning)' }} />;
            default: return <Info size={18} style={{ color: 'var(--color-primary-600)' }} />;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'success': return 'var(--color-success)';
            case 'error': return 'var(--color-error)';
            case 'warning': return 'var(--color-warning)';
            default: return 'var(--color-primary-600)';
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    const hasExpandableContent = (n: NotificationHistoryItem) => {
        return n.diff || (n.undoAction && !n.dismissed);
    };

    return (
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 z-[55] bg-black/20 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />
            
            {/* Side Panel - Premium Glassmorphism */}
            <div 
                className="fixed right-0 top-0 bottom-0 w-full max-w-md z-[60] animate-slide-in-right"
                style={{ animationDuration: '250ms' }}
            >
                <div className="h-full flex flex-col glass-drawer">
                    {/* Header - Premium Style */}
                    <div className="px-5 py-4 flex items-center justify-between shrink-0 glass-drawer-header">
                        <div className="flex items-center gap-3">
                            <div 
                                className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ 
                                    background: 'linear-gradient(135deg, var(--color-ai-500) 0%, var(--color-primary-500) 100%)',
                                    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)'
                                }}
                            >
                                <Bell size={18} className="text-white" />
                            </div>
                            <div>
                                <h2 className="font-bold text-base bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-on-surface) 0%, var(--color-ai-600) 100%)' }}>
                                    Geçmiş
                                </h2>
                                <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                    {notifications.length} işlem
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {notifications.length > 0 && (
                                <button 
                                    onClick={onClear} 
                                    className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:scale-105 glass-icon-btn"
                                    title="Tümünü temizle"
                                >
                                    <Trash2 size={16} style={{ color: 'var(--color-on-surface-variant)' }} />
                                </button>
                            )}
                            <button 
                                onClick={onClose} 
                                className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:scale-105 glass-icon-btn"
                            >
                                <X size={18} style={{ color: 'var(--color-on-surface-variant)' }} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 pb-24">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 glass-empty-state">
                                    <span className="text-3xl">🔔</span>
                                </div>
                                <p className="font-medium" style={{ color: 'var(--color-on-surface)' }}>
                                    Geçmiş boş
                                </p>
                                <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                                    Yapılan işlemler burada görünecek
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {notifications.map(notification => {
                                    const isExpanded = expandedId === notification.id;
                                    const canExpand = hasExpandableContent(notification);
                                    const canUndo = notification.undoAction && !notification.dismissed;
                                    
                                    return (
                                        <div 
                                            key={notification.id}
                                            className={`rounded-xl overflow-hidden transition-all glass-card ${notification.dismissed ? 'dismissed' : ''} ${isExpanded ? 'expanded' : ''}`}
                                            style={{ 
                                                borderColor: isExpanded ? getTypeColor(notification.type) : undefined,
                                                opacity: notification.dismissed ? 0.7 : 1
                                            }}
                                        >
                                            {/* Main Row - Clickable */}
                                            <div 
                                                className={`p-3 flex items-start gap-3 ${canExpand ? 'cursor-pointer hover-overlay' : ''}`}
                                                onClick={() => canExpand && toggleExpand(notification.id)}
                                            >
                                                <div className="shrink-0 mt-0.5">
                                                    {getIcon(notification.type)}
                                                </div>
                                                
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-sm" 
                                                               style={{ color: 'var(--color-on-surface)' }}>
                                                                {notification.title}
                                                            </p>
                                                            <p className="text-xs mt-0.5 line-clamp-1"
                                                               style={{ color: 'var(--color-on-surface-variant)' }}>
                                                                {notification.message}
                                                            </p>
                                                        </div>
                                                        
                                                        {/* Delete button */}
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDelete(notification.id);
                                                            }}
                                                            className="shrink-0 p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                                                            title="Sil"
                                                        >
                                                            <X size={14} style={{ color: 'var(--color-on-surface-variant)' }} />
                                                        </button>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-xs flex items-center gap-1"
                                                              style={{ color: 'var(--color-on-surface-variant)' }}>
                                                            <Clock size={10} /> {formatTime(notification.timestamp)}
                                                        </span>
                                                        
                                                        {notification.dismissed && (
                                                            <span className="text-xs px-1.5 py-0.5 rounded"
                                                                  style={{ 
                                                                      backgroundColor: 'var(--color-surface)',
                                                                      color: 'var(--color-on-surface-variant)'
                                                                  }}>
                                                                Geri alındı
                                                            </span>
                                                        )}
                                                        
                                                        {canExpand && (
                                                            <ChevronDown 
                                                                size={14} 
                                                                className={`ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                                style={{ color: 'var(--color-on-surface-variant)' }}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Expanded Content */}
                                            {isExpanded && (
                                                <div className="border-t px-4 py-3 space-y-3"
                                                     style={{ 
                                                         borderColor: 'var(--color-outline-variant)',
                                                         backgroundColor: 'var(--color-surface)'
                                                     }}>
                                                    
                                                    {/* Diff View */}
                                                    {notification.diff && (
                                                        <div className="space-y-2">
                                                            {/* Before */}
                                                            <div>
                                                                <span className="text-xs font-semibold mb-1 block" 
                                                                      style={{ color: 'var(--color-error)' }}>
                                                                    Önceki:
                                                                </span>
                                                                <div 
                                                                    className="p-2 rounded-lg text-xs"
                                                                    style={{ 
                                                                        backgroundColor: 'rgba(234, 67, 53, 0.1)', 
                                                                        borderLeft: '3px solid var(--color-error)',
                                                                        color: 'var(--color-on-surface)'
                                                                    }}
                                                                >
                                                                    <p className="whitespace-pre-wrap break-words">
                                                                        {notification.diff.before}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            
                                                            {/* After */}
                                                            <div>
                                                                <span className="text-xs font-semibold mb-1 block" 
                                                                      style={{ color: 'var(--color-success)' }}>
                                                                    Sonraki:
                                                                </span>
                                                                <div 
                                                                    className="p-2 rounded-lg text-xs"
                                                                    style={{ 
                                                                        backgroundColor: 'rgba(52, 168, 83, 0.1)', 
                                                                        borderLeft: '3px solid var(--color-success)',
                                                                        color: 'var(--color-on-surface)'
                                                                    }}
                                                                >
                                                                    <p className="whitespace-pre-wrap break-words">
                                                                        {notification.diff.after}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Undo Button */}
                                                    {canUndo && (
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onUndo(notification);
                                                            }}
                                                            className="w-full text-sm py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                                            style={{ 
                                                                background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)',
                                                                color: 'white',
                                                                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                                                            }}
                                                        >
                                                            <Undo2 size={16} /> Geri Al
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
