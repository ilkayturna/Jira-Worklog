import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { Worklog, LoadingState, WorklogHistoryEntry, AppSettings } from '../types';
import { Clock, Edit3, Wand2, SpellCheck, Check, X, ExternalLink, Undo2, Redo2, Trash2, PieChart, Copy, CalendarDays, ExternalLink as LinkIcon, Sparkles, Brain } from 'lucide-react';
import { parseSmartTimeInput } from '../utils/adf';
import { IssueHoverCard } from './IssueHoverCard';
import { ContextMenu } from './ui/ContextMenu';
import { triggerHaptic } from '../utils/ui';

const MAX_HISTORY_SIZE = 20;

interface Props {
  worklogs: Worklog[];
  loading: LoadingState;
  onUpdate: (id: string, comment?: string, hours?: number, isUndoRedo?: boolean, newDate?: string) => Promise<void>;
  onImprove: (id: string) => Promise<void>;
  onSpellCheck: (id: string) => Promise<void>;
  jiraBaseUrl: string;
  worklogHistories: Map<string, { entries: WorklogHistoryEntry[]; index: number }>;
  onHistoryChange: (id: string, entries: WorklogHistoryEntry[], index: number) => void;
  onDelete?: (id: string) => Promise<void>;
  targetDailyHours?: number;
  settings: AppSettings;
  isAIProcessing?: boolean;
  aiProcessingMode?: 'IMPROVE' | 'SPELL' | null;
}

const getHourIndicator = (hours: number) => {
    if (hours >= 4) return { color: 'var(--color-error)', label: 'Uzun' };
    if (hours >= 2) return { color: 'var(--color-warning)', label: 'Orta' };
    if (hours >= 1) return { color: 'var(--color-success)', label: 'Normal' };
    return { color: 'var(--color-primary-500)', label: 'Kısa' };
};

