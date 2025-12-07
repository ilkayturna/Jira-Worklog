import React from 'react';
import { Calendar as CalendarIcon, Plus, FileSpreadsheet, Bell, Sun, Moon, Settings } from 'lucide-react';

interface HeaderProps {
    setIsAddWorklogOpen: (value: boolean) => void;
    setIsWeeklyReportOpen: (value: boolean) => void;
    setIsHistoryOpen: (value: boolean) => void;
    setIsSettingsOpen: (value: boolean) => void;
    toggleTheme: () => void;
    isDarkTheme: boolean;
    undoableCount: number;
}

export const Header: React.FC<HeaderProps> = ({
    setIsAddWorklogOpen,
    setIsWeeklyReportOpen,
    setIsHistoryOpen,
    setIsSettingsOpen,
    toggleTheme,
    isDarkTheme,
    undoableCount
}) => {
    return (
        <header className="apple-header">
            <div className="flex items-center gap-4">
                {/* Apple-style Logo */}
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-[18px] flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)' }}>
                    <CalendarIcon className="text-white" size={28} strokeWidth={1.5} />
                </div>
                <div>
                    <h1 className="text-2xl md:text-[28px] font-bold" style={{ color: 'var(--color-on-surface)', letterSpacing: '-0.03em' }}>
                        Worklog
                    </h1>
                    <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '-0.01em' }}>
                        Jira Cloud ile senkronize
                    </p>
                </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-1">
                {/* Add Worklog Button - Apple style */}
                <button 
                    onClick={() => setIsAddWorklogOpen(true)} 
                    className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg, #007AFF 0%, #0055d4 100%)', color: 'white' }}
                >
                    <Plus size={16} strokeWidth={2.5}/> Yeni
                </button>
                <button 
                    onClick={() => setIsAddWorklogOpen(true)} 
                    className="btn-icon sm:hidden"
                    style={{ backgroundColor: 'var(--color-primary-600)', color: 'white' }}
                    aria-label="Add worklog"
                >
                    <Plus size={20}/>
                </button>
                
                {/* Weekly Report */}
                <button 
                    onClick={() => setIsWeeklyReportOpen(true)} 
                    className="btn-icon"
                    aria-label="Weekly report"
                    title="Haftalık Rapor Oluştur"
                >
                    <FileSpreadsheet size={20}/>
                </button>
                
                {/* Notification History */}
                <button 
                    onClick={() => setIsHistoryOpen(true)} 
                    className="btn-icon relative"
                    aria-label="Notification history"
                >
                    <Bell size={20}/>
                    {undoableCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ backgroundColor: 'var(--color-error)', color: 'white' }}>
                            {undoableCount}
                        </span>
                    )}
                </button>
                
                <button 
                    onClick={toggleTheme} 
                    className="btn-icon"
                    aria-label="Toggle theme"
                >
                    {isDarkTheme ? <Sun size={20}/> : <Moon size={20}/>}
                </button>
                <button 
                    onClick={() => setIsSettingsOpen(true)} 
                    className="btn-icon"
                    aria-label="Settings"
                >
                    <Settings size={20} />
                </button>
            </div>
        </header>
    );
};
