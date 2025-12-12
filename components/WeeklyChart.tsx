import React, { useMemo, useState } from 'react';
import { RefreshCw, MoveHorizontal } from 'lucide-react';
import { AppSettings } from '../types';

interface WeeklyChartProps {
    weeklyHours: { date: string; hours: number; dayName: string }[];
    settings: AppSettings;
    selectedDate: string;
    setSelectedDate: (date: string) => void;
    isLoadingWeek: boolean;
    onWorklogDrop?: (worklogId: string, newDate: string) => void;
}

export const WeeklyChart: React.FC<WeeklyChartProps> = ({
    weeklyHours,
    settings,
    selectedDate,
    setSelectedDate,
    isLoadingWeek,
    onWorklogDrop
}) => {
    const [dragOverDate, setDragOverDate] = useState<string | null>(null);
    const maxHours = Math.max(...weeklyHours.map(d => d.hours), settings.targetDailyHours);
    
    // Haftanın tarih aralığını hesapla
    const weekRange = useMemo(() => {
      if (weeklyHours.length === 0) return '';
      const firstDay = weeklyHours[0];
      const lastDay = weeklyHours[weeklyHours.length - 1];
      if (!firstDay || !lastDay) return '';
      
      const formatDate = (dateStr: string) => {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}`;
      };
      
      return `${formatDate(firstDay.date)} - ${formatDate(lastDay.date)}`;
    }, [weeklyHours]);
    
    const handleDragOver = (e: React.DragEvent, date: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverDate(date);
    };
    
    const handleDragLeave = () => {
        setDragOverDate(null);
    };
    
    const handleDrop = (e: React.DragEvent, date: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverDate(null);
        
        try {
            const data = e.dataTransfer.getData('application/worklog');
            if (data && onWorklogDrop) {
                const { worklogId, currentDate } = JSON.parse(data);
                if (currentDate !== date) {
                    onWorklogDrop(worklogId, date);
                }
            }
        } catch (err) {
            console.error('Drop error:', err);
        }
    };
    
    return (
      <section 
        className="p-5 rounded-2xl"
        style={{
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)'
        }}
        aria-label="Weekly overview"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--color-on-surface-variant)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'linear-gradient(135deg, var(--color-warning), var(--color-error))' }} />
            Haftalık Özet
          </h2>
          <div className="flex items-center gap-2">
            {isLoadingWeek && (
              <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--color-primary-500)' }} />
            )}
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              {weekRange || 'Yükleniyor...'}
            </span>
          </div>
        </div>
        <div className="flex items-end justify-between gap-1 h-24">
          {weeklyHours.map((day, idx) => {
            const heightPercent = maxHours > 0 ? (day.hours / maxHours) * 100 : 0;
            const isToday = day.date === selectedDate;
            const metTarget = day.hours >= settings.targetDailyHours;
            const isDragOver = dragOverDate === day.date;
            
            return (
              <div key={day.date} className="flex flex-col items-center flex-1 gap-1">
                <div 
                  className={`w-full relative group cursor-pointer transition-all duration-200 ${isDragOver ? 'scale-110' : ''}`}
                  style={{ height: '80px' }}
                  onClick={() => setSelectedDate(day.date)}
                  onDragOver={(e) => handleDragOver(e, day.date)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, day.date)}
                >
                  {/* Drop indicator */}
                  {isDragOver && (
                    <div className="absolute inset-0 rounded-lg border-2 border-dashed animate-pulse z-20 flex items-center justify-center"
                         style={{ borderColor: 'var(--color-primary-500)', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                      <MoveHorizontal size={16} style={{ color: 'var(--color-primary-500)' }} />
                    </div>
                  )}
                  {/* Target line */}
                  <div 
                    className="absolute w-full border-t border-dashed transition-all duration-500 ease-out"
                    style={{ 
                      bottom: `${(settings.targetDailyHours / maxHours) * 100}%`,
                      borderColor: 'var(--color-warning)',
                      opacity: 0.5
                    }}
                  />
                  {/* Bar */}
                  <div 
                    className={`absolute bottom-0 w-full rounded-t-sm transition-all duration-500 ease-out ${settings.isDarkTheme && metTarget ? 'glow-success' : ''}`}
                    style={{ 
                      height: `${Math.max(heightPercent, 4)}%`,
                      backgroundColor: metTarget 
                        ? 'var(--color-success)' 
                        : isToday 
                        ? 'var(--color-primary-500)' 
                        : 'var(--color-primary-300)',
                      opacity: isToday ? 1 : 0.7
                    }}
                  />
                  {/* Tooltip */}
                  <div 
                    className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap px-2 py-1 rounded text-xs font-medium"
                    style={{ 
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      boxShadow: 'var(--elevation-2)'
                    }}
                  >
                    {day.hours.toFixed(1)}h
                  </div>
                </div>
                <span 
                  className={`text-xs font-medium ${isToday ? 'font-bold' : ''}`}
                  style={{ color: isToday ? 'var(--color-primary-600)' : 'var(--color-on-surface-variant)' }}
                >
                  {day.dayName}
                </span>
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-success)' }} />
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Hedef ✓</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 border-t border-dashed" style={{ borderColor: 'var(--color-warning)', width: '12px' }} />
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{settings.targetDailyHours}h hedef</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MoveHorizontal size={12} style={{ color: 'var(--color-on-surface-variant)' }} />
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Sürükle-bırak</span>
          </div>
        </div>
      </section>
    );
  };
