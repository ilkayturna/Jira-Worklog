
import React, { useState, useEffect, useMemo } from 'react';
import { Settings, Moon, Sun, Calendar as CalendarIcon, RefreshCw, CheckCircle2, AlertCircle, Info, ChevronLeft, ChevronRight, Copy, Sparkles, Clock } from 'lucide-react';
import { AppSettings, Worklog, LoadingState, Notification, DEFAULT_SYSTEM_PROMPT } from './types';
import { fetchWorklogs, updateWorklog, callGroq, createWorklog } from './services/api';
import { SettingsModal } from './components/SettingsModal';
import { WorklogList } from './components/WorklogList';
import { secondsToHours } from './utils/adf';

const APP_NAME = 'WorklogPro';

const detectJiraUrl = () => {
    const saved = localStorage.getItem(`${APP_NAME}_jiraUrl`);
    if (saved) return saved;
    // Auto-detect if running inside Jira
    if (window.location.hostname.includes('atlassian.net')) {
        return window.location.origin;
    }
    return '';
};

// Initial State
const initialSettings: AppSettings = {
  jiraUrl: detectJiraUrl(),
  jiraEmail: localStorage.getItem(`${APP_NAME}_jiraEmail`) || '',
  jiraToken: localStorage.getItem(`${APP_NAME}_jiraToken`) || '',
  groqApiKey: localStorage.getItem(`${APP_NAME}_groqApiKey`) || '',
  groqModel: localStorage.getItem(`${APP_NAME}_groqModel`) || 'llama-3.3-70b-versatile',
  targetDailyHours: parseFloat(localStorage.getItem(`${APP_NAME}_targetDailyHours`) || '8'),
  minHoursPerWorklog: parseFloat(localStorage.getItem(`${APP_NAME}_minHours`) || '0.25'),
  aiSystemPrompt: localStorage.getItem(`${APP_NAME}_aiPrompt`) || DEFAULT_SYSTEM_PROMPT,
  isDarkTheme: localStorage.getItem(`${APP_NAME}_theme`) !== 'light',
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [distributeTarget, setDistributeTarget] = useState<string>(settings.targetDailyHours.toString());
  
  // Stats
  const totalHours = useMemo(() => worklogs.reduce((acc, wl) => acc + wl.hours, 0), [worklogs]);
  const progress = Math.min((totalHours / settings.targetDailyHours) * 100, 100);
  const isTargetMet = totalHours >= settings.targetDailyHours;

  // --- Effects ---

  useEffect(() => {
    if (settings.isDarkTheme) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [settings.isDarkTheme]);

  useEffect(() => {
    // Only load if all credentials are present to prevent errors
    if(settings.jiraUrl && settings.jiraToken && settings.jiraEmail) {
        loadData();
    }
  }, [selectedDate]);

  // --- Actions ---

  const notify = (title: string, message: string, type: Notification['type'] = 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, title, message, type, timestamp: Date.now() }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  };

  const saveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    // Persist
    Object.entries(newSettings).forEach(([key, value]) => {
        localStorage.setItem(`${APP_NAME}_${key}`, String(value));
    });
    setIsSettingsOpen(false);
    notify('Ayarlar Kaydedildi', 'Yapılandırmanız güncellendi.', 'success');
    
    // Reload data immediately if credentials are present
    if (newSettings.jiraUrl && newSettings.jiraEmail && newSettings.jiraToken) {
        loadData(newSettings);
    }
  };

  const loadData = async (currentSettings = settings) => {
    if (!currentSettings.jiraUrl || !currentSettings.jiraEmail || !currentSettings.jiraToken) {
        return;
    }

    setLoadingState(LoadingState.LOADING);
    try {
      const data = await fetchWorklogs(selectedDate, currentSettings);
      setWorklogs(data);
      setLoadingState(LoadingState.SUCCESS);
    } catch (e: any) {
      console.error(e);
      setLoadingState(LoadingState.ERROR);
      notify('Veri Yükleme Hatası', e.message, 'error');
      if(e.message.includes('Bilgileri Eksik') || e.message.includes('401')) {
          setIsSettingsOpen(true);
      }
    }
  };

  const handleUpdateWorklog = async (id: string, comment?: string, seconds?: number) => {
    const wl = worklogs.find(w => w.id === id);
    if (!wl) return;

    try {
      await updateWorklog(wl, settings, comment, seconds);
      
      // Optimistic Update
      setWorklogs(prev => prev.map(w => {
          if(w.id !== id) return w;
          return {
              ...w,
              comment: comment !== undefined ? comment : w.comment,
              seconds: seconds !== undefined ? seconds : w.seconds,
              hours: seconds !== undefined ? secondsToHours(seconds) : w.hours
          };
      }));
      notify('Güncellendi', 'Kayıt başarıyla güncellendi', 'success');
    } catch (e: any) {
      notify('Güncelleme Başarısız', e.message, 'error');
      loadData(); // Revert
    }
  };

  const handleAIAction = async (id: string, mode: 'IMPROVE' | 'SPELL') => {
    const wl = worklogs.find(w => w.id === id);
    if(!wl || !wl.comment) return;

    if (!settings.groqApiKey) {
        notify('AI Hatası', 'Ayarlarda Groq API Anahtarı eksik', 'error');
        setIsSettingsOpen(true);
        return;
    }

    try {
        let prompt = '';
        if (mode === 'IMPROVE') {
            prompt = `
            BAĞLAM: Jira Talep Özeti: "${wl.summary}".
            GÖREV: ${settings.aiSystemPrompt}
            GİRDİ METİN: "${wl.comment}"
            ÇIKTI: Sadece iyileştirilmiş metin. Markdown yok, tırnak işareti yok.
            `;
        } else {
             prompt = `
            GÖREV: Sadece imla ve gramer hatalarını düzelt. Anlamı değiştirme. Ekstra içerik ekleme.
            GİRDİ METİN: "${wl.comment}"
            ÇIKTI: Sadece düzeltilmiş metin.
            `;
        }

        const improvedText = await callGroq(prompt, settings);
        if (improvedText && improvedText.trim() !== wl.comment) {
            await handleUpdateWorklog(id, improvedText.trim());
        } else {
            notify('Bilgi', 'Yapay zeka önemli bir değişiklik önermedi.', 'info');
        }

    } catch (e: any) {
        notify('AI Başarısız', e.message, 'error');
    }
  };

  const handleDistribute = async (mode: 'equal' | 'proportional' = 'proportional') => {
     if (loadingState === LoadingState.LOADING) return;
     
     const target = parseFloat(distributeTarget) || settings.targetDailyHours;
     const currentTotal = worklogs.reduce((sum, wl) => sum + wl.hours, 0);
     
     if (worklogs.length === 0) {
         notify('Hata', 'Dağıtılacak worklog bulunamadı.', 'error');
         return;
     }

     if (Math.abs(target - currentTotal) < 0.01 && mode === 'proportional') {
         notify('Hedef Tamam', 'Saatler zaten hedefe uygun!', 'success');
         return;
     }

     notify('Dağıtılıyor', `${target} saat hedefe göre dağıtılıyor...`, 'info');
     
     const targetSeconds = Math.round(target * 3600);
     const minSeconds = Math.round(settings.minHoursPerWorklog * 3600);
     const count = worklogs.length;
     
     let newSecondsArray: number[] = [];
     
     if (mode === 'equal') {
         // Eşit dağıtım: Her worklog'a eşit süre
         const perLog = Math.floor(targetSeconds / count);
         const remainder = targetSeconds % count;
         newSecondsArray = worklogs.map((_, i) => perLog + (i < remainder ? 1 : 0));
     } else {
         // Orantılı dağıtım: Mevcut oranları koruyarak hedefe ulaş
         const totalCurrentSeconds = worklogs.reduce((sum, wl) => sum + wl.seconds, 0);
         if (totalCurrentSeconds === 0) {
             // Tümü 0 ise eşit dağıt
             const perLog = Math.floor(targetSeconds / count);
             const remainder = targetSeconds % count;
             newSecondsArray = worklogs.map((_, i) => perLog + (i < remainder ? 1 : 0));
         } else {
             const ratio = targetSeconds / totalCurrentSeconds;
             let distributed = 0;
             newSecondsArray = worklogs.map((wl, i) => {
                 if (i === count - 1) {
                     // Son eleman: kalanı al (yuvarlama hatasını düzelt)
                     return Math.max(minSeconds, targetSeconds - distributed);
                 }
                 const newSec = Math.max(minSeconds, Math.round(wl.seconds * ratio));
                 distributed += newSec;
                 return newSec;
             });
         }
     }
     
     try {
         // Update all
         const promises = worklogs.map(async (wl, index) => {
             const newSeconds = newSecondsArray[index];
             if (newSeconds !== wl.seconds) {
                await updateWorklog(wl, settings, undefined, newSeconds);
             }
         });
         
         await Promise.all(promises);
         await loadData();
         notify('Dağıtıldı', 'Süreler günlük hedefe göre dağıtıldı.', 'success');
     } catch (e: any) {
         notify('Dağıtım Hatası', e.message, 'error');
     }
  };

  const copyPreviousDay = async () => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() - 1);
      // Skip weekend if Monday
      if (date.getDay() === 0) date.setDate(date.getDate() - 2);
      const prevDateStr = date.toISOString().split('T')[0];
      
      notify('Kopyalanıyor', `${prevDateStr} tarihinden kayıtlar alınıyor...`, 'info');
      
      try {
          const prevLogs = await fetchWorklogs(prevDateStr, settings);
          if (prevLogs.length === 0) {
              notify('Kayıt Yok', 'Önceki iş gününde worklog bulunamadı.', 'warning');
              return;
          }
          
          // Create new logs for today
          const promises = prevLogs.map(wl => 
             createWorklog(wl.issueKey, selectedDate, wl.seconds, wl.comment, settings)
          );
          
          await Promise.all(promises);
          await loadData();
          notify('Başarılı', `Dünden ${prevLogs.length} adet worklog kopyalandı.`, 'success');

      } catch (e: any) {
          notify('Kopyalama Başarısız', e.message, 'error');
      }
  };

  // --- Render Helpers ---

  const changeDate = (days: number) => {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + days);
      setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <main className="min-h-screen py-6 px-4 md:py-10 md:px-6 animate-fade-in">
      
      {/* Main Container - Clean Google-style layout */}
      <div className="w-full max-w-5xl mx-auto space-y-6">
        
        {/* Header - Minimal & Clean */}
        <header className="surface-card p-4 md:p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
                {/* Logo */}
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                    <CalendarIcon className="text-white" size={22} />
                </div>
                <div>
                    <h1 className="text-lg md:text-xl font-semibold tracking-tight" style={{ color: 'var(--color-on-surface)' }}>
                        Worklog Manager
                    </h1>
                    <p className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
                        Jira Cloud Integration
                    </p>
                </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-1">
                <button 
                    onClick={() => setSettings(s => ({...s, isDarkTheme: !s.isDarkTheme}))} 
                    className="btn-icon"
                    aria-label="Toggle theme"
                >
                    {settings.isDarkTheme ? <Sun size={20}/> : <Moon size={20}/>}
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

        {/* Dashboard Grid - Responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Sidebar: Controls & Stats */}
            <aside className="lg:col-span-4 space-y-5">
                
                {/* Date Picker Card */}
                <section className="surface-card p-5" aria-label="Date selection">
                    <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
                        Tarih Seçimi
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
                </section>

                {/* Daily Progress Card - Premium Feel */}
                <section 
                    className="relative p-6 rounded-2xl overflow-hidden"
                    style={{ 
                        background: isTargetMet 
                            ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' 
                            : 'linear-gradient(135deg, #1a73e8 0%, #4285f4 100%)',
                        boxShadow: isTargetMet 
                            ? '0 8px 32px -8px rgba(5, 150, 105, 0.5)' 
                            : '0 8px 32px -8px rgba(26, 115, 232, 0.5)'
                    }}
                    aria-label="Daily progress"
                >
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute -right-8 -top-8">
                            <Clock size={120} strokeWidth={1} />
                        </div>
                    </div>
                    
                    <div className="relative z-10">
                        <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                            Günlük İlerleme
                        </span>
                        
                        {/* Big Number Display */}
                        <div className="flex items-baseline gap-2 mt-3 mb-5">
                            <span className="text-5xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>
                                {totalHours.toFixed(1)}
                            </span>
                            <span className="text-white/60 text-lg font-medium">
                                / {settings.targetDailyHours}h
                            </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                            <div 
                                className="h-full bg-white rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        
                        {/* Status Text */}
                        <p className="mt-4 text-sm text-white/90 flex items-center gap-2 font-medium">
                            {isTargetMet ? (
                                <>
                                    <CheckCircle2 size={16} />
                                    <span>Günlük hedef tamamlandı!</span>
                                </>
                            ) : (
                                <>
                                    <Clock size={16} />
                                    <span>{(settings.targetDailyHours - totalHours).toFixed(1)} saat kaldı</span>
                                </>
                            )}
                        </p>
                    </div>
                </section>

                {/* Quick Actions Card */}
                <section className="surface-card p-5 space-y-4" aria-label="Quick actions">
                    <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-on-surface-variant)' }}>
                        Hızlı İşlemler
                    </h2>
                    
                    {/* Refresh Button */}
                    <button 
                        onClick={() => loadData()} 
                        className="btn-outlined w-full ripple"
                        disabled={loadingState === LoadingState.LOADING}
                    >
                        <RefreshCw size={18} className={loadingState === LoadingState.LOADING ? 'animate-spin' : ''}/> 
                        Verileri Yenile
                    </button>
                     
                    {/* Distribution Section */}
                    <div className="pt-4 border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
                        <label className="text-xs font-semibold uppercase tracking-wider block mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
                            Saat Dağıtımı
                        </label>
                        
                        {/* Target Input */}
                        <div className="flex items-center gap-3 mb-3">
                            <input 
                                type="number" 
                                step="0.25" 
                                min="0.25" 
                                max="24"
                                value={distributeTarget}
                                onChange={(e) => setDistributeTarget(e.target.value)}
                                className="input-filled flex-1 text-center font-semibold"
                                style={{ fontFamily: 'var(--font-mono)' }}
                                placeholder="8"
                                aria-label="Target hours"
                            />
                            <span className="text-sm font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>saat</span>
                        </div>
                        
                        {/* Distribution Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => handleDistribute('proportional')} 
                                className="btn-tonal ripple text-sm"
                                title="Mevcut oranları koruyarak hedefe ulaştırır"
                            >
                                <Sparkles size={16} /> Orantılı
                            </button>
                            <button 
                                onClick={() => handleDistribute('equal')} 
                                className="btn-tonal ripple text-sm"
                                style={{ 
                                    backgroundColor: 'var(--color-success-container)', 
                                    color: 'var(--color-success)' 
                                }}
                                title="Tüm worklog'lara eşit süre dağıtır"
                            >
                                <Clock size={16} /> Eşit
                            </button>
                        </div>
                    </div>
                     
                    {/* Copy Previous Day */}
                    <button 
                        onClick={copyPreviousDay} 
                        className="btn-text w-full"
                    >
                        <Copy size={18} /> Dünden Kopyala
                    </button>
                </section>
            </aside>

            {/* Right: Worklog List */}
            <section className="lg:col-span-8" aria-label="Worklog list">
                <div className="surface-card p-4 md:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                            Worklog Kayıtları
                        </h2>
                        <span className="chip">
                            {worklogs.length} kayıt
                        </span>
                    </div>
                    <WorklogList 
                        worklogs={worklogs} 
                        loading={loadingState} 
                        onUpdate={handleUpdateWorklog}
                        onImprove={(id) => handleAIAction(id, 'IMPROVE')}
                        onSpellCheck={(id) => handleAIAction(id, 'SPELL')}
                    />
                </div>
            </section>

        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings} 
        onSave={saveSettings} 
      />

      {/* Toast Notifications - Material Design Style */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50 pointer-events-none" role="alert" aria-live="polite">
          {notifications.map((n, index) => (
              <div 
                  key={n.id} 
                  className="pointer-events-auto flex items-start gap-3 p-4 rounded-xl max-w-sm animate-slide-in-right"
                  style={{ 
                      backgroundColor: n.type === 'success' ? 'var(--color-success-container)' :
                                       n.type === 'error' ? 'var(--color-error-container)' :
                                       n.type === 'warning' ? 'var(--color-warning-container)' :
                                       'var(--color-surface)',
                      boxShadow: 'var(--elevation-3)',
                      animationDelay: `${index * 50}ms`
                  }}
              >
                  <div className="shrink-0 mt-0.5">
                      {n.type === 'success' && <CheckCircle2 size={20} style={{ color: 'var(--color-success)' }} />}
                      {n.type === 'error' && <AlertCircle size={20} style={{ color: 'var(--color-error)' }} />}
                      {n.type === 'info' && <Info size={20} style={{ color: 'var(--color-primary-600)' }} />}
                      {n.type === 'warning' && <AlertCircle size={20} style={{ color: 'var(--color-warning)' }} />}
                  </div>
                  <div>
                      <h4 className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>{n.title}</h4>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>{n.message}</p>
                  </div>
              </div>
          ))}
      </div>

    </main>
  );
}
