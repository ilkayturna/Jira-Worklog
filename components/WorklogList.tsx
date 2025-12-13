import React, { useState, useEffect, useMemo } from 'react';
import { Worklog, LoadingState, WorklogHistoryEntry, AppSettings } from '../types';
import { Clock, Edit3, Wand2, SpellCheck, Check, X, Undo2, Redo2, Trash2, PieChart, Copy, CalendarDays, ExternalLink as LinkIcon, Sparkles, Brain, GripVertical } from 'lucide-react';
import { parseSmartTimeInput } from '../utils/adf';
import { IssueHoverCard } from './IssueHoverCard';
import { ContextMenu } from './ui/ContextMenu';
import { normalizeJiraBaseUrl, triggerHaptic } from '../utils/ui';
import { useIsMobile } from '../hooks/useIsMobile';

const MAX_HISTORY_SIZE = 20;

interface Props {
  worklogs: Worklog[];
  loading: LoadingState;
    onUpdate: (id: string, comment?: string, seconds?: number, isUndoRedo?: boolean, newDate?: string) => Promise<void>;
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
  selectedDate?: string;
}

// AI-based worklog intensity analyzer - İş yoğunluğuna göre renk belirleme
// 🔴 Kırmızı: Yoğun/karmaşık iş (bug fix, acil, production, hata, kritik)
// 🔵 Mavi: Normal/rutin iş (toplantı, dokümantasyon, analiz)
// 🟢 Yeşil: Hafif iş (küçük düzenleme, inceleme, test)
const tokenize = (input: string): string[] => {
    if (!input) return [];
    // Unicode-aware tokens: letters + numbers
    const tokens = input
        .toLowerCase()
        .normalize('NFKC')
        .match(/[\p{L}\p{N}]+/gu);
    return tokens ?? [];
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const h = hex.trim();
    const m = /^#?([0-9a-fA-F]{6})$/.exec(h);
    if (!m) return null;
    const intVal = parseInt(m[1], 16);
    return {
        r: (intVal >> 16) & 255,
        g: (intVal >> 8) & 255,
        b: intVal & 255
    };
};

const withAlpha = (hex: string, alpha: number): string => {
    const rgb = hexToRgb(hex);
    const a = Math.max(0, Math.min(1, alpha));
    if (!rgb) return hex;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
};

