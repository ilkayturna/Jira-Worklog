
import React, { useState, useEffect } from 'react';
import { Worklog, LoadingState, WorklogHistoryEntry } from '../types';
import { Clock, Edit3, Wand2, SpellCheck, Check, X, ExternalLink, Undo2, Redo2 } from 'lucide-react';
import { parseSmartTimeInput } from '../utils/adf';

const MAX_HISTORY_SIZE = 20;

interface Props {
  worklogs: Worklog[];
  loading: LoadingState;
  onUpdate: (id: string, comment?: string, hours?: number, isUndoRedo?: boolean) => Promise<void>;
  onImprove: (id: string) => Promise<void>;
  onSpellCheck: (id: string) => Promise<void>;
  jiraBaseUrl: string;
  worklogHistories: Map<string, { entries: WorklogHistoryEntry[]; index: number }>;
  onHistoryChange: (id: string, entries: WorklogHistoryEntry[], index: number) => void;
}

const getHourIndicator = (hours: number) => {
    if (hours >= 4) return { color: '#ea4335', label: 'Uzun' };
    if (hours >= 2) return { color: '#f9ab00', label: 'Orta' };
    if (hours >= 1) return { color: '#34a853', label: 'Normal' };
    return { color: '#4285f4', label: 'Kısa' };
};

