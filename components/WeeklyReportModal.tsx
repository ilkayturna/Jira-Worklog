import React, { useState, useEffect, useMemo } from 'react';
import { X, FileSpreadsheet, Download, Plus, Trash2, Edit3, Check, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react';
import { Worklog, WeeklyReportItem, AppSettings } from '../types';
import * as XLSX from 'xlsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worklogs: Worklog[];
    settings: AppSettings;
    onFetchWeekWorklogs: (startDate: string, endDate: string) => Promise<Worklog[]>;
    onAIGenerate?: (worklogs: Worklog[]) => Promise<WeeklyReportItem[]>;
}

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'] as const;
type DayType = typeof DAYS[number];

const getWeekDates = (weekOffset: number = 1) => {
    const now = new Date();
    const currentDay = now.getDay();
    const diff = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1); // Monday
    
    const monday = new Date(now.setDate(diff));
    monday.setDate(monday.getDate() + (weekOffset * 7));
    
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
    worklogs: currentDayWorklogs,
    settings,
    onFetchWeekWorklogs,
    onAIGenerate
}) => {
    const [weekOffset, setWeekOffset] = useState(1); // 1 = next week, 0 = this week, -1 = last week
    const [items, setItems] = useState<WeeklyReportItem[]>([]);
    const [lastWeekWorklogs, setLastWeekWorklogs] = useState<Worklog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [editingCell, setEditingCell] = useState<{ index: number; field: keyof WeeklyReportItem } | null>(null);
    
    const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
    const lastWeekDates = useMemo(() => getWeekDates(weekOffset - 1), [weekOffset]);
    
    // Load last week's worklogs when modal opens
    useEffect(() => {
        if (isOpen) {
            loadLastWeekWorklogs();
        }
    }, [isOpen, weekOffset]);
    
    const loadLastWeekWorklogs = async () => {
        setIsLoading(true);
        try {
            const logs = await onFetchWeekWorklogs(lastWeekDates.start, lastWeekDates.end);
            setLastWeekWorklogs(logs);
            
            // Auto-generate initial items from last week's worklogs
            if (items.length === 0) {
                generateInitialItems(logs);
            }
        } catch (e) {
            console.error('Failed to load last week worklogs:', e);
        } finally {
            setIsLoading(false);
        }
    };
    
    const generateInitialItems = (logs: Worklog[]) => {
        // Group by issue and find the last day worked on each
        const issueMap = new Map<string, { worklog: Worklog; lastDay: Date; totalHours: number }>();
        
        logs.forEach(log => {
            const date = new Date(log.date);
            const existing = issueMap.get(log.issueKey);
            
            if (!existing || date > existing.lastDay) {
                issueMap.set(log.issueKey, {
                    worklog: log,
                    lastDay: date,
                    totalHours: (existing?.totalHours || 0) + log.hours
                });
            } else {
                existing.totalHours += log.hours;
            }
        });
        
        // Convert to report items
        const newItems: WeeklyReportItem[] = [];
        
        issueMap.forEach(({ worklog, lastDay, totalHours }, issueKey) => {
            // Determine which day to suggest based on last worked day
            const lastDayIndex = lastDay.getDay() - 1; // 0 = Monday
            let suggestedDayIndex = 0; // Default to Monday
            
            if (lastDayIndex === 4) { // Friday -> Monday
                suggestedDayIndex = 0;
            } else if (lastDayIndex >= 0 && lastDayIndex < 4) {
                suggestedDayIndex = lastDayIndex + 1; // Next day
            }
            
            // Determine status based on keywords or hours
            let status: WeeklyReportItem['status'] = 'devam';
            const summary = worklog.summary.toLowerCase();
            if (summary.includes('test') || summary.includes('kontrol')) {
                status = 'test';
            } else if (summary.includes('tamamla') || summary.includes('bitiril') || totalHours > 8) {
                status = 'tamamlandı';
            }
            
            newItems.push({
                issueKey,
                summary: worklog.summary,
                status,
                day: DAYS[suggestedDayIndex],
                description: worklog.comment || worklog.summary,
                hours: Math.round(totalHours * 10) / 10
            });
        });
        
        setItems(newItems);
    };
    
    const handleAIGenerate = async () => {
        if (!onAIGenerate || lastWeekWorklogs.length === 0) return;
        
        setIsAIGenerating(true);
        try {
            const aiItems = await onAIGenerate(lastWeekWorklogs);
            setItems(aiItems);
        } catch (e) {
            console.error('AI generation failed:', e);
        } finally {
            setIsAIGenerating(false);
        }
    };
    
    const addItem = () => {
        setItems([...items, {
            issueKey: '',
            summary: '',
            status: 'yeni',
            day: 'Pazartesi',
            description: '',
            hours: 0
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
    
    const moveItem = (index: number, newDay: DayType) => {
        updateItem(index, 'day', newDay);
    };
    
    const exportToExcel = () => {
        // Create worksheet data
        const wsData: any[][] = [];
        
        // Header row
        wsData.push(['', ...DAYS]);
        
        // Find max items per day
        const maxPerDay = Math.max(...DAYS.map(day => getItemsByDay(day).length), 1);
        
        // Data rows
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
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // Set column widths
        ws['!cols'] = [
            { wch: 10 },
            { wch: 35 },
            { wch: 35 },
            { wch: 35 },
            { wch: 35 },
            { wch: 35 }
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, 'Haftalık Plan');
        
        // Download
        const fileName = `Haftalik_Plan_${weekDates.start}_${weekDates.end}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            
            <div 
                className="relative w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden animate-scale-in flex flex-col"
                style={{ backgroundColor: 'var(--color-surface)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary-100)' }}>
                            <FileSpreadsheet size={24} style={{ color: 'var(--color-primary-600)' }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                Haftalık Rapor Oluştur
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <button 
                                    onClick={() => setWeekOffset(w => w - 1)}
                                    className="p-1 rounded hover:bg-black/5 transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                    {formatDateRange(weekDates.start, weekDates.end)}
                                </span>
                                <button 
                                    onClick={() => setWeekOffset(w => w + 1)}
                                    className="p-1 rounded hover:bg-black/5 transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {settings.groqApiKey && (
                            <button
                                onClick={handleAIGenerate}
                                disabled={isAIGenerating || lastWeekWorklogs.length === 0}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all hover:scale-105 disabled:opacity-50"
                                style={{ 
                                    backgroundColor: 'var(--color-primary-100)',
                                    color: 'var(--color-primary-700)'
                                }}
                            >
                                <Wand2 size={18} className={isAIGenerating ? 'animate-spin' : ''} />
                                {isAIGenerating ? 'Oluşturuluyor...' : 'AI ile Oluştur'}
                            </button>
                        )}
                        <button
                            onClick={exportToExcel}
                            disabled={items.length === 0}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all hover:scale-105 disabled:opacity-50"
                            style={{ 
                                backgroundColor: 'var(--color-success)',
                                color: 'white'
                            }}
                        >
                            <Download size={18} />
                            Excel İndir
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-black/5 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--color-primary-500)', borderTopColor: 'transparent' }} />
                        </div>
                    ) : (
                        <>
                            {/* Week Grid */}
                            <div className="grid grid-cols-5 gap-4 mb-6">
                                {DAYS.map(day => (
                                    <div key={day} className="space-y-2">
                                        <h3 
                                            className="text-sm font-semibold px-3 py-2 rounded-xl text-center"
                                            style={{ 
                                                backgroundColor: 'var(--color-primary-100)',
                                                color: 'var(--color-primary-700)'
                                            }}
                                        >
                                            {day}
                                        </h3>
                                        
                                        <div className="space-y-2 min-h-[200px]">
                                            {getItemsByDay(day).map((item, idx) => {
                                                const globalIndex = items.findIndex(i => i === item);
                                                return (
                                                    <div 
                                                        key={globalIndex}
                                                        className="p-3 rounded-xl border group relative"
                                                        style={{ 
                                                            borderColor: 'var(--color-border)',
                                                            backgroundColor: 'var(--color-surface-container)'
                                                        }}
                                                    >
                                                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onClick={() => removeItem(globalIndex)}
                                                                className="p-1 rounded hover:bg-red-100 text-red-500"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                        
                                                        {editingCell?.index === globalIndex && editingCell?.field === 'issueKey' ? (
                                                            <input
                                                                value={item.issueKey}
                                                                onChange={e => updateItem(globalIndex, 'issueKey', e.target.value)}
                                                                onBlur={() => setEditingCell(null)}
                                                                onKeyDown={e => e.key === 'Enter' && setEditingCell(null)}
                                                                autoFocus
                                                                className="w-full text-xs font-mono px-1 py-0.5 rounded border"
                                                                style={{ borderColor: 'var(--color-primary-500)' }}
                                                            />
                                                        ) : (
                                                            <div 
                                                                className="text-xs font-mono font-semibold cursor-pointer hover:underline"
                                                                style={{ color: 'var(--color-primary-600)' }}
                                                                onClick={() => setEditingCell({ index: globalIndex, field: 'issueKey' })}
                                                            >
                                                                {item.issueKey || 'Issue Key'}
                                                            </div>
                                                        )}
                                                        
                                                        {editingCell?.index === globalIndex && editingCell?.field === 'description' ? (
                                                            <textarea
                                                                value={item.description}
                                                                onChange={e => updateItem(globalIndex, 'description', e.target.value)}
                                                                onBlur={() => setEditingCell(null)}
                                                                autoFocus
                                                                className="w-full text-xs mt-1 px-1 py-0.5 rounded border resize-none"
                                                                style={{ borderColor: 'var(--color-primary-500)' }}
                                                                rows={3}
                                                            />
                                                        ) : (
                                                            <p 
                                                                className="text-xs mt-1 line-clamp-3 cursor-pointer"
                                                                style={{ color: 'var(--color-text-secondary)' }}
                                                                onClick={() => setEditingCell({ index: globalIndex, field: 'description' })}
                                                            >
                                                                {item.description || 'Açıklama ekle...'}
                                                            </p>
                                                        )}
                                                        
                                                        <div className="flex items-center gap-1 mt-2">
                                                            <select
                                                                value={item.status}
                                                                onChange={e => updateItem(globalIndex, 'status', e.target.value)}
                                                                className="text-xs px-2 py-0.5 rounded-full"
                                                                style={{
                                                                    backgroundColor: item.status === 'tamamlandı' ? '#dcfce7' :
                                                                        item.status === 'test' ? '#fef3c7' :
                                                                        item.status === 'devam' ? '#dbeafe' : '#f3e8ff',
                                                                    color: item.status === 'tamamlandı' ? '#166534' :
                                                                        item.status === 'test' ? '#92400e' :
                                                                        item.status === 'devam' ? '#1e40af' : '#7c3aed'
                                                                }}
                                                            >
                                                                <option value="devam">Devam</option>
                                                                <option value="test">Test</option>
                                                                <option value="tamamlandı">Tamamlandı</option>
                                                                <option value="yeni">Yeni</option>
                                                            </select>
                                                        </div>
                                                        
                                                        {/* Day switcher */}
                                                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {DAYS.filter(d => d !== day).map(d => (
                                                                <button
                                                                    key={d}
                                                                    onClick={() => moveItem(globalIndex, d)}
                                                                    className="text-xs px-1.5 py-0.5 rounded hover:bg-black/10"
                                                                    title={`${d}'e taşı`}
                                                                >
                                                                    {d.slice(0, 2)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Add Item Button */}
                            <button
                                onClick={addItem}
                                className="w-full py-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-colors hover:bg-black/5"
                                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                            >
                                <Plus size={18} />
                                Yeni Görev Ekle
                            </button>
                            
                            {/* Last Week Summary */}
                            {lastWeekWorklogs.length > 0 && (
                                <div className="mt-6 p-4 rounded-2xl" style={{ backgroundColor: 'var(--color-surface-container)' }}>
                                    <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                                        Geçen Hafta Özeti ({lastWeekWorklogs.length} kayıt)
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {Array.from(new Set(lastWeekWorklogs.map(w => w.issueKey))).map(key => {
                                            const logs = lastWeekWorklogs.filter(w => w.issueKey === key);
                                            const totalHours = logs.reduce((sum, w) => sum + w.hours, 0);
                                            const isInReport = items.some(i => i.issueKey === key);
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => {
                                                        if (!isInReport) {
                                                            const firstLog = logs[0];
                                                            setItems([...items, {
                                                                issueKey: key,
                                                                summary: firstLog.summary,
                                                                status: 'devam',
                                                                day: 'Pazartesi',
                                                                description: firstLog.comment || firstLog.summary,
                                                                hours: totalHours
                                                            }]);
                                                        }
                                                    }}
                                                    disabled={isInReport}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isInReport ? 'opacity-50' : 'hover:scale-105'}`}
                                                    style={{ 
                                                        backgroundColor: isInReport ? 'var(--color-success-light)' : 'var(--color-primary-100)',
                                                        color: isInReport ? 'var(--color-success)' : 'var(--color-primary-700)'
                                                    }}
                                                >
                                                    {key} ({totalHours.toFixed(1)}h)
                                                    {isInReport && <Check size={12} className="inline ml-1" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