const analyzeWorklogIntensity = (comment: string, hours: number, summary: string): { color: string; intensity: 'high' | 'medium' | 'low'; label: string } => {
    const combinedTokens = tokenize(`${comment} ${summary}`);
    const commentTokens = tokenize(comment);
    const tokenSet = new Set(combinedTokens);

    type KeywordRule = { k: string; w: number; mode?: 'exact' | 'prefix' };
    const rules: KeywordRule[] = [
        // High intensity (red)
        { k: 'bug', w: 3 },
        { k: 'hata', w: 3 },
        { k: 'fix', w: 3, mode: 'prefix' },
        { k: 'düzeltme', w: 3 },
        { k: 'acil', w: 3 },
        { k: 'urgent', w: 3 },
        { k: 'kritik', w: 3 },
        { k: 'critical', w: 3 },
        { k: 'production', w: 3 },
        { k: 'prod', w: 2 },
        { k: 'canlı', w: 3 },
        { k: 'live', w: 2 },
        { k: 'hotfix', w: 3 },
        { k: 'sorun', w: 2 },
        { k: 'problem', w: 2 },
        { k: 'refactor', w: 3, mode: 'prefix' },
        { k: 'entegrasyon', w: 3 },
        { k: 'integration', w: 3 },
        { k: 'migration', w: 3, mode: 'prefix' },
        { k: 'taşıma', w: 3 },
        { k: 'dönüşüm', w: 3 },
        { k: 'performans', w: 3 },
        { k: 'optimization', w: 3, mode: 'prefix' },
        { k: 'kompleks', w: 2 },
        { k: 'karmaşık', w: 2 },

        // Medium intensity (blue)
        { k: 'toplantı', w: 1 },
        { k: 'meeting', w: 1 },
        { k: 'görüşme', w: 1 },
        { k: 'analiz', w: 1 },
        { k: 'analysis', w: 1 },
        { k: 'inceleme', w: 1 },
        { k: 'dokümantasyon', w: 1 },
        { k: 'documentation', w: 1 },
        { k: 'rapor', w: 1 },
        { k: 'report', w: 1 },
        { k: 'planlama', w: 1 },
        { k: 'tasarım', w: 1 },
        { k: 'design', w: 1 },
        { k: 'konfigürasyon', w: 1 },
        { k: 'configuration', w: 1 },
        { k: 'ayar', w: 1 },
        { k: 'destek', w: 1 },
        { k: 'support', w: 1 },
        { k: 'review', w: 1 },
        { k: 'test', w: 1 },
        { k: 'qa', w: 1 },
        { k: 'doğrulama', w: 1 },
        { k: 'validation', w: 1 },

        // Low intensity (green)
        { k: 'küçük', w: -1 },
        { k: 'minor', w: -1 },
        { k: 'basit', w: -1 },
        { k: 'simple', w: -1 },
        { k: 'düzenleme', w: -1 },
        { k: 'update', w: -1, mode: 'prefix' },
        { k: 'güncelleme', w: -1 },
        { k: 'değişiklik', w: -1 },
        { k: 'change', w: -1 },
        { k: 'ekleme', w: -1 },
        { k: 'add', w: -1 }
    ];

    let score = 0;

    for (const rule of rules) {
        if (rule.mode === 'prefix') {
            // Avoid very short prefixes causing false positives
            if (rule.k.length < 3) continue;
            if (combinedTokens.some(t => t.startsWith(rule.k))) score += rule.w;
        } else {
            if (tokenSet.has(rule.k)) score += rule.w;
        }
    }

    // Hours factor (smooth-ish, avoids big jumps)
    if (hours >= 6) score += 5;
    else if (hours >= 4) score += 4;
    else if (hours >= 2) score += 2;
    else if (hours < 0.5) score -= 2;

    // Comment detail factor
    const wc = commentTokens.length;
    if (wc >= 30) score += 2;
    else if (wc >= 14) score += 1;
    else if (wc <= 2) score -= 1;

    // Slight boost for explicit technical signals (error codes, stack traces)
    if (/\b\d{3}\b/.test(comment) || /exception|stack|trace|error/i.test(comment)) score += 1;

    // Keep score in a reasonable range (prevents outliers)
    score = Math.max(-4, Math.min(14, score));

    // Decision thresholds (wider bands => fewer flips)
    if (score >= 7) {
        return { 
            color: '#EF4444', // Kırmızı
            intensity: 'high',
            label: 'Yoğun'
        };
    } else if (score >= 2) {
        return { 
            color: '#3B82F6', // Mavi
            intensity: 'medium',
            label: 'Normal'
        };
    } else {
        return { 
            color: '#10B981', // Yeşil
            intensity: 'low',
            label: 'Hafif'
        };
    }
};

const getHourIndicator = (hours: number) => {
    if (hours >= 4) return { color: 'var(--color-error)', label: 'Uzun' };
    if (hours >= 2) return { color: 'var(--color-warning)', label: 'Orta' };
    if (hours >= 1) return { color: 'var(--color-success)', label: 'Normal' };
    return { color: 'var(--color-primary-500)', label: 'Kısa' };
};

