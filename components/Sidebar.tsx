import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Clock, Brain, Edit3, Sparkles, Copy, Calendar, ChevronDown } from 'lucide-react';
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
    onWorklogDrop?: (worklogId: string, newDate: string) => void;
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
    isLoadingWeek,
    onWorklogDrop
}) => {
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(() => {
        const d = new Date(selectedDate);
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    const calendarRef = useRef<HTMLDivElement>(null);

    // Close calendar when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
                setIsCalendarOpen(false);
            }
        };
        if (isCalendarOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isCalendarOpen]);

    // Update calendar month when selected date changes
    useEffect(() => {
        const d = new Date(selectedDate);
        setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }, [selectedDate]);

    // Helper functions for calendar
    const toLocalDateStr = (d: Date) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const formatDisplayDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
        const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        return {
            day: d.getDate(),
            dayName: days[d.getDay()],
            month: months[d.getMonth()],
            year: d.getFullYear()
        };
    };

    const getCalendarDays = () => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        let startDay = firstDay.getDay();
        startDay = startDay === 0 ? 6 : startDay - 1; // Monday = 0
        
        const days: { date: Date | null; isCurrentMonth: boolean }[] = [];
        
        // Previous month days
        const prevMonth = new Date(year, month, 0);
        for (let i = startDay - 1; i >= 0; i--) {
            days.push({
                date: new Date(year, month - 1, prevMonth.getDate() - i),
                isCurrentMonth: false
            });
        }
        
        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({
                date: new Date(year, month, i),
                isCurrentMonth: true
            });
        }
        
        // Next month days
        const remaining = 42 - days.length;
        for (let i = 1; i <= remaining; i++) {
            days.push({
                date: new Date(year, month + 1, i),
                isCurrentMonth: false
            });
        }
        
        return days;
    };

    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const dayHeaders = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
    const todayStr = toLocalDateStr(new Date());
    const displayDate = formatDisplayDate(selectedDate);

    return (
        <aside className="lg:col-span-4 space-y-5">
            
            {/* Date Picker Card - Premium Glassmorphism style */}
            <section 
                className="p-5 rounded-2xl glass-card"
                aria-label="Date selection"
            >
                <h2 className="text-[11px] font-semibold uppercase tracking-wide mb-4 flex items-center gap-2" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.05em' }}>
                    <span className="w-1.5 h-1.5 rounded-full breathing-dot" style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-ai-500))' }} />
                    Tarih
                </h2>
                
                {/* Date Input with Modern Calendar Dropdown */}
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => changeDate(-1)} 
                        className="btn-icon"
                        aria-label="Previous day"
                    >
                        <ChevronLeft size={20}/>
                    </button>
                    
                    {/* Date Input with Calendar Trigger */}
                    <div className="relative flex-1" ref={calendarRef}>
                        <button
                            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                            className="input-filled w-full text-center font-medium flex items-center justify-center gap-2"
                            style={{ fontFamily: 'var(--font-mono)' }}
                        >
                            <Calendar size={14} style={{ color: 'var(--color-primary-500)' }} />
                            <span>{selectedDate}</span>
                            <ChevronDown 
                                size={14} 
                                className={`transition-transform duration-200 ${isCalendarOpen ? 'rotate-180' : ''}`}
                                style={{ color: 'var(--color-on-surface-variant)' }} 
                            />
                        </button>

                        {/* Desktop: Calendar Grid Dropdown */}
                        {isCalendarOpen && (
                            <div 
                                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-4 rounded-2xl z-50 animate-scale-in glass-modal hidden lg:block"
                                style={{ 
                                    width: '320px',
                                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)'
                                }}
                            >
                                {/* Calendar Header */}
                                <div className="flex items-center justify-between mb-4">
                                    <button
                                        onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                                        className="glass-icon-btn w-8 h-8 rounded-lg flex items-center justify-center"
                                    >
                                        <ChevronLeft size={18} style={{ color: 'var(--color-on-surface)' }} />
                                    </button>
                                    <h3 className="text-sm font-bold" style={{ color: 'var(--color-on-surface)' }}>
                                        {monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                                    </h3>
                                    <button
                                        onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                                        className="glass-icon-btn w-8 h-8 rounded-lg flex items-center justify-center"
                                    >
                                        <ChevronRight size={18} style={{ color: 'var(--color-on-surface)' }} />
                                    </button>
                                </div>

                                {/* Day Headers */}
                                <div className="grid grid-cols-7 gap-1 mb-2">
                                    {dayHeaders.map(day => (
                                        <div 
                                            key={day} 
                                            className="h-8 flex items-center justify-center text-[10px] font-bold uppercase"
                                            style={{ color: 'var(--color-on-surface-variant)' }}
                                        >
                                            {day}
                                        </div>
                                    ))}
                                </div>

                                {/* Calendar Days */}
                                <div className="grid grid-cols-7 gap-1">
                                    {getCalendarDays().map((item, idx) => {
                                        if (!item.date) return <div key={idx} />;
                                        const dateStr = toLocalDateStr(item.date);
                                        const isSelected = dateStr === selectedDate;
                                        const isToday = dateStr === todayStr;
                                        const isWeekend = item.date.getDay() === 0 || item.date.getDay() === 6;
                                        
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setSelectedDate(dateStr);
                                                    setIsCalendarOpen(false);
                                                }}
                                                className={`
                                                    h-9 rounded-xl flex items-center justify-center text-sm font-medium
                                                    transition-all duration-200 hover:scale-110
                                                    ${!item.isCurrentMonth ? 'opacity-30' : ''}
                                                    ${isSelected ? 'text-white' : ''}
                                                `}
                                                style={{
                                                    background: isSelected 
                                                        ? 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)'
                                                        : isToday
                                                        ? 'var(--color-primary-100)'
                                                        : 'transparent',
                                                    color: isSelected 
                                                        ? 'white' 
                                                        : isWeekend && item.isCurrentMonth
                                                        ? 'var(--color-primary-500)'
                                                        : 'var(--color-on-surface)',
                                                    boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.4)' : 'none'
                                                }}
                                            >
                                                {item.date.getDate()}
                                                {isToday && !isSelected && (
                                                    <span 
                                                        className="absolute bottom-1 w-1 h-1 rounded-full"
                                                        style={{ background: 'var(--color-primary-500)' }}
                                                    />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Quick Actions */}
                                <div className="mt-4 pt-4 flex gap-2" style={{ borderTop: '1px solid var(--color-outline-variant)' }}>
                                    <button
                                        onClick={() => {
                                            setSelectedDate(todayStr);
                                            setIsCalendarOpen(false);
                                        }}
                                        className="flex-1 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105"
                                        style={{
                                            background: 'var(--color-primary-100)',
                                            color: 'var(--color-primary-600)'
                                        }}
                                    >
                                        Bugün
                                    </button>
                                    <button
                                        onClick={() => {
                                            const yesterday = new Date();
                                            yesterday.setDate(yesterday.getDate() - 1);
                                            setSelectedDate(toLocalDateStr(yesterday));
                                            setIsCalendarOpen(false);
                                        }}
                                        className="flex-1 py-2 rounded-xl text-xs font-medium glass-icon-btn"
                                    >
                                        Dün
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Mobile: Apple-style Date Picker Sheet */}
                        {isCalendarOpen && (
                            <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
                                {/* Backdrop */}
                                <div 
                                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                                    onClick={() => setIsCalendarOpen(false)}
                                />
                                
                                {/* Bottom Sheet */}
                                <div 
                                    className="relative w-full rounded-t-3xl glass-modal animate-slide-up pb-safe"
                                    style={{ maxHeight: '70vh' }}
                                >
                                    {/* Handle bar */}
                                    <div className="flex justify-center pt-3 pb-2">
                                        <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-outline-variant)' }} />
                                    </div>
                                    
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-5 pb-4" style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                                        <button 
                                            onClick={() => setIsCalendarOpen(false)}
                                            className="text-sm font-medium"
                                            style={{ color: 'var(--color-on-surface-variant)' }}
                                        >
                                            İptal
                                        </button>
                                        <span className="text-base font-bold" style={{ color: 'var(--color-on-surface)' }}>
                                            Tarih Seç
                                        </span>
                                        <button 
                                            onClick={() => setIsCalendarOpen(false)}
                                            className="text-sm font-bold"
                                            style={{ color: 'var(--color-primary-500)' }}
                                        >
                                            Tamam
                                        </button>
                                    </div>

                                    {/* Quick Buttons */}
                                    <div className="flex gap-2 px-5 py-3">
                                        <button
                                            onClick={() => {
                                                setSelectedDate(todayStr);
                                                setIsCalendarOpen(false);
                                            }}
                                            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                                            style={{
                                                background: todayStr === selectedDate ? 'var(--color-primary-500)' : 'var(--color-surface-container)',
                                                color: todayStr === selectedDate ? 'white' : 'var(--color-on-surface)'
                                            }}
                                        >
                                            Bugün
                                        </button>
                                        <button
                                            onClick={() => {
                                                const yesterday = new Date();
                                                yesterday.setDate(yesterday.getDate() - 1);
                                                setSelectedDate(toLocalDateStr(yesterday));
                                                setIsCalendarOpen(false);
                                            }}
                                            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                                            style={{
                                                background: 'var(--color-surface-container)',
                                                color: 'var(--color-on-surface)'
                                            }}
                                        >
                                            Dün
                                        </button>
                                    </div>

                                    {/* Month/Year Navigation */}
                                    <div className="flex items-center justify-between px-5 py-3">
                                        <button
                                            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                                            className="w-10 h-10 rounded-full flex items-center justify-center"
                                            style={{ background: 'var(--color-surface-container)' }}
                                        >
                                            <ChevronLeft size={20} style={{ color: 'var(--color-on-surface)' }} />
                                        </button>
                                        <span className="text-lg font-bold" style={{ color: 'var(--color-on-surface)' }}>
                                            {monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                                        </span>
                                        <button
                                            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                                            className="w-10 h-10 rounded-full flex items-center justify-center"
                                            style={{ background: 'var(--color-surface-container)' }}
                                        >
                                            <ChevronRight size={20} style={{ color: 'var(--color-on-surface)' }} />
                                        </button>
                                    </div>

                                    {/* Day Headers */}
                                    <div className="grid grid-cols-7 gap-1 px-3 py-2">
                                        {dayHeaders.map(day => (
                                            <div 
                                                key={day} 
                                                className="h-8 flex items-center justify-center text-xs font-bold"
                                                style={{ color: 'var(--color-on-surface-variant)' }}
                                            >
                                                {day}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Calendar Grid */}
                                    <div className="grid grid-cols-7 gap-1 px-3 pb-6">
                                        {getCalendarDays().map((item, idx) => {
                                            if (!item.date) return <div key={idx} />;
                                            const dateStr = toLocalDateStr(item.date);
                                            const isSelected = dateStr === selectedDate;
                                            const isToday = dateStr === todayStr;
                                            const isWeekend = item.date.getDay() === 0 || item.date.getDay() === 6;
                                            
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => {
                                                        setSelectedDate(dateStr);
                                                        setIsCalendarOpen(false);
                                                    }}
                                                    className={`
                                                        h-11 rounded-full flex items-center justify-center text-base font-medium
                                                        transition-all duration-200 active:scale-95
                                                        ${!item.isCurrentMonth ? 'opacity-30' : ''}
                                                    `}
                                                    style={{
                                                        background: isSelected 
                                                            ? 'var(--color-primary-500)'
                                                            : isToday
                                                            ? 'var(--color-primary-100)'
                                                            : 'transparent',
                                                        color: isSelected 
                                                            ? 'white' 
                                                            : isWeekend && item.isCurrentMonth
                                                            ? 'var(--color-primary-500)'
                                                            : 'var(--color-on-surface)'
                                                    }}
                                                >
                                                    {item.date.getDate()}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
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

            {/* Daily Progress - Premium Card with Gradient Ring */}
            <section 
                className="p-5 rounded-2xl"
                style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.9) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.8)'
                }}
                aria-label="Daily progress"
            >
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
                                stroke={isTargetMet ? 'var(--color-success)' : 'var(--color-primary-500)'}
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
            <section 
                className="p-5 space-y-4 rounded-2xl"
                style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)'
                }}
                aria-label="Quick actions"
            >
                <h2 className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.05em' }}>
                    <span className="w-1.5 h-1.5 rounded-full breathing-dot" style={{ background: 'linear-gradient(135deg, var(--color-success), var(--color-primary-500))' }} />
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
                            className="w-full text-sm font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ 
                                background: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
                                color: 'white',
                                opacity: isDistributing ? 0.7 : 1,
                                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
                            }}
                            title="Tüm worklog'lara eşit süre dağıtır"
                            disabled={isDistributing}
                        >
                            <Clock size={16} /> Eşit Dağıt
                        </button>
                        
                        {/* AI Smart Distribution */}
                        <button 
                            onClick={previewSmartDistribute}
                            className="w-full text-sm font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ 
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                                color: 'white',
                                boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)'
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
                    <label className="text-[11px] font-semibold uppercase tracking-wide block mb-3 flex items-center gap-2" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.05em' }}>
                        <Sparkles size={12} style={{ color: 'var(--color-ai-500)' }} />
                        AI Metin İşlemleri
                    </label>
                    <div className="space-y-2">
                        <button 
                            onClick={() => previewBatchAI('SPELL')}
                            className="w-full text-sm font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ 
                                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)',
                                border: '1.5px solid rgba(245, 158, 11, 0.4)',
                                color: '#D97706'
                            }}
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
                            className="w-full text-sm font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ 
                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%)',
                                border: '1.5px solid rgba(139, 92, 246, 0.4)',
                                color: '#7C3AED'
                            }}
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
                onWorklogDrop={onWorklogDrop}
            />
        </aside>
    );
};
