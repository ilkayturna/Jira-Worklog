import React from 'react';
import { Calendar as CalendarIcon, Plus, FileSpreadsheet, Bell, Sun, Moon, Settings, Layout } from 'lucide-react';
import { useModifierKey } from '../hooks/useModifierKey';

interface HeaderProps {
    setIsAddWorklogOpen: (value: boolean) => void;
    setIsWeeklyReportOpen: (value: boolean) => void;
    setIsHistoryOpen: (value: boolean) => void;
    setIsSettingsOpen: (value: boolean) => void;
    toggleTheme: () => void;
    isDarkTheme: boolean;
    undoableCount: number;
    onToggleDrawer: () => void;
}

const ShortcutBadge = ({ char }: { char: string }) => (
    <span className="absolute -top-2 -right-2 w-5 h-5 bg-black text-white dark:bg-white dark:text-black rounded-md flex items-center justify-center text-[10px] font-bold shadow-sm animate-in zoom-in duration-200 z-10 border border-white/20">
        {char}
    </span>
);

export const Header: React.FC<HeaderProps> = ({
    setIsAddWorklogOpen,
    setIsWeeklyReportOpen,
    setIsHistoryOpen,
    setIsSettingsOpen,
    toggleTheme,
    isDarkTheme,
    undoableCount,
    onToggleDrawer
}) => {
    const isCtrlPressed = useModifierKey('Control');
    const isMetaPressed = useModifierKey('Meta');
    const showShortcuts = isCtrlPressed || isMetaPressed;

    return (
        <header className="apple-header" style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderBottom: '1px solid rgba(0,0,0,0.06)'
        }}>
            <div className="flex items-center gap-4">
                {/* Modern Logo with glow effect */}
                <div className="relative">
                    <div className="absolute inset-0 rounded-2xl blur-xl opacity-40" style={{ background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)' }} />
                    <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shadow-xl" 
                         style={{ 
                             background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)',
                             boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)'
                         }}>
                        <CalendarIcon className="text-white" size={28} strokeWidth={1.5} />
                    </div>
                </div>
                <div>
                    <h1 className="text-2xl md:text-[28px] font-bold bg-clip-text text-transparent" 
                        style={{ 
                            backgroundImage: 'linear-gradient(135deg, var(--color-on-surface) 0%, var(--color-primary-600) 100%)',
                            letterSpacing: '-0.03em' 
                        }}>
                        Worklog
                    </h1>
                    <p className="text-[13px] mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '-0.01em' }}>
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Jira Cloud ile senkronize
                    </p>
                </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-2">
                {/* Add Worklog Button - Premium gradient with glow */}
                <button 
                    onClick={() => setIsAddWorklogOpen(true)} 
                    className="hidden sm:flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all hover:scale-[1.03] active:scale-[0.98] relative group"
                    style={{ 
                        background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)', 
                        color: 'white',
                        boxShadow: '0 4px 15px rgba(59, 130, 246, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                    }}
                >
                    <Plus size={18} strokeWidth={2.5}/> Yeni Worklog
                    {showShortcuts && <ShortcutBadge char="N" />}
                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" 
                         style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 100%)' }} />
                </button>
                <button 
                    onClick={() => setIsAddWorklogOpen(true)} 
                    className="btn-icon sm:hidden relative"
                    style={{ backgroundColor: 'var(--color-primary-600)', color: 'white' }}
                    aria-label="Add worklog"
                >
                    <Plus size={20}/>
                </button>
                
                {/* Assigned Issues Drawer */}
                <button 
                    onClick={onToggleDrawer} 
                    className="btn-icon"
                    aria-label="Assigned Issues"
                    title="Bana Atananlar"
                >
                    <Layout size={20}/>
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
                    className="btn-icon relative"
                    aria-label="Settings"
                >
                    <Settings size={20} />
                    {showShortcuts && <ShortcutBadge char="," />}
                </button>
            </div>
        </header>
    );
};