const WorklogRow: React.FC<{ 
    wl: Worklog; 
    index: number;
    onUpdate: (id: string, comment?: string, hours?: number, isUndoRedo?: boolean) => Promise<void>;
    onImprove: (id: string) => Promise<void>;
    onSpellCheck: (id: string) => Promise<void>;
    jiraBaseUrl: string;
    history: { entries: WorklogHistoryEntry[]; index: number } | undefined;
    onHistoryChange: (entries: WorklogHistoryEntry[], index: number) => void;
}> = ({ wl, index, onUpdate, onImprove, onSpellCheck, jiraBaseUrl, history, onHistoryChange }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editComment, setEditComment] = useState(wl.comment);
    const [isProcessing, setIsProcessing] = useState(false);
    const [timeStr, setTimeStr] = useState(wl.hours.toFixed(2));
    const [isTimeEditing, setIsTimeEditing] = useState(false);

    const hourInfo = getHourIndicator(wl.hours);
    
    // History state
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

    // Save current state to history before making changes
    const saveToHistory = () => {
        const currentEntry: WorklogHistoryEntry = {
            comment: wl.comment,
            seconds: wl.seconds,
            timestamp: Date.now()
        };
        
        // If we're not at the latest point, remove future entries
        let newEntries = historyIndex > -1 
            ? entries.slice(historyIndex + 1) 
            : [...entries];
        
        // Add current state to history
        newEntries = [currentEntry, ...newEntries].slice(0, MAX_HISTORY_SIZE);
        
        onHistoryChange(newEntries, -1);
    };

    const handleSaveComment = async () => {
        if (editComment !== wl.comment) {
            saveToHistory();
        }
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
    }

    const handleSpellCheck = async () => {
        saveToHistory();
        setIsProcessing(true);
        await onSpellCheck(wl.id);
        setIsProcessing(false);
    }

    const handleUndo = async () => {
        if (!canUndo) return;
        
        // İlk geri alma ise mevcut durumu kaydet
        if (historyIndex === -1) {
            const currentEntry: WorklogHistoryEntry = {
                comment: wl.comment,
                seconds: wl.seconds,
                timestamp: Date.now()
            };
            // Mevcut durumu başa ekle ve index'i 1 yap (ilk eski kayda git)
            const newEntries = [currentEntry, ...entries].slice(0, MAX_HISTORY_SIZE);
            const targetEntry = newEntries[1]; // Bir önceki durum
            
            onHistoryChange(newEntries, 1);
            setIsProcessing(true);
            await onUpdate(wl.id, targetEntry.comment, targetEntry.seconds, true); // isUndoRedo=true
            setIsProcessing(false);
        } else {
            // Zaten history'de geziniyoruz, sadece index'i artır
            const newIndex = historyIndex + 1;
            const targetEntry = entries[newIndex];
            
            onHistoryChange(entries, newIndex);
            setIsProcessing(true);
            await onUpdate(wl.id, targetEntry.comment, targetEntry.seconds, true); // isUndoRedo=true
            setIsProcessing(false);
        }
    };

    const handleRedo = async () => {
        if (!canRedo) return;
        
        const newIndex = historyIndex - 1;
        
        // newIndex -1 ise en son duruma (entries[0]) dönüyoruz
        if (newIndex === -1) {
            // entries[0] mevcut durumu içeriyor (ilk undo'da kaydedildi)
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

    return (
        <article 
            className={`group relative surface-card p-4 md:p-5 transition-all duration-200 ${isProcessing ? 'opacity-60' : ''}`}
            style={{ animationDelay: `${index * 50}ms` }}
        >
            {/* Processing Overlay */}
            {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center z-10 rounded-2xl" style={{ backgroundColor: 'var(--color-surface)', opacity: 0.8 }}>
                    <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--color-primary-500)', borderTopColor: 'transparent' }} />
                </div>
            )}
            
            {/* Header Row */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-4">
                {/* Issue Info */}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        <a 
                            href={`${jiraBaseUrl}/browse/${wl.issueKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-semibold text-sm hover:underline shrink-0"
                            style={{ color: 'var(--color-primary-600)' }}
                        >
                            {wl.issueKey}
                            <ExternalLink size={12} className="opacity-50" />
                        </a>
                        <span 
                            className="chip text-xs line-clamp-2 sm:truncate"
                            style={{ maxWidth: '100%' }}
                            title={wl.summary}
                        >
                            {wl.summary}
                        </span>
                    </div>
                </div>

                {/* Time Display */}
                <div className="shrink-0 self-end sm:self-auto">
                    {isTimeEditing ? (
                        <div className="flex items-center gap-1">
                            <input
                                value={timeStr}
                                onChange={(e) => setTimeStr(e.target.value)}
                                onBlur={handleSaveTime}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveTime()}
                                autoFocus
                                className="w-20 px-2 py-1.5 text-center text-sm font-semibold rounded-lg"
                                style={{ 
                                    fontFamily: 'var(--font-mono)',
                                    backgroundColor: 'var(--color-surface-container)',
                                    border: '2px solid var(--color-primary-500)'
                                }}
                            />
                        </div>
                    ) : (
                        <button 
                            onClick={() => setIsTimeEditing(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all hover:scale-105"
                            style={{ 
                                backgroundColor: `${hourInfo.color}15`,
                                border: `1px solid ${hourInfo.color}30`
                            }}
                        >
                            <div 
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: hourInfo.color }}
                            />
                            <span 
                                className="font-semibold text-sm"
                                style={{ fontFamily: 'var(--font-mono)', color: hourInfo.color }}
                            >
                                {wl.hours.toFixed(2)}h
                            </span>
                        </button>
                    )}
                </div>
            </div>

            {/* Comment Section */}
            <div className="relative">
                {isEditing ? (
                    <div className="space-y-3">
                        <textarea
                            value={editComment}
                            onChange={(e) => setEditComment(e.target.value)}
                            className="w-full min-h-[100px] p-4 text-sm rounded-xl resize-none transition-all"
                            style={{
                                backgroundColor: 'var(--color-surface-container)',
                                border: '2px solid var(--color-primary-500)',
                                color: 'var(--color-on-surface)',
                                outline: 'none'
                            }}
                            placeholder="Worklog açıklaması..."
                        />
                        <div className="flex justify-end gap-2">
                            <button 
                                onClick={() => setIsEditing(false)} 
                                className="btn-text"
                                style={{ color: 'var(--color-on-surface-variant)' }}
                            >
                                <X size={18}/> İptal
                            </button>
                            <button 
                                onClick={handleSaveComment} 
                                className="btn-filled"
                            >
                                <Check size={18}/> Kaydet
                            </button>
                        </div>
                    </div>
                ) : (
                    <div 
                        onClick={() => setIsEditing(true)}
                        className="p-4 text-sm rounded-xl cursor-pointer transition-all group/comment"
                        style={{
                            backgroundColor: 'var(--color-surface-container)',
                            color: 'var(--color-on-surface)',
                            border: '1px solid transparent'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-outline)'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <p className="whitespace-pre-wrap leading-relaxed flex-1">
                                {wl.comment || <span style={{ color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>Açıklama girilmemiş. Düzenlemek için tıklayın...</span>}
                            </p>
                            <Edit3 
                                size={16} 
                                className="shrink-0 opacity-0 group-hover/comment:opacity-50 transition-opacity mt-0.5"
                                style={{ color: 'var(--color-on-surface-variant)' }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Action Buttons - Show on Hover */}
            <div 
                className="flex justify-between items-center gap-2 mt-4 pt-4 opacity-0 group-hover:opacity-100 transition-all duration-200"
                style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
                {/* Undo/Redo Buttons */}
                <div className="flex items-center gap-1">
                    <button 
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/10"
                        title={canUndo ? `Geri Al` : 'Geri alınacak değişiklik yok'}
                        style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                        <Undo2 size={16} />
                    </button>
                    <button 
                        onClick={handleRedo}
                        disabled={!canRedo}
                        className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/10"
                        title={canRedo ? `İleri Al` : 'İleri alınacak değişiklik yok'}
                        style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                        <Redo2 size={16} />
                    </button>
                    {entries.length > 0 && (
                        <span className="text-xs ml-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                            {historyIndex === -1 ? '' : `${historyIndex + 1}/${entries.length}`}
                        </span>
                    )}
                </div>

                {/* AI Buttons */}
                <div className="flex gap-2">
                    <button 
                        onClick={handleImprove}
                        disabled={!wl.comment}
                        className="btn-tonal text-xs px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ 
                            backgroundColor: 'rgba(156, 39, 176, 0.1)', 
                            color: '#9c27b0' 
                        }}
                    >
                        <Wand2 size={14} /> AI İyileştir
                    </button>
                    <button 
                        onClick={handleSpellCheck}
                        disabled={!wl.comment}
                        className="btn-tonal text-xs px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <SpellCheck size={14} /> İmla Düzelt
                    </button>
                </div>
            </div>
        </article>
    );
};

export const WorklogList: React.FC<Props> = ({ 
    worklogs, 
    loading, 
    onUpdate, 
    onImprove, 
    onSpellCheck, 
    jiraBaseUrl,
    worklogHistories,
    onHistoryChange
}) => {
    if (loading === LoadingState.LOADING) {
        return (
            <div className="space-y-4 stagger-animation">
                {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton h-36 rounded-2xl" />
                ))}
            </div>
        );
    }

    if (worklogs.length === 0) {
        return (
            <div 
                className="text-center py-16 px-6 rounded-2xl"
                style={{ 
                    backgroundColor: 'var(--color-surface-container)',
                    border: '2px dashed var(--color-outline)'
                }}
            >
                <div 
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: 'var(--color-surface-container-high)' }}
                >
                    <Clock size={28} style={{ color: 'var(--color-on-surface-variant)' }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
                    Worklog Bulunamadı
                </h3>
                <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--color-on-surface-variant)' }}>
                    Bu tarih için kayıtlı worklog yok. Farklı bir tarih seçin veya Jira bağlantınızı kontrol edin.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4 stagger-animation">
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
                    onHistoryChange={(entries, idx) => onHistoryChange(wl.id, entries, idx)}
                />
            ))}
        </div>
    );
};
