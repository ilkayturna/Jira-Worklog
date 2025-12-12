import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, FileSpreadsheet, Download, Plus, Trash2, Check, ChevronLeft, ChevronRight, Wand2, GripVertical, RefreshCw } from 'lucide-react';
import { Worklog, WeeklyReportItem, AppSettings } from '../types';
import * as XLSX from 'xlsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onFetchWeekWorklogs: (startDate: string, endDate: string) => Promise<Worklog[]>;
    onAIGenerate?: (worklogs: Worklog[], weekStart: string) => Promise<WeeklyReportItem[]>;
}

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'] as const;
type DayType = typeof DAYS[number];

const getWeekDates = (weekOffset: number = 1) => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const currentDay = now.getDay();
    const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    
    const monday = new Date(now);
    monday.setDate(diff + (weekOffset * 7));
    
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    
    return {
        start: monday.toISOString().split('T')[0],
        end: friday.toISOString().split('T')[0],
        monday: new Date(monday)
    };
};

const formatDateRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${s.getDate()} - ${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
};

export const WeeklyReportModal: React.FC<Props> = ({
    isOpen,
    onClose,
    settings,
    onFetchWeekWorklogs,
    onAIGenerate
}) => {
    const [weekOffset, setWeekOffset] = useState(1);
    const [items, setItems] = useState<WeeklyReportItem[]>([]);
    const [lastWeekWorklogs, setLastWeekWorklogs] = useState<Worklog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [editingCell, setEditingCell] = useState<{ index: number; field: keyof WeeklyReportItem } | null>(null);
    const [draggedItem, setDraggedItem] = useState<number | null>(null);
    
    const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
    const lastWeekDates = useMemo(() => getWeekDates(weekOffset - 1), [weekOffset]);
    
    // Load worklogs function - memoized to prevent unnecessary re-renders
    const loadLastWeekWorklogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const logs = await onFetchWeekWorklogs(lastWeekDates.start, lastWeekDates.end);
            setLastWeekWorklogs(logs);
        } catch (e) {
            console.error('Failed to load last week worklogs:', e);
        } finally {
            setIsLoading(false);
        }
    }, [lastWeekDates.start, lastWeekDates.end, onFetchWeekWorklogs]);
    
    // Reset when modal opens - ALWAYS start empty
    useEffect(() => {
        if (isOpen) {
            setItems([]);
            setLastWeekWorklogs([]);
            loadLastWeekWorklogs();
        }
    }, [isOpen, loadLastWeekWorklogs]);
    
    // Reload when week changes (but only if modal is already open)
    useEffect(() => {
        if (isOpen) {
            loadLastWeekWorklogs();
        }
    }, [weekOffset, isOpen, loadLastWeekWorklogs]);
    
    const handleAIGenerate = async () => {
        if (!onAIGenerate || lastWeekWorklogs.length === 0) return;
        
        setIsAIGenerating(true);
        try {
            const aiItems = await onAIGenerate(lastWeekWorklogs, weekDates.start);
            setItems(aiItems);
        } catch (e) {
            console.error('AI generation failed:', e);
        } finally {
            setIsAIGenerating(false);
        }
    };
    
    const addItem = (day: DayType = 'Pazartesi') => {
        setItems([...items, {
            issueKey: '',
            summary: '',
            status: 'yeni',
            day,
            description: '',
            hours: 0
        }]);
    };
    
    const addFromLastWeek = (log: Worklog) => {
        // Find the least busy day
        const dayCounts = DAYS.map(day => ({
            day,
            count: items.filter(i => i.day === day).length
        }));
        const leastBusyDay = dayCounts.sort((a, b) => a.count - b.count)[0].day;
        
        setItems([...items, {
            issueKey: log.issueKey,
            summary: log.summary,
            status: 'devam',
            day: leastBusyDay,
            description: log.comment || log.summary,
            hours: log.hours
        }]);
    };
    
    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };
    
    const updateItem = (index: number, field: keyof WeeklyReportItem, value: any) => {
        setItems(items.map((item, i) => i === index ? { ...item, [field]: value } : item));
    };
    
    const getItemsByDay = (day: DayType) => {
        return items.filter(item => item.day === day);
    };
    
    const moveItemToDay = (itemIndex: number, newDay: DayType) => {
        setItems(items.map((item, i) => i === itemIndex ? { ...item, day: newDay } : item));
    };
    
    const handleDragStart = (index: number) => {
        setDraggedItem(index);
    };
    
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };
    
    const handleDrop = (e: React.DragEvent, day: DayType) => {
        e.preventDefault();
        if (draggedItem !== null) {
            moveItemToDay(draggedItem, day);
            setDraggedItem(null);
        }
    };
    
    const exportToExcel = () => {
        const wsData: any[][] = [];
        wsData.push(['', ...DAYS]);
        
        const maxPerDay = Math.max(...DAYS.map(day => getItemsByDay(day).length), 1);
        
        for (let i = 0; i < maxPerDay; i++) {
            const row: string[] = [`Görev ${i + 1}`];
            DAYS.forEach(day => {
                const dayItems = getItemsByDay(day);
                if (dayItems[i]) {
                    const item = dayItems[i];
                    row.push(`${item.issueKey}: ${item.description}`);
                } else {
                    row.push('');
                }
            });
            wsData.push(row);
        }
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Haftalık Plan');
        XLSX.writeFile(wb, `Haftalik_Plan_${weekDates.start}_${weekDates.end}.xlsx`);
    };
    
    // Get unique issues from last week sorted by importance (total hours)
    const lastWeekIssues = useMemo(() => {
        const issueMap = new Map<string, { worklog: Worklog; totalHours: number; lastDate: Date }>();
        
        lastWeekWorklogs.forEach(log => {
            const date = new Date(log.started);
            const existing = issueMap.get(log.issueKey);
            
            if (!existing) {
                issueMap.set(log.issueKey, { worklog: log, totalHours: log.hours, lastDate: date });
            } else {
                existing.totalHours += log.hours;
                if (date > existing.lastDate) {
                    existing.lastDate = date;
                    existing.worklog = log;
                }
            }
        });
        
        return Array.from(issueMap.entries())
            .map(([key, data]) => ({ issueKey: key, ...data }))
            .sort((a, b) => b.totalHours - a.totalHours);
    }, [lastWeekWorklogs]);
    
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            
            <div 
                className="relative w-full max-w-7xl max-h-[90vh] rounded-3xl overflow-hidden animate-scale-in flex flex-col glass-modal"
                onClick={e => e.stopPropagation()}
            >
                {/* Gradient Accent Line */}
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: 'linear-gradient(90deg, var(--color-primary-500) 0%, var(--color-ai-500) 50%, var(--color-success) 100%)' }} />
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 glass-modal-header">
                    <div className="flex items-center gap-4">
                        <div 
                            className="w-12 h-12 rounded-2xl flex items-center justify-center"
                            style={{ 
                                background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)',
                                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.3)'
                            }}
                        >
                            <FileSpreadsheet size={24} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-on-surface) 0%, var(--color-primary-600) 100%)' }}>
                                Haftalık Plan Oluştur
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <button 
                                    onClick={() => setWeekOffset(w => w - 1)} 
                                    className="p-1.5 rounded-lg transition-all hover:scale-110 hover:bg-black/5"
                                >
                                    <ChevronLeft size={16} style={{ color: 'var(--color-on-surface-variant)' }} />
                                </button>
                                <span className="text-sm font-medium px-2" style={{ color: 'var(--color-on-surface-variant)' }}>
                                    {weekOffset === 1 ? 'Önümüzdeki Hafta' : weekOffset === 0 ? 'Bu Hafta' : `${Math.abs(weekOffset)} Hafta ${weekOffset > 0 ? 'Sonra' : 'Önce'}`}: {formatDateRange(weekDates.start, weekDates.end)}
                                </span>
                                <button 
                                    onClick={() => setWeekOffset(w => w + 1)} 
                                    className="p-1.5 rounded-lg transition-all hover:scale-110 hover:bg-black/5"
                                >
                                    <ChevronRight size={16} style={{ color: 'var(--color-on-surface-variant)' }} />
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {/* Refresh Button */}
                        <button
                            onClick={() => { setItems([]); loadLastWeekWorklogs(); }}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-medium transition-all hover:scale-105 disabled:opacity-50 glass-icon-btn"
                            style={{ color: 'var(--color-on-surface)' }}
                            title="Listeyi yenile"
                        >
                            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                        
                        {settings.groqApiKey && lastWeekWorklogs.length > 0 && (
                            <button
                                onClick={handleAIGenerate}
                                disabled={isAIGenerating}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all hover:scale-105 disabled:opacity-50"
                                style={{ 
                                    background: 'linear-gradient(135deg, var(--color-ai-500) 0%, var(--color-ai-600) 100%)',
                                    color: 'white',
                                    boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)'
                                }}
                            >
                                <Wand2 size={18} className={isAIGenerating ? 'animate-spin' : ''} />
                                {isAIGenerating ? 'Planlanıyor...' : 'AI ile Planla'}
                            </button>
                        )}
                        <button
                            onClick={exportToExcel}
                            disabled={items.length === 0}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all hover:scale-105 disabled:opacity-50"
                            style={{ 
                                background: 'linear-gradient(135deg, var(--color-success) 0%, #059669 100%)',
                                color: 'white',
                                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)'
                            }}
                        >
                            <Download size={18} />
                            Excel İndir
                        </button>
                        <button 
                            onClick={onClose} 
                            className="w-10 h-10 flex items-center justify-center rounded-xl transition-all hover:scale-105 glass-icon-btn"
                        >
                            <X size={20} style={{ color: 'var(--color-on-surface-variant)' }} />
                        </button>
                    </div>
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-auto p-6 glass-modal-content">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <div 
                                    className="w-10 h-10 border-3 rounded-full animate-spin mx-auto mb-4" 
                                    style={{ 
                                        borderColor: 'var(--color-primary-200)', 
                                        borderTopColor: 'var(--color-primary-500)' 
                                    }} 
                                />
                                <p className="text-sm font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
                                    Geçen hafta verileri yükleniyor...
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-6">
                            {/* Left: Last Week Issues */}
                            <div className="w-72 shrink-0">
                                <h3 className="text-sm font-bold mb-2 px-1" style={{ color: 'var(--color-on-surface)' }}>
                                    Geçen Hafta İşleri ({lastWeekIssues.length})
                                </h3>
                                <p className="text-xs mb-3 px-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                                    Önem sırasına göre (en çok çalışılan üstte)
                                </p>
                                
                                {lastWeekIssues.length === 0 ? (
                                    <div className="text-center py-8 px-4 rounded-2xl glass-card">
                                        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                                            Geçen hafta worklog bulunamadı
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[55vh] overflow-auto pr-2">
                                        {lastWeekIssues.map(({ issueKey, worklog, totalHours }) => {
                                            const isAdded = items.some(i => i.issueKey === issueKey);
                                            return (
                                                <button
                                                    key={issueKey}
                                                    onClick={() => !isAdded && addFromLastWeek(worklog)}
                                                    disabled={isAdded}
                                                    className={`w-full text-left p-3 rounded-xl transition-all glass-card ${isAdded ? 'added opacity-60' : 'hover:scale-[1.02]'}`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span 
                                                            className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                                                            style={{ 
                                                                background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)',
                                                                color: 'white'
                                                            }}
                                                        >
                                                            {issueKey}
                                                        </span>
                                                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}>
                                                            {totalHours.toFixed(1)}h
                                                        </span>
                                                    </div>
                                                    <p className="text-xs line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>
                                                        {worklog.summary}
                                                    </p>
                                                    {isAdded && (
                                                        <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: 'var(--color-success)' }}>
                                                            <Check size={12} /> Plana Eklendi
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            
                            {/* Right: Week Grid */}
                            <div className="flex-1">
                                {items.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center py-16">
                                        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--color-surface-container)' }}>
                                            <FileSpreadsheet size={40} style={{ color: 'var(--color-text-tertiary)' }} />
                                        </div>
                                        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                                            Plan Boş
                                        </h3>
                                        <p className="text-sm text-center max-w-md mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                                            Soldaki listeden iş ekleyin veya <strong>AI ile Planla</strong> butonunu kullanarak otomatik plan oluşturun.
                                        </p>
                                        {settings.groqApiKey && lastWeekIssues.length > 0 && (
                                            <button
                                                onClick={handleAIGenerate}
                                                disabled={isAIGenerating}
                                                className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:scale-105"
                                                style={{ backgroundColor: 'var(--color-primary-600)', color: 'white' }}
                                            >
                                                <Wand2 size={20} />
                                                AI ile Akıllı Plan Oluştur
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-5 gap-3">
                                        {DAYS.map((day, dayIndex) => {
                                            const dayItems = getItemsByDay(day);
                                            const weekMonday = new Date(weekDates.start);
                                            const dayDate = new Date(weekMonday);
                                            dayDate.setDate(weekMonday.getDate() + dayIndex);
                                            
                                            return (
                                                <div 
                                                    key={day}
                                                    className="space-y-2"
                                                    onDragOver={handleDragOver}
                                                    onDrop={(e) => handleDrop(e, day)}
                                                >
                                                    {/* Day Header - Clickable */}
                                                    <button
                                                        onClick={() => addItem(day)}
                                                        className="w-full text-center py-2 px-3 rounded-xl transition-all hover:scale-105"
                                                        style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}
                                                        title={`${day}'e görev ekle`}
                                                    >
                                                        <div className="text-xs font-semibold">{day}</div>
                                                        <div className="text-lg font-bold">{dayDate.getDate()}</div>
                                                    </button>
                                                    
                                                    {/* Day Items */}
                                                    <div className="space-y-2 min-h-[180px]">
                                                        {dayItems.map((item) => {
                                                            const globalIndex = items.findIndex(i => i === item);
                                                            return (
                                                                <div 
                                                                    key={globalIndex}
                                                                    draggable
                                                                    onDragStart={() => handleDragStart(globalIndex)}
                                                                    className="p-3 rounded-xl border group relative cursor-move transition-all hover:shadow-md"
                                                                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-container)' }}
                                                                >
                                                                    <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-50 cursor-grab">
                                                                        <GripVertical size={14} />
                                                                    </div>
                                                                    
                                                                    <button 
                                                                        onClick={() => removeItem(globalIndex)}
                                                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 text-red-500"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                    
                                                                    {editingCell?.index === globalIndex && editingCell?.field === 'issueKey' ? (
                                                                        <input
                                                                            value={item.issueKey}
                                                                            onChange={e => updateItem(globalIndex, 'issueKey', e.target.value)}
                                                                            onBlur={() => setEditingCell(null)}
                                                                            onKeyDown={e => e.key === 'Enter' && setEditingCell(null)}
                                                                            autoFocus
                                                                            className="w-full text-xs font-mono px-1 py-0.5 rounded border mb-1"
                                                                            style={{ borderColor: 'var(--color-primary-500)' }}
                                                                        />
                                                                    ) : (
                                                                        <div 
                                                                            className="text-xs font-mono font-semibold cursor-pointer hover:underline mb-1"
                                                                            style={{ color: 'var(--color-primary-600)' }}
                                                                            onClick={() => setEditingCell({ index: globalIndex, field: 'issueKey' })}
                                                                        >
                                                                            {item.issueKey || 'ISSUE-XXX'}
                                                                        </div>
                                                                    )}
                                                                    
                                                                    {editingCell?.index === globalIndex && editingCell?.field === 'description' ? (
                                                                        <textarea
                                                                            value={item.description}
                                                                            onChange={e => updateItem(globalIndex, 'description', e.target.value)}
                                                                            onBlur={() => setEditingCell(null)}
                                                                            autoFocus
                                                                            className="w-full text-xs px-1 py-0.5 rounded border resize-none"
                                                                            style={{ borderColor: 'var(--color-primary-500)' }}
                                                                            rows={3}
                                                                        />
                                                                    ) : (
                                                                        <p 
                                                                            className="text-xs line-clamp-3 cursor-pointer"
                                                                            style={{ color: 'var(--color-text-secondary)' }}
                                                                            onClick={() => setEditingCell({ index: globalIndex, field: 'description' })}
                                                                        >
                                                                            {item.description || 'Açıklama ekle...'}
                                                                        </p>
                                                                    )}
                                                                    
                                                                    <select
                                                                        value={item.status}
                                                                        onChange={e => updateItem(globalIndex, 'status', e.target.value)}
                                                                        className="text-xs px-2 py-0.5 rounded-full mt-2 cursor-pointer"
                                                                        style={{
                                                                            backgroundColor: item.status === 'tamamlandı' ? 'var(--color-success-container)' :
                                                                                item.status === 'test' ? 'var(--color-warning-container)' :
                                                                                item.status === 'devam' ? 'var(--color-primary-100)' : 'var(--color-ai-100)',
                                                                            color: item.status === 'tamamlandı' ? 'var(--color-success)' :
                                                                                item.status === 'test' ? 'var(--color-warning-dark)' :
                                                                                item.status === 'devam' ? 'var(--color-primary-700)' : 'var(--color-ai-600)'
                                                                        }}
                                                                    >
                                                                        <option value="devam">Devam Edilecek</option>
                                                                        <option value="test">Test Edilecek</option>
                                                                        <option value="tamamlandı">Tamamlanacak</option>
                                                                        <option value="yeni">Yeni Başlanacak</option>
                                                                    </select>
                                                                </div>
                                                            );
                                                        })}
                                                        
                                                        <button
                                                            onClick={() => addItem(day)}
                                                            className="w-full py-2 rounded-xl border-2 border-dashed flex items-center justify-center transition-colors hover:bg-black/5 text-xs"
                                                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                
                {items.length > 0 && (
                    <div className="px-6 py-3 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                        <span>Toplam {items.length} görev planlandı</span>
                        <span>💡 Gün başlığına tıklayarak o güne görev ekleyin • Kartları sürükleyerek taşıyın</span>
                    </div>
                )}
            </div>
        </div>
    );
};
