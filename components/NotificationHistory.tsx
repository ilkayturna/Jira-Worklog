import React, { useState } from 'react';
import { X, Bell, Undo2, CheckCircle2, AlertCircle, Info, Clock, Trash2, ChevronRight, ChevronDown, GitCompare } from 'lucide-react';
import { NotificationHistoryItem } from '../types';

interface NotificationHistoryProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: NotificationHistoryItem[];
    onUndo: (notification: NotificationHistoryItem) => void;
    onClear: () => void;
}

// Diff renderer component
const DiffView: React.FC<{ before: string; after: string; issueKey?: string }> = ({ before, after, issueKey }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    return (
        <div className="mt-2 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--color-outline-variant)' }}>
            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium"
                style={{ backgroundColor: 'var(--color-surface-variant)' }}
            >
                <span className="flex items-center gap-2">
                    <GitCompare size={14} />
                    {issueKey && <span className="font-bold">{issueKey}</span>}
                    Değişiklikleri Göster
                </span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            
            {isExpanded && (
                <div className="p-3 space-y-2 text-xs" style={{ backgroundColor: 'var(--color-surface)' }}>
                    {/* Before */}
                    <div>
                        <span className="font-semibold text-xs mb-1 block" style={{ color: 'var(--color-error)' }}>
                            Önceki:
                        </span>
                        <div 
                            className="p-2 rounded border-l-4"
                            style={{ 
                                backgroundColor: 'rgba(234, 67, 53, 0.1)', 
                                borderColor: 'var(--color-error)',
                                color: 'var(--color-on-surface)'
                            }}
                        >
                            <p className="whitespace-pre-wrap break-words">{before}</p>
                        </div>
                    </div>
                    
                    {/* After */}
                    <div>
                        <span className="font-semibold text-xs mb-1 block" style={{ color: 'var(--color-success)' }}>
                            Sonraki:
                        </span>
                        <div 
                            className="p-2 rounded border-l-4"
                            style={{ 
                                backgroundColor: 'rgba(52, 168, 83, 0.1)', 
                                borderColor: 'var(--color-success)',
                                color: 'var(--color-on-surface)'
                            }}
                        >
                            <p className="whitespace-pre-wrap break-words">{after}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const NotificationHistory: React.FC<NotificationHistoryProps> = ({
    isOpen,
    onClose,
    notifications,
    onUndo,
    onClear
}) => {
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

    const getUndoLabel = (notification: NotificationHistoryItem) => {
        if (!notification.undoAction) return null;
        
        switch (notification.undoAction.type) {
            case 'CREATE':
                return 'Eklemeyi Geri Al';
            case 'UPDATE':
                return 'Değişikliği Geri Al';
            case 'BATCH_UPDATE':
                return `${notification.undoAction.data.length} işlemi geri al`;
            case 'BATCH_CREATE':
                return `${notification.undoAction.data.length} eklemeyi geri al`;
            default:
                return 'Geri Al';
        }
    };

    const undoableNotifications = notifications.filter(n => n.undoAction && !n.dismissed);
    const otherNotifications = notifications.filter(n => !n.undoAction || n.dismissed);

    return (
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />
            
            {/* Side Panel */}
            <div 
                className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 animate-slide-in-right"
                style={{ animationDuration: '200ms' }}
            >
                <div 
                    className="h-full flex flex-col"
                    style={{ 
                        backgroundColor: 'var(--color-surface)',
                        boxShadow: 'var(--elevation-4)'
                    }}
                >
                    {/* Header */}
                    <div className="px-6 py-5 border-b flex items-center justify-between shrink-0"
                         style={{ borderColor: 'var(--color-outline-variant)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" 
                                 style={{ backgroundColor: 'var(--color-secondary-container)' }}>
                                <Bell size={20} style={{ color: 'var(--color-on-surface)' }} />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                                    Bildirim Geçmişi
                                </h2>
                                <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                    {notifications.length} bildirim
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {notifications.length > 0 && (
                                <button 
                                    onClick={onClear} 
                                    className="btn-icon"
                                    title="Tümünü temizle"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                            <button onClick={onClose} className="btn-icon">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                                     style={{ backgroundColor: 'var(--color-surface-variant)' }}>
                                    <Bell size={28} style={{ color: 'var(--color-on-surface-variant)' }} />
                                </div>
                                <p className="font-medium" style={{ color: 'var(--color-on-surface)' }}>
                                    Bildirim yok
                                </p>
                                <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                                    Yapılan işlemler burada görünecek
                                </p>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                {/* Undoable Section */}
                                {undoableNotifications.length > 0 && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-3 px-2">
                                            <Undo2 size={14} style={{ color: 'var(--color-primary-600)' }} />
                                            <span className="text-xs font-semibold uppercase tracking-wider"
                                                  style={{ color: 'var(--color-primary-600)' }}>
                                                Geri Alınabilir İşlemler
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {undoableNotifications.map(notification => (
                                                <div 
                                                    key={notification.id}
                                                    className="p-4 rounded-xl border transition-all hover:scale-[1.01]"
                                                    style={{ 
                                                        backgroundColor: 'var(--color-primary-container)',
                                                        borderColor: 'var(--color-primary-600)'
                                                    }}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        {getIcon(notification.type)}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-semibold text-sm" 
                                                               style={{ color: 'var(--color-on-surface)' }}>
                                                                {notification.title}
                                                            </p>
                                                            <p className="text-xs mt-0.5 line-clamp-2"
                                                               style={{ color: 'var(--color-on-surface-variant)' }}>
                                                                {notification.message}
                                                            </p>
                                                            <div className="flex items-center justify-between mt-3">
                                                                <span className="text-xs flex items-center gap-1"
                                                                      style={{ color: 'var(--color-on-surface-variant)' }}>
                                                                    <Clock size={12} /> {formatTime(notification.timestamp)}
                                                                </span>
                                                                <button 
                                                                    onClick={() => onUndo(notification)}
                                                                    className="btn-tonal text-xs py-1.5 px-3"
                                                                    style={{ 
                                                                        backgroundColor: 'var(--color-surface)',
                                                                        color: 'var(--color-primary-600)'
                                                                    }}
                                                                >
                                                                    <Undo2 size={14} /> {getUndoLabel(notification)}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Other Notifications */}
                                {otherNotifications.length > 0 && (
                                    <div>
                                        {undoableNotifications.length > 0 && (
                                            <div className="flex items-center gap-2 mb-3 px-2 mt-6">
                                                <Clock size={14} style={{ color: 'var(--color-on-surface-variant)' }} />
                                                <span className="text-xs font-semibold uppercase tracking-wider"
                                                      style={{ color: 'var(--color-on-surface-variant)' }}>
                                                    Geçmiş
                                                </span>
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            {otherNotifications.map(notification => (
                                                <div 
                                                    key={notification.id}
                                                    className="p-3 rounded-xl"
                                                    style={{ 
                                                        backgroundColor: notification.dismissed 
                                                            ? 'var(--color-surface-variant)' 
                                                            : 'var(--color-surface-elevated)',
                                                        opacity: notification.dismissed ? 0.6 : 1
                                                    }}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        {getIcon(notification.type)}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-sm" 
                                                               style={{ color: 'var(--color-on-surface)' }}>
                                                                {notification.title}
                                                            </p>
                                                            <p className="text-xs mt-0.5 line-clamp-1"
                                                               style={{ color: 'var(--color-on-surface-variant)' }}>
                                                                {notification.message}
                                                            </p>
                                                            
                                                            {/* Show diff for AI changes */}
                                                            {notification.diff && (
                                                                <DiffView 
                                                                    before={notification.diff.before}
                                                                    after={notification.diff.after}
                                                                    issueKey={notification.diff.issueKey}
                                                                />
                                                            )}
                                                            
                                                            <span className="text-xs mt-2 flex items-center gap-1"
                                                                  style={{ color: 'var(--color-on-surface-variant)' }}>
                                                                <Clock size={10} /> {formatTime(notification.timestamp)}
                                                                {notification.dismissed && (
                                                                    <span className="ml-2 text-xs px-2 py-0.5 rounded"
                                                                          style={{ backgroundColor: 'var(--color-surface)' }}>
                                                                        Geri alındı
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer - Quick Actions */}
                    {undoableNotifications.length > 1 && (
                        <div className="p-4 border-t shrink-0" style={{ borderColor: 'var(--color-outline-variant)' }}>
                            <button 
                                onClick={() => undoableNotifications.forEach(n => onUndo(n))}
                                className="btn-outlined w-full"
                            >
                                <Undo2 size={18} /> Tüm İşlemleri Geri Al ({undoableNotifications.length})
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};
