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
        <>
        <header className="apple-header" style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderBottom: '1px solid rgba(0,0,0,0.06)'
        }}>
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink">
                {/* Modern Logo with glow effect */}
                <div className="relative flex-shrink-0">
                    <div className="absolute inset-0 rounded-xl sm:rounded-2xl blur-xl opacity-40" style={{ background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)' }} />
                    <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-xl" 
                         style={{ 
                             background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)',
                             boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)'
                         }}>
                        <CalendarIcon className="text-white" size={20} strokeWidth={1.5} />
                    </div>
                </div>
                <div className="min-w-0">
                    <h1 className="text-lg sm:text-2xl md:text-[28px] font-bold bg-clip-text text-transparent truncate" 
                        style={{ 
                            backgroundImage: 'linear-gradient(135deg, var(--color-on-surface) 0%, var(--color-primary-600) 100%)',
                            letterSpacing: '-0.03em' 
                        }}>
                        Worklog
                    </h1>
                    <p className="text-[11px] sm:text-[13px] mt-0.5 items-center gap-1.5 hidden sm:flex" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '-0.01em' }}>
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Jira Cloud ile senkronize
                    </p>
                </div>
            </div>

            {/* Header Actions (desktop) */}
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                {/* Add Worklog Button - Premium gradient with glow (Desktop only) */}
                <button 
                    onClick={() => setIsAddWorklogOpen(true)} 
                    className="desktop-only flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:scale-[1.03] active:scale-[0.98] relative group"
                    style={{ 
                        background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)', 
                        color: 'white',
                        boxShadow: '0 4px 15px rgba(59, 130, 246, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                    }}
                >
                    <Plus size={16} strokeWidth={2.5}/> Yeni
                    {showShortcuts && <ShortcutBadge char="N" />}
                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" 
                         style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 100%)' }} />
                </button>
                
                {/* Assigned Issues Drawer */}
                <button 
                    onClick={onToggleDrawer} 
                    className="btn-icon"
                    aria-label="Assigned Issues"
                    title="Bana Atananlar"
                >
                    <Layout size={18}/>
                </button>

                {/* Weekly Report */}
                <button 
                    onClick={() => setIsWeeklyReportOpen(true)} 
                    className="btn-icon"
                    aria-label="Weekly report"
                    title="Haftalık Rapor Oluştur"
                >
                    <FileSpreadsheet size={18}/>
                </button>
                
                {/* Notification History */}
                <button 
                    onClick={() => setIsHistoryOpen(true)} 
                    className="btn-icon relative"
                    aria-label="Notification history"
                >
                    <Bell size={18}/>
                    {undoableCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ backgroundColor: 'var(--color-error)', color: 'white' }}>
                            {undoableCount}
                        </span>
                    )}
                </button>
                
                {/* Theme Toggle */}
                <button 
                    onClick={toggleTheme} 
                    className="btn-icon"
                    aria-label="Toggle theme"
                >
                    {isDarkTheme ? <Sun size={18}/> : <Moon size={18}/>}
                </button>
                
                {/* Settings */}
                <button 
                    onClick={() => setIsSettingsOpen(true)} 
                    className="btn-icon relative"
                    aria-label="Settings"
                >
                    <Settings size={18} />
                    {showShortcuts && <ShortcutBadge char="," />}
                </button>
            </div>
        </header>
        
        {/* Mobile Bottom Navigation - Sadece mobil cihazlarda görünür */}
        <nav className="mobile-only fixed bottom-0 left-0 right-0 z-50 safe-area-bottom bottom-nav"
             style={{ 
                 background: 'var(--glass-bg)',
                 backdropFilter: 'blur(20px)',
                 WebkitBackdropFilter: 'blur(20px)',
                 borderTop: '1px solid var(--glass-border)'
             }}>
            <div className="flex items-center justify-around px-2 py-2">
                {/* Assigned Issues */}
                <button 
                    onClick={onToggleDrawer} 
                    className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Layout size={20}/>
                    <span className="text-[10px] font-medium">Atananlar</span>
                </button>
                
                {/* Weekly Report */}
                <button 
                    onClick={() => setIsWeeklyReportOpen(true)} 
                    className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <FileSpreadsheet size={20}/>
                    <span className="text-[10px] font-medium">Rapor</span>
                </button>
                
                {/* Add Worklog - Centered prominent button */}
                <button 
                    onClick={() => setIsAddWorklogOpen(true)} 
                    className="flex flex-col items-center gap-1 p-3 -mt-4 rounded-2xl transition-all active:scale-95"
                    style={{ 
                        background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)',
                        color: 'white',
                        boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
                    }}
                >
                    <Plus size={24} strokeWidth={2.5}/>
                </button>
                
                {/* Notifications */}
                <button 
                    onClick={() => setIsHistoryOpen(true)} 
                    className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 relative"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Bell size={20}/>
                    {undoableCount > 0 && (
                        <span className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                              style={{ backgroundColor: 'var(--color-error)', color: 'white' }}>
                            {undoableCount}
                        </span>
                    )}
                    <span className="text-[10px] font-medium">Bildirimler</span>
                </button>
                
                {/* Settings */}
                <button 
                    onClick={() => setIsSettingsOpen(true)} 
                    className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <Settings size={20}/>
                    <span className="text-[10px] font-medium">Ayarlar</span>
                </button>
            </div>
        </nav>
        </>
    );
};