const WorklogRow: React.FC<{ 
    wl: Worklog; 
    index: number;
    onUpdate: (id: string, comment?: string, seconds?: number, isUndoRedo?: boolean, newDate?: string) => Promise<void>;
    onImprove: (id: string) => Promise<void>;
    onSpellCheck: (id: string) => Promise<void>;
    jiraBaseUrl: string;
    history: { entries: WorklogHistoryEntry[]; index: number } | undefined;
    onHistoryChange: (entries: WorklogHistoryEntry[], index: number) => void;
    onDelete?: (id: string) => Promise<void>;
    settings: AppSettings;
    selectedDate?: string;
}> = ({ wl, index, onUpdate, onImprove, onSpellCheck, jiraBaseUrl, history, onHistoryChange, onDelete, settings, selectedDate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editComment, setEditComment] = useState(wl.comment);
    const [isProcessing, setIsProcessing] = useState(false);
    const [timeStr, setTimeStr] = useState(wl.hours.toFixed(2));
    const [isTimeEditing, setIsTimeEditing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    
    // Mobilde drag & drop devre dışı
    const isMobile = useIsMobile();

    const normalizedJiraBaseUrl = useMemo(() => normalizeJiraBaseUrl(jiraBaseUrl), [jiraBaseUrl]);

    const handleDrag = (e: React.DragEvent) => {
        if (isMobile) return;
        // Auto-scroll while dragging so WeeklyChart drop targets are reachable
        const edgeThresholdPx = 90;
        const scrollStepPx = 22;
        const y = e.clientY;
        if (!y) return;
        if (y < edgeThresholdPx) {
            window.scrollBy({ top: -scrollStepPx, left: 0 });
        } else if (y > window.innerHeight - edgeThresholdPx) {
            window.scrollBy({ top: scrollStepPx, left: 0 });
        }
    };

    // AI-based intensity analysis for color coding
    const intensityInfo = useMemo(() => 
        analyzeWorklogIntensity(wl.comment, wl.hours, wl.summary),
        [wl.comment, wl.hours, wl.summary]
    );
    
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
        const base = selectedDate ? new Date(selectedDate) : new Date();
        base.setDate(base.getDate() + 1);
        const dateStr = base.toISOString().split('T')[0];
        setIsProcessing(true);
        await onUpdate(wl.id, undefined, undefined, false, dateStr);
        setIsProcessing(false);
        triggerHaptic();
    };

    const handleCopy = () => {
        try {
            navigator.clipboard.writeText(`${wl.issueKey} ${wl.summary}\n${wl.comment}`);
            triggerHaptic();
        } catch {
            // Ignore clipboard failures (non-secure context / denied permissions)
        }
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
    
    // Drag handlers - Mobilde devre dışı
    const handleDragStart = (e: React.DragEvent) => {
        if (isMobile) {
            e.preventDefault();
            return;
        }
        setIsDragging(true);
        e.dataTransfer.setData('application/worklog', JSON.stringify({
            worklogId: wl.id,
            issueKey: wl.issueKey,
            currentDate: wl.started?.split('T')[0] || selectedDate
        }));
        e.dataTransfer.effectAllowed = 'move';
        triggerHaptic();
    };
    
    const handleDragEnd = () => {
        setIsDragging(false);
    };

    return (
        <article 
            onContextMenu={handleContextMenu}
            draggable={!isMobile}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            className={`group relative transition-all duration-300 ${isProcessing ? 'opacity-60' : ''} ${isDragging ? 'opacity-50 scale-95 cursor-grabbing' : ''} ${!isMobile ? 'cursor-grab' : ''}`}
            style={{ 
                animationDelay: `${index * 50}ms`,
                background: 'var(--color-surface)',
                borderRadius: '20px',
                padding: '20px',
                border: isDragging ? '2px dashed var(--color-primary-500)' : '1px solid var(--color-outline-variant)',
                boxShadow: isDragging ? '0 8px 32px rgba(59, 130, 246, 0.2)' : '0 4px 20px rgba(0,0,0,0.04)',
            }}
        >
            {/* Drag Handle - Only show on desktop */}
            {!isMobile && (
                <div 
                    className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1"
                    title="Sürükleyerek başka güne taşı"
                >
                    <GripVertical size={16} style={{ color: 'var(--color-on-surface-variant)' }} />
                </div>
            )}
            {/* Gradient accent line at top - color based on intensity */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: '20px',
                right: '20px',
                height: '3px',
                background: `linear-gradient(90deg, ${intensityInfo.color}, ${withAlpha(intensityInfo.color, 0.5)})`,
                borderRadius: '0 0 4px 4px',
                opacity: 0.8
            }} />
            {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center z-10 rounded-2xl" style={{ backgroundColor: 'var(--color-surface)', opacity: 0.8 }}>
                    <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--color-primary-500)', borderTopColor: 'transparent' }} />
                </div>
            )}
            
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-4">
                {/* Saat göstergesi - Mobilde sağ üstte, masaüstünde sağda */}
                <div className="absolute top-4 right-4 sm:relative sm:top-auto sm:right-auto sm:order-2 shrink-0">
                    {isTimeEditing ? (
                        <input value={timeStr} onChange={(e) => setTimeStr(e.target.value)} onBlur={handleSaveTime}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveTime()} autoFocus
                            className="w-20 px-2 py-1.5 text-center text-sm font-semibold rounded-lg"
                            style={{ fontFamily: 'var(--font-mono)', backgroundColor: 'var(--color-surface-container)', border: '2px solid var(--color-primary-500)' }} />
                    ) : (
                        <button onClick={() => setIsTimeEditing(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-full transition-all"
                            style={{ 
                                background: `linear-gradient(135deg, ${withAlpha(intensityInfo.color, 0.12)} 0%, ${withAlpha(intensityInfo.color, 0.06)} 100%)`,
                                border: `2px solid ${withAlpha(intensityInfo.color, 0.25)}`,
                                backdropFilter: 'blur(8px)'
                            }}
                        >
                            <div className="w-1.5 h-1.5 rounded-full breathing-dot" style={{ backgroundColor: intensityInfo.color, boxShadow: `0 0 8px ${withAlpha(intensityInfo.color, 0.9)}` }} />
                            <span className="font-bold text-sm" style={{ fontFamily: 'var(--font-mono)', color: intensityInfo.color }}>
                                {wl.hours.toFixed(2)}h
                            </span>
                        </button>
                    )}
                </div>
                <div className="min-w-0 flex-1 sm:order-1 pr-20 sm:pr-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                        {normalizedJiraBaseUrl ? (
                            <a
                                href={`${normalizedJiraBaseUrl}/browse/${wl.issueKey}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center font-semibold text-sm shrink-0 hover:underline"
                                style={{ color: 'var(--color-primary-600)' }}
                                title="Jira'da aç"
                            >
                                {wl.issueKey}
                            </a>
                        ) : (
                            <span
                                className="inline-flex items-center font-semibold text-sm shrink-0"
                                style={{ color: 'var(--color-primary-600)' }}
                            >
                                {wl.issueKey}
                            </span>
                        )}

                        <IssueHoverCard issueKey={wl.issueKey} jiraBaseUrl={normalizedJiraBaseUrl} settings={settings}>
                            <span
                                className="chip text-xs min-w-0 flex-1"
                                style={{
                                    maxWidth: '100%',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    whiteSpace: 'normal',
                                    wordBreak: 'break-word'
                                }}
                                title={wl.summary}
                            >
                                {wl.summary}
                            </span>
                        </IssueHoverCard>
                    </div>
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
                        { label: "Jira'da Aç", icon: <LinkIcon size={14} />, onClick: () => window.open(`${normalizedJiraBaseUrl}/browse/${wl.issueKey}`, '_blank') },
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
    aiProcessingMode = null,
    selectedDate
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

    return (
        <div className="flex flex-col gap-4 stagger-animation">
            {worklogs.map((wl, index) => (
                <WorklogRow key={wl.id} wl={wl} index={index} onUpdate={onUpdate} onImprove={onImprove} onSpellCheck={onSpellCheck}
                    jiraBaseUrl={jiraBaseUrl} history={worklogHistories.get(wl.id)} onHistoryChange={(entries, idx) => onHistoryChange(wl.id, entries, idx)} onDelete={onDelete} settings={settings} selectedDate={selectedDate} />
            ))}
        </div>
    );
};
