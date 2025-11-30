
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

  const handleDistribute = async () => {
     if (loadingState === LoadingState.LOADING) return;
     
     const currentTotal = worklogs.reduce((sum, wl) => sum + wl.hours, 0);
     const target = settings.targetDailyHours;
     const diff = target - currentTotal;

     if (Math.abs(diff) < 0.05) {
         notify('Hedef Tamam', 'Saatler zaten hedefe uygun!', 'success');
         return;
     }

     notify('Dağıtılıyor', 'En iyi dağılım hesaplanıyor...', 'info');
     
     // Simple algorithm for now (proportional distribution)
     const distributable = [...worklogs];
     if(distributable.length === 0) return;

     const diffSeconds = Math.round(diff * 3600);
     const secondsPerLog = Math.floor(diffSeconds / distributable.length);
     
     try {
         // Update all
         const promises = distributable.map(async (wl, index) => {
             // Add remainder to first one
             const extra = index === 0 ? (diffSeconds % distributable.length) : 0;
             const newSeconds = Math.max(
                 Math.round(settings.minHoursPerWorklog * 3600), 
                 wl.seconds + secondsPerLog + extra
             );
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
    <div className="min-h-screen flex flex-col items-center py-8 px-4 font-sans">
      
      {/* Main Container */}
      <div className="w-full max-w-4xl space-y-6">
        
        {/* Header */}
        <header className="flex items-center justify-between bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
                <div className="bg-jira-blue p-2 rounded-lg">
                    <CalendarIcon className="text-white" size={24} />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Worklog Yöneticisi Pro</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Jira Entegrasyonu</p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                 <button onClick={() => setSettings(s => ({...s, isDarkTheme: !s.isDarkTheme}))} className="p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    {settings.isDarkTheme ? <Sun size={20}/> : <Moon size={20}/>}
                 </button>
                 <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <Settings size={20} />
                 </button>
            </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left: Controls & Stats */}
            <div className="md:col-span-1 space-y-6">
                
                {/* Date Picker Card */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Seçili Tarih</label>
                    <div className="flex items-center gap-2 mb-4">
                        <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><ChevronLeft size={18}/></button>
                        <input 
                            type="date" 
                            value={selectedDate} 
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-center font-mono text-sm font-bold"
                        />
                        <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><ChevronRight size={18}/></button>
                    </div>
                </div>

                {/* Daily Progress Card */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-xl shadow-lg text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                        <Clock size={80} />
                    </div>
                    <div className="relative z-10">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Günlük İlerleme</span>
                        <div className="flex items-baseline gap-1 mt-2 mb-4">
                            <span className="text-4xl font-extrabold tracking-tighter">{totalHours.toFixed(2)}</span>
                            <span className="text-slate-400 font-medium">/ {settings.targetDailyHours}s</span>
                        </div>
                        
                        <div className="w-full bg-slate-700/50 h-3 rounded-full overflow-hidden backdrop-blur-sm">
                            <div 
                                className={`h-full transition-all duration-1000 ease-out ${isTargetMet ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <p className="mt-3 text-xs text-slate-300 flex items-center gap-2">
                            {isTargetMet ? <CheckCircle2 size={14} className="text-emerald-400"/> : <Info size={14} />}
                            {isTargetMet ? 'Günlük hedef tamam!' : `${(settings.targetDailyHours - totalHours).toFixed(2)}s kaldı`}
                        </p>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                     <button onClick={() => loadData()} className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium transition-colors text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <RefreshCw size={16} className={loadingState === LoadingState.LOADING ? 'animate-spin' : ''}/> Verileri Yenile
                     </button>
                     <button onClick={handleDistribute} className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-sm font-medium transition-colors text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                        <Sparkles size={16} /> Akıllı Dağıt
                     </button>
                     <button onClick={copyPreviousDay} className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium transition-colors text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <Copy size={16} /> Dünden Kopyala
                     </button>
                </div>
            </div>

            {/* Right: Worklog List */}
            <div className="md:col-span-2">
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-1">
                    <WorklogList 
                        worklogs={worklogs} 
                        loading={loadingState} 
                        onUpdate={handleUpdateWorklog}
                        onImprove={(id) => handleAIAction(id, 'IMPROVE')}
                        onSpellCheck={(id) => handleAIAction(id, 'SPELL')}
                    />
                </div>
            </div>

        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings} 
        onSave={saveSettings} 
      />

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
          {notifications.map(n => (
              <div key={n.id} className={`pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-2xl border backdrop-blur-md animate-in slide-in-from-right duration-300 max-w-sm
                 ${n.type === 'success' ? 'bg-emerald-50/90 dark:bg-emerald-900/90 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-100' : ''}
                 ${n.type === 'error' ? 'bg-red-50/90 dark:bg-red-900/90 border-red-200 dark:border-red-800 text-red-800 dark:text-red-100' : ''}
                 ${n.type === 'info' ? 'bg-slate-50/90 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100' : ''}
                 ${n.type === 'warning' ? 'bg-amber-50/90 dark:bg-amber-900/90 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-100' : ''}
              `}>
                  {n.type === 'success' && <CheckCircle2 size={20} />}
                  {n.type === 'error' && <AlertCircle size={20} />}
                  {n.type === 'info' && <Info size={20} />}
                  <div>
                      <h4 className="text-sm font-bold">{n.title}</h4>
                      <p className="text-xs opacity-90">{n.message}</p>
                  </div>
              </div>
          ))}
      </div>

    </div>
  );
}