const WorklogRow = memo<{ 
    wl: Worklog; 
    index: number;
    onUpdate: (id: string, comment?: string, hours?: number, isUndoRedo?: boolean, newDate?: string) => Promise<void>;
    onImprove: (id: string) => Promise<void>;
    onSpellCheck: (id: string) => Promise<void>;
    jiraBaseUrl: string;
    history: { entries: WorklogHistoryEntry[]; index: number } | undefined;
    onHistoryChange: (entries: WorklogHistoryEntry[], index: number) => void;
    onDelete?: (id: string) => Promise<void>;
    settings: AppSettings;
}>(({ wl, index, onUpdate, onImprove, onSpellCheck, jiraBaseUrl, history, onHistoryChange, onDelete, settings }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editComment, setEditComment] = useState(wl.comment);
    const [isProcessing, setIsProcessing] = useState(false);
    const [timeStr, setTimeStr] = useState(wl.hours.toFixed(2));
    const [isTimeEditing, setIsTimeEditing] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    const hourInfo = getHourIndicator(wl.hours);
    
    const entries = history?.entries || [];
    const historyIndex = history?.index ?? -1;
    const canUndo = entries.length > 0 && historyIndex < entries.length - 1;
    const canRedo = historyIndex > -1;

    useEffect(() => {
        if (!isEditing) setEditComment(wl.comment);
    }, [wl.comment, isEditing]);

    useEffect(() => {
        if (!isTimeEditing) setTimeStr(wl.hours.toFixed(2));
    }, [wl.hours, isTimeEditing]);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleMoveToTomorrow = async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split('T')[0];
        setIsProcessing(true);
        await onUpdate(wl.id, undefined, undefined, false, dateStr);
        setIsProcessing(false);
        triggerHaptic();
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(`${wl.issueKey} ${wl.summary}\n${wl.comment}`);
        triggerHaptic();
    };

    const saveToHistory = () => {
        const currentEntry: WorklogHistoryEntry = {
            comment: wl.comment,
            seconds: wl.seconds,
            timestamp: Date.now()
        };
        let newEntries = historyIndex > -1 ? entries.slice(historyIndex + 1) : [...entries];
        newEntries = [currentEntry, ...newEntries].slice(0, MAX_HISTORY_SIZE);
        onHistoryChange(newEntries, -1);
    };

    const handleSaveComment = async () => {
        if (editComment !== wl.comment) saveToHistory();
        setIsProcessing(true);
        await onUpdate(wl.id, editComment);
        setIsProcessing(false);
        setIsEditing(false);
    };

    const handleSaveTime = async () => {
        const parsed = parseSmartTimeInput(timeStr);
        if (parsed && parsed !== wl.hours) {
            saveToHistory();
            setIsProcessing(true);
            await onUpdate(wl.id, undefined, Math.round(parsed * 3600));
            setIsProcessing(false);
        } else {
            setTimeStr(wl.hours.toFixed(2));
        }
        setIsTimeEditing(false);
    };

    const handleImprove = async () => {
        saveToHistory();
        setIsProcessing(true);
        await onImprove(wl.id);
        setIsProcessing(false);
    };

    const handleSpellCheck = async () => {
        saveToHistory();
        setIsProcessing(true);
        await onSpellCheck(wl.id);
        setIsProcessing(false);
    };

    const handleUndo = async () => {
        if (!canUndo) return;
        if (historyIndex === -1) {
            const currentEntry: WorklogHistoryEntry = { comment: wl.comment, seconds: wl.seconds, timestamp: Date.now() };
            const newEntries = [currentEntry, ...entries].slice(0, MAX_HISTORY_SIZE);
            const targetEntry = newEntries[1];
            onHistoryChange(newEntries, 1);
            setIsProcessing(true);
            await onUpdate(wl.id, targetEntry.comment, targetEntry.seconds, true);
            setIsProcessing(false);
        } else {
            const newIndex = historyIndex + 1;
            const targetEntry = entries[newIndex];
            onHistoryChange(entries, newIndex);
            setIsProcessing(true);
            await onUpdate(wl.id, targetEntry.comment, targetEntry.seconds, true);
            setIsProcessing(false);
        }
    };

    const handleRedo = async () => {
        if (!canRedo) return;
        const newIndex = historyIndex - 1;
        if (newIndex === -1) {
            const targetEntry = entries[0];
            onHistoryChange(entries, -1);
            setIsProcessing(true);
            await onUpdate(wl.id, targetEntry.comment, targetEntry.seconds, true);
            setIsProcessing(false);
        } else {
            const targetEntry = entries[newIndex];
            onHistoryChange(entries, newIndex);
            setIsProcessing(true);
            await onUpdate(wl.id, targetEntry.comment, targetEntry.seconds, true);
            setIsProcessing(false);
        }
    };
    
    const handleDelete = async () => {
        if (!onDelete) return;
        if (window.confirm(`"${wl.issueKey}" worklog'unu silmek istediğinize emin misiniz?`)) {
            setIsProcessing(true);
            await onDelete(wl.id);
            setIsProcessing(false);
        }
    };

    return (
        <article 
            onContextMenu={handleContextMenu}
            className={`group relative transition-all duration-300 ${isProcessing ? 'opacity-60' : ''}`}
            style={{ 
                animationDelay: `${index * 50}ms`,
                background: 'var(--color-surface)',
                borderRadius: '20px',
                padding: '20px',
                border: '1px solid var(--color-outline-variant)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}
        >
            {/* Gradient accent line at top */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: '20px',
                right: '20px',
                height: '3px',
                background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-ai-400))',
                borderRadius: '0 0 4px 4px',
                opacity: 0.7
            }} />
            {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center z-10 rounded-2xl" style={{ backgroundColor: 'var(--color-surface)', opacity: 0.8 }}>
                    <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--color-primary-500)', borderTopColor: 'transparent' }} />
                </div>
            )}
            
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        <IssueHoverCard issueKey={wl.issueKey} jiraBaseUrl={jiraBaseUrl} settings={settings}>
                            <a href={`${jiraBaseUrl}/browse/${wl.issueKey}`} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 font-semibold text-sm hover:underline shrink-0"
                                style={{ color: 'var(--color-primary-600)' }}>
                                {wl.issueKey}
                                <ExternalLink size={12} className="opacity-50" />
                            </a>
                        </IssueHoverCard>
                        <span className="chip text-xs line-clamp-2 sm:truncate" style={{ maxWidth: '100%' }} title={wl.summary}>
                            {wl.summary}
                        </span>
                    </div>
                </div>
                <div className="shrink-0 self-end sm:self-auto">
                    {isTimeEditing ? (
                        <input value={timeStr} onChange={(e) => setTimeStr(e.target.value)} onBlur={handleSaveTime}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveTime()} autoFocus
                            className="w-20 px-2 py-1.5 text-center text-sm font-semibold rounded-lg"
                            style={{ fontFamily: 'var(--font-mono)', backgroundColor: 'var(--color-surface-container)', border: '2px solid var(--color-primary-500)' }} />
                    ) : (
                        <button onClick={() => setIsTimeEditing(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-full transition-all hover:scale-105 hover:shadow-lg"
                            style={{ 
                                background: `linear-gradient(135deg, ${hourInfo.color}20 0%, ${hourInfo.color}10 100%)`,
                                border: `2px solid ${hourInfo.color}40`,
                                backdropFilter: 'blur(8px)'
                            }}>
                            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: hourInfo.color, boxShadow: `0 0 8px ${hourInfo.color}` }} />
                            <span className="font-bold text-sm" style={{ fontFamily: 'var(--font-mono)', color: hourInfo.color }}>
                                {wl.hours.toFixed(2)}h
                            </span>
                        </button>
                    )}
                </div>
            </div>

            <div className="relative">
                {isEditing ? (
                    <div className="space-y-3">
                        <textarea value={editComment} onChange={(e) => setEditComment(e.target.value)}
                            className="w-full min-h-[100px] p-4 text-sm rounded-xl resize-none transition-all"
                            style={{ backgroundColor: 'var(--color-surface-container)', border: '2px solid var(--color-primary-500)', color: 'var(--color-on-surface)', outline: 'none' }}
                            placeholder="Worklog açıklaması..." />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsEditing(false)} className="btn-text" style={{ color: 'var(--color-on-surface-variant)' }}>
                                <X size={18}/> İptal
                            </button>
                            <button onClick={handleSaveComment} className="btn-filled">
                                <Check size={18}/> Kaydet
                            </button>
                        </div>
                    </div>
                ) : (
                    <div onClick={() => setIsEditing(true)}
                        className="p-4 text-sm rounded-2xl cursor-pointer transition-all group/comment hover:shadow-md"
                        style={{ 
                            background: 'linear-gradient(135deg, var(--color-surface-container) 0%, var(--color-surface-dim) 100%)',
                            color: 'var(--color-on-surface)', 
                            border: '1px solid var(--color-outline-variant)',
                            backdropFilter: 'blur(8px)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-primary-300)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-outline-variant)';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}>
                        <div className="flex items-start justify-between gap-3">
                            <p className="whitespace-pre-wrap leading-relaxed flex-1">
                                {wl.comment || <span style={{ color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>Açıklama girilmemiş. Düzenlemek için tıklayın...</span>}
                            </p>
                            <Edit3 size={16} className="shrink-0 opacity-0 group-hover/comment:opacity-50 transition-opacity mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }} />
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2 mt-4 pt-4 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200"
                style={{ borderTop: '1px solid var(--color-outline-variant)' }}>
                <div className="flex items-center gap-1">
                    <button onClick={handleUndo} disabled={!canUndo}
                        className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/10"
                        title={canUndo ? 'Geri Al' : 'Geri alınacak değişiklik yok'} style={{ color: 'var(--color-on-surface-variant)' }}>
                        <Undo2 size={16} />
                    </button>
                    <button onClick={handleRedo} disabled={!canRedo}
                        className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/10"
                        title={canRedo ? 'İleri Al' : 'İleri alınacak değişiklik yok'} style={{ color: 'var(--color-on-surface-variant)' }}>
                        <Redo2 size={16} />
                    </button>
                    {entries.length > 0 && (
                        <span className="text-xs ml-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                            {historyIndex === -1 ? '' : `${historyIndex + 1}/${entries.length}`}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={handleImprove} disabled={!wl.comment}
                        className="btn-ai-tonal text-xs px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed">
                        <Wand2 size={14} /> AI İyileştir
                    </button>
                    <button onClick={handleSpellCheck} disabled={!wl.comment}
                        className="btn-tonal text-xs px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed">
                        <SpellCheck size={14} /> İmla Düzelt
                    </button>
                    {onDelete && (
                        <button onClick={handleDelete}
                            className="btn-tonal text-xs px-3 py-2"
                            style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' }} title="Worklog'u sil">
                            <Trash2 size={14} /> Sil
                        </button>
                    )}
                </div>
            </div>

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    actions={[
                        { label: 'Kopyala', icon: <Copy size={14} />, onClick: handleCopy },
                        { label: 'Yarına Taşı', icon: <CalendarDays size={14} />, onClick: handleMoveToTomorrow },
                        { label: "Jira'da Aç", icon: <LinkIcon size={14} />, onClick: () => window.open(`${jiraBaseUrl}/browse/${wl.issueKey}`, '_blank') },
                    ]}
                />
            )}
        </article>
    );
};

export const WorklogList: React.FC<Props & { targetDailyHours?: number }> = ({ 
    worklogs, 
    loading, 
    onUpdate, 
    onImprove, 
    onSpellCheck, 
    jiraBaseUrl, 
    worklogHistories, 
    onHistoryChange,
    onDelete,
    targetDailyHours = 8,
    settings,
    isAIProcessing = false,
    aiProcessingMode = null
}) => {
    // AI Processing Overlay
    if (isAIProcessing) {
        return (
            <div className="relative">
                {/* AI Processing Skeleton Overlay */}
                <div className="flex flex-col gap-4">
                    {worklogs.slice(0, 3).map((wl, i) => (
                        <div key={wl.id} className="surface-card p-6 relative overflow-hidden">
                            {/* Pulsing glow effect */}
                            <div 
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                    background: aiProcessingMode === 'IMPROVE' 
                                        ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)'
                                        : 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.08) 100%)',
                                    animation: 'skeleton-pulse 1.5s ease-in-out infinite',
                                    animationDelay: `${i * 0.2}s`
                                }}
                            />
                            
                            {/* Header with real data but dimmed */}
                            <div className="flex justify-between items-start mb-4 opacity-50">
                                <div className="flex items-center gap-3">
                                    <div 
                                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                                        style={{ backgroundColor: 'var(--color-primary-100)' }}
                                    >
                                        {aiProcessingMode === 'IMPROVE' ? (
                                            <Brain size={20} className="animate-pulse" style={{ color: 'var(--color-ai-primary)' }} />
                                        ) : (
                                            <SpellCheck size={20} className="animate-pulse" style={{ color: 'var(--color-warning)' }} />
                                        )}
                                    </div>
                                    <div>
                                        <span className="font-mono text-sm font-semibold" style={{ color: 'var(--color-primary-600)' }}>
                                            {wl.issueKey}
                                        </span>
                                        <p className="text-xs truncate max-w-[200px]" style={{ color: 'var(--color-on-surface-variant)' }}>
                                            {wl.summary}
                                        </p>
                                    </div>
                                </div>
                                <div className="h-8 w-20 rounded-full skeleton" />
                            </div>
                            
                            {/* Comment skeleton with shimmer */}
                            <div className="space-y-2 mb-4">
                                <div className="h-4 rounded skeleton" style={{ width: '90%' }} />
                                <div className="h-4 rounded skeleton" style={{ width: '70%' }} />
                                <div className="h-4 rounded skeleton" style={{ width: '50%' }} />
                            </div>
                            
                            {/* Actions skeleton */}
                            <div className="flex justify-between items-center pt-4 border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
                                <div className="flex gap-2">
                                    <div className="h-8 w-8 rounded-lg skeleton" />
                                    <div className="h-8 w-8 rounded-lg skeleton" />
                                </div>
                                <div className="flex gap-2">
                                    <div className="h-8 w-24 rounded-full skeleton" />
                                    <div className="h-8 w-24 rounded-full skeleton" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                
                {/* Floating AI Status Indicator */}
                <div 
                    className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3"
                    style={{
                        background: aiProcessingMode === 'IMPROVE'
                            ? 'var(--gradient-ai)'
                            : 'linear-gradient(135deg, var(--color-warning) 0%, var(--color-warning-dark) 100%)',
                        color: 'white'
                    }}
                >
                    <div className="relative">
                        <Sparkles size={20} className="animate-pulse" />
                        <div className="absolute inset-0 animate-ping opacity-30">
                            <Sparkles size={20} />
                        </div>
                    </div>
                    <span className="font-medium">
                        {aiProcessingMode === 'IMPROVE' ? 'AI metinleri iyileştiriyor...' : 'AI imla kontrolü yapıyor...'}
                    </span>
                    <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0s' }} />
                        <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                </div>
            </div>
        );
    }

    if (loading === LoadingState.LOADING) {
        return (
            <div className="flex flex-col gap-4">
                {/* Modern Worklog Skeleton Cards */}
                {[1, 2, 3].map((i) => (
                    <div 
                        key={i} 
                        className="surface-card p-6 relative overflow-hidden"
                        style={{ 
                            animationDelay: `${i * 0.1}s`,
                            opacity: 1 - (i * 0.15) // Subtle fade for depth
                        }}
                    >
                        {/* Subtle gradient overlay for modern feel */}
                        <div 
                            className="absolute inset-0 pointer-events-none opacity-30"
                            style={{
                                background: 'linear-gradient(135deg, var(--color-primary-100) 0%, transparent 50%)'
                            }}
                        />
                        
                        {/* Header */}
                        <div className="flex justify-between items-start mb-4 relative">
                            <div className="flex items-center gap-3">
                                <div 
                                    className="w-11 h-11 rounded-xl skeleton"
                                    style={{ animationDelay: `${i * 0.15}s` }}
                                />
                                <div className="space-y-2.5">
                                    <div 
                                        className="h-4 w-20 rounded-md skeleton"
                                        style={{ animationDelay: `${i * 0.15 + 0.1}s` }}
                                    />
                                    <div 
                                        className="h-3 w-36 rounded skeleton"
                                        style={{ animationDelay: `${i * 0.15 + 0.2}s` }}
                                    />
                                </div>
                            </div>
                            <div 
                                className="h-9 w-24 rounded-full skeleton"
                                style={{ animationDelay: `${i * 0.15 + 0.1}s` }}
                            />
                        </div>
                        
                        {/* Comment Area */}
                        <div 
                            className="rounded-xl p-4 mb-4"
                            style={{ backgroundColor: 'var(--color-surface-container)' }}
                        >
                            <div className="space-y-2.5">
                                <div 
                                    className="h-3.5 rounded skeleton"
                                    style={{ width: '95%', animationDelay: `${i * 0.15 + 0.2}s` }}
                                />
                                <div 
                                    className="h-3.5 rounded skeleton"
                                    style={{ width: '80%', animationDelay: `${i * 0.15 + 0.3}s` }}
                                />
                                <div 
                                    className="h-3.5 rounded skeleton"
                                    style={{ width: '60%', animationDelay: `${i * 0.15 + 0.4}s` }}
                                />
                            </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex justify-between items-center pt-4 border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
                            <div className="flex gap-2">
                                <div 
                                    className="h-9 w-9 rounded-lg skeleton"
                                    style={{ animationDelay: `${i * 0.15 + 0.3}s` }}
                                />
                                <div 
                                    className="h-9 w-9 rounded-lg skeleton"
                                    style={{ animationDelay: `${i * 0.15 + 0.35}s` }}
                                />
                            </div>
                            <div className="flex gap-2">
                                <div 
                                    className="h-9 w-28 rounded-full skeleton"
                                    style={{ animationDelay: `${i * 0.15 + 0.4}s` }}
                                />
                                <div 
                                    className="h-9 w-24 rounded-full skeleton"
                                    style={{ animationDelay: `${i * 0.15 + 0.45}s` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                
                {/* Loading indicator at bottom */}
                <div className="flex items-center justify-center py-4 gap-2" style={{ color: 'var(--color-on-surface-variant)' }}>
                    <Clock size={16} className="animate-pulse" />
                    <span className="text-sm font-medium">Worklog'lar yükleniyor...</span>
                </div>
            </div>
        );
    }

    if (worklogs.length === 0) {
        return (
            <div className="text-center py-16 px-6 rounded-2xl" style={{ backgroundColor: 'var(--color-surface-container)', border: '2px dashed var(--color-outline)' }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--color-surface-container-high)' }}>
                    <Clock size={28} style={{ color: 'var(--color-on-surface-variant)' }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>Worklog Bulunamadı</h3>
                <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--color-on-surface-variant)' }}>
                    Bu tarih için kayıtlı worklog yok. Farklı bir tarih seçin veya Jira bağlantınızı kontrol edin.
                </p>
            </div>
        );
    }

    // Memoize history change handler
    const handleHistoryChange = useCallback((worklogId: string) => (entries: WorklogHistoryEntry[], idx: number) => {
        onHistoryChange(worklogId, entries, idx);
    }, [onHistoryChange]);

    return (
        <div 
            className="flex flex-col gap-4 stagger-animation"
            role="list"
            aria-label="Worklog listesi"
        >
            {worklogs.map((wl, index) => (
                <WorklogRow 
                    key={wl.id} 
                    wl={wl} 
                    index={index} 
                    onUpdate={onUpdate} 
                    onImprove={onImprove} 
                    onSpellCheck={onSpellCheck}
                    jiraBaseUrl={jiraBaseUrl} 
                    history={worklogHistories.get(wl.id)} 
                    onHistoryChange={handleHistoryChange(wl.id)} 
                    onDelete={onDelete} 
                    settings={settings} 
                />
            ))}
        </div>
    );
};

// Memoized export for better performance
export const MemoizedWorklogList = memo(WorklogList);
