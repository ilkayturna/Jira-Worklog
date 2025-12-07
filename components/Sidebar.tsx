import React from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Clock, Brain, Edit3, Sparkles, Copy } from 'lucide-react';
import { AppSettings, LoadingState } from '../types';
import { formatHours } from '../utils/adf';
import { WeeklyChart } from './WeeklyChart';

interface SidebarProps {
    selectedDate: string;
    setSelectedDate: (date: string) => void;
    changeDate: (days: number) => void;
    totalHours: number;
    settings: AppSettings;
    isTargetMet: boolean;
    progress: number;
    isEditingTarget: boolean;
    setIsEditingTarget: (value: boolean) => void;
    tempTargetHours: string;
    setTempTargetHours: (value: string) => void;
    handleTargetHoursChange: () => void;
    loadData: (force?: boolean) => Promise<void>;
    loadingState: LoadingState;
    isDistributing: boolean;
    previewEqualDistribute: () => void;
    previewSmartDistribute: () => void;
    isAIProcessing: boolean;
    textChangeMode: 'IMPROVE' | 'SPELL' | null;
    previewBatchAI: (mode: 'IMPROVE' | 'SPELL') => void;
    copyPreviousDay: () => void;
    weeklyHours: { date: string; hours: number; dayName: string }[];
    isLoadingWeek: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
    selectedDate,
    setSelectedDate,
    changeDate,
    totalHours,
    settings,
    isTargetMet,
    progress,
    isEditingTarget,
    setIsEditingTarget,
    tempTargetHours,
    setTempTargetHours,
    handleTargetHoursChange,
    loadData,
    loadingState,
    isDistributing,
    previewEqualDistribute,
    previewSmartDistribute,
    isAIProcessing,
    textChangeMode,
    previewBatchAI,
    copyPreviousDay,
    weeklyHours,
    isLoadingWeek
}) => {
    return (
        <aside className="lg:col-span-4 space-y-5">
            
            {/* Date Picker Card - Apple style */}
            <section className="surface-card p-5" aria-label="Date selection">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.05em' }}>
                    Tarih
                </h2>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => changeDate(-1)} 
                        className="btn-icon"
                        aria-label="Previous day"
                    >
                        <ChevronLeft size={20}/>
                    </button>
                    <input 
                        type="date" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="input-filled flex-1 text-center font-medium"
                        style={{ fontFamily: 'var(--font-mono)' }}
                    />
                    <button 
                        onClick={() => changeDate(1)} 
                        className="btn-icon"
                        aria-label="Next day"
                    >
                        <ChevronRight size={20}/>
                    </button>
                </div>
                
                {/* Week Days - Apple Segmented Control Style */}
                <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
                    <div className="apple-segmented-control">
                        {(() => {
                            const selected = new Date(selectedDate);
                            const dayOfWeek = selected.getDay();
                            const monday = new Date(selected);
                            monday.setDate(selected.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                            
                            const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
                            const weekDays = [];
                            
                            // Helper function for local date string (YYYY-MM-DD)
                            const toLocalDateStr = (d: Date) => {
                                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                            };
                            
                            const todayStr = toLocalDateStr(new Date());
                            
                            for (let i = 0; i < 7; i++) {
                                const day = new Date(monday);
                                day.setDate(monday.getDate() + i);
                                const dateStr = toLocalDateStr(day);
                                const isSelected = dateStr === selectedDate;
                                const isToday = dateStr === todayStr;
                                
                                weekDays.push(
                                    <button
                                        key={dateStr}
                                        onClick={() => setSelectedDate(dateStr)}
                                        className={`apple-segment-item ${isSelected ? 'active' : ''} ${isToday ? 'today' : ''}`}
                                    >
                                        <span className="day-label">{days[i]}</span>
                                        <span className="day-number">{day.getDate()}</span>
                                        {isToday && <span className="today-dot" />}
                                    </button>
                                );
                            }
                            
                            return weekDays;
                        })()}
                    </div>
                </div>
            </section>

            {/* Daily Progress - Apple Activity Ring Style */}
            <section className="apple-progress-card" aria-label="Daily progress">
                <div className="flex items-center gap-5">
                    {/* Apple Activity Ring */}
                    <div className="apple-progress-ring flex-shrink-0">
                        <svg viewBox="0 0 100 100" className="w-20 h-20">
                            {/* Background Ring */}
                            <circle
                                cx="50" cy="50" r="42"
                                fill="none"
                                stroke="var(--color-outline-variant)"
                                strokeWidth="8"
                            />
                            {/* Progress Ring */}
                            <circle
                                cx="50" cy="50" r="42"
                                fill="none"
                                stroke={isTargetMet ? '#30d158' : '#007AFF'}
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray={`${Math.min(progress, 100) * 2.64} 264`}
                                transform="rotate(-90 50 50)"
                                style={{ transition: 'stroke-dasharray 1s ease-out' }}
                            />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: 'var(--color-on-surface)' }}>
                            {Math.round(Math.min(progress, 100))}%
                        </span>
                    </div>
                    
                    {/* Text Info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.05em' }}>
                            Günlük İlerleme
                        </p>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-[32px] font-bold tracking-tight" style={{ color: 'var(--color-on-surface)', letterSpacing: '-0.03em' }}>
                                {formatHours(totalHours)}
                            </span>
                            {isEditingTarget ? (
                                <div className="flex items-center gap-1">
                                    <span style={{ color: 'var(--color-on-surface-variant)' }}>/</span>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="0.5"
                                        max="24"
                                        value={tempTargetHours}
                                        onChange={(e) => setTempTargetHours(e.target.value)}
                                        onBlur={handleTargetHoursChange}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleTargetHoursChange();
                                            if (e.key === 'Escape') {
                                                setTempTargetHours(settings.targetDailyHours.toString());
                                                setIsEditingTarget(false);
                                            }
                                        }}
                                        autoFocus
                                        className="w-12 bg-transparent border-b-2 px-1 py-0.5 text-base font-semibold text-center focus:outline-none"
                                        style={{ borderColor: 'var(--color-primary-500)', color: 'var(--color-on-surface)' }}
                                    />
                                </div>
                            ) : (
                                <button 
                                    onClick={() => {
                                        setTempTargetHours(settings.targetDailyHours.toString());
                                        setIsEditingTarget(true);
                                    }}
                                    className="text-base font-medium transition-opacity hover:opacity-70"
                                    style={{ color: 'var(--color-on-surface-variant)' }}
                                >
                                    / {settings.targetDailyHours}h
                                </button>
                            )}
                        </div>
                        <p className="text-[13px] mt-1" style={{ color: isTargetMet ? 'var(--color-success)' : 'var(--color-on-surface-variant)' }}>
                            {isTargetMet ? '✓ Hedef tamamlandı' : `${formatHours(settings.targetDailyHours - totalHours)} kaldı`}
                        </p>
                    </div>
                </div>
            </section>

            {/* Quick Actions Card */}
            <section className="surface-card p-5 space-y-4" aria-label="Quick actions">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.05em' }}>
                    İşlemler
                </h2>
                
                {/* Refresh Button */}
                <button 
                    onClick={() => loadData(true)} 
                    className="btn-outlined w-full"
                    disabled={loadingState === LoadingState.LOADING}
                >
                    <RefreshCw size={16} className={loadingState === LoadingState.LOADING ? 'animate-spin' : ''}/> 
                    Yenile
                </button>
                    
                {/* Distribution Section */}
                <div className="pt-4 border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
                    <label className="text-[11px] font-semibold uppercase tracking-wide block mb-3" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.05em' }}>
                        Dağıtım ({settings.targetDailyHours}h)
                    </label>
                    
                    {/* Distribution Buttons */}
                    <div className="space-y-2">
                        <button 
                            onClick={previewEqualDistribute} 
                            className="btn-filled w-full text-sm"
                            style={{ 
                                background: 'linear-gradient(135deg, #30d158 0%, #34c759 100%)',
                                color: 'white',
                                opacity: isDistributing ? 0.7 : 1
                            }}
                            title="Tüm worklog'lara eşit süre dağıtır"
                            disabled={isDistributing}
                        >
                            <Clock size={16} /> Eşit
                        </button>
                        
                        {/* AI Smart Distribution */}
                        <button 
                            onClick={previewSmartDistribute}
                            className="btn-filled w-full text-sm"
                            style={{ 
                                background: 'linear-gradient(135deg, #af52de 0%, #5856d6 100%)',
                            }}
                            title="Yapay zeka worklog içeriklerini analiz ederek akıllı dağıtım yapar"
                            disabled={isDistributing}
                        >
                            {isDistributing ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" /> Analiz...
                                </>
                            ) : (
                                <>
                                    <Brain size={16} /> Akıllı
                                </>
                            )}
                        </button>
                    </div>
                </div>
                
                {/* AI Text Operations */}
                <div className="pt-4 border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
                    <label className="text-[11px] font-semibold uppercase tracking-wide block mb-3" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.05em' }}>
                        AI
                    </label>
                    <div className="space-y-2">
                        <button 
                            onClick={() => previewBatchAI('SPELL')}
                            className="btn-outlined w-full text-sm"
                            style={{ borderColor: '#ff9f0a', color: '#ff9f0a' }}
                            title="Tüm worklog yorumlarının imla ve gramer hatalarını düzeltir"
                            disabled={isAIProcessing}
                        >
                            {isAIProcessing && textChangeMode === 'SPELL' ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" /> İşleniyor...
                                </>
                            ) : (
                                <>
                                    <Edit3 size={16} /> Tümünün İmlasını Düzelt
                                </>
                            )}
                        </button>
                        
                        <button 
                            onClick={() => previewBatchAI('IMPROVE')}
                            className="btn-outlined w-full ripple text-sm"
                            style={{ borderColor: '#8b5cf6', color: '#8b5cf6' }}
                            title="Tüm worklog yorumlarını AI ile iyileştirir"
                            disabled={isAIProcessing}
                        >
                            {isAIProcessing && textChangeMode === 'IMPROVE' ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" /> İşleniyor...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={16} /> Tümünü İyileştir
                                </>
                            )}
                        </button>
                    </div>
                </div>
                    
                {/* Copy Previous Day */}
                <button 
                    onClick={copyPreviousDay} 
                    className="btn-text w-full ripple"
                >
                    <Copy size={18} /> Dünden Kopyala
                </button>
            </section>
            
            {/* Weekly Chart */}
            <WeeklyChart 
                weeklyHours={weeklyHours}
                settings={settings}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                isLoadingWeek={isLoadingWeek}
            />
        </aside>
    );
};
