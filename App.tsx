
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Settings, Moon, Sun, Calendar as CalendarIcon, RefreshCw, CheckCircle2, AlertCircle, Info, ChevronLeft, ChevronRight, Copy, Sparkles, Clock, Plus, Bell, History, Brain, Edit3 } from 'lucide-react';
import { AppSettings, Worklog, LoadingState, Notification, NotificationHistoryItem, WorklogSuggestion, UndoAction, DEFAULT_SYSTEM_PROMPT } from './types';
import { fetchWorklogs, updateWorklog, callGroq, createWorklog, deleteWorklog } from './services/api';
import { SettingsModal } from './components/SettingsModal';
import { WorklogList } from './components/WorklogList';
import { AddWorklogModal } from './components/AddWorklogModal';
import { NotificationHistory } from './components/NotificationHistory';
import { secondsToHours, formatHours } from './utils/adf';

const APP_NAME = 'WorklogPro';
const SUGGESTIONS_KEY = `${APP_NAME}_suggestions`;
const NOTIFICATION_HISTORY_KEY = `${APP_NAME}_notificationHistory`;

const detectJiraUrl = () => {
    const saved = localStorage.getItem(`${APP_NAME}_jiraUrl`);
    if (saved) return saved;
    // Auto-detect if running inside Jira
    if (window.location.hostname.includes('atlassian.net')) {
        return window.location.origin;
    }
    return '';
};

// Load suggestions from localStorage
const loadSuggestions = (): WorklogSuggestion[] => {
    try {
        const saved = localStorage.getItem(SUGGESTIONS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
};

// Load notification history from localStorage
const loadNotificationHistory = (): NotificationHistoryItem[] => {
    try {
        const saved = localStorage.getItem(NOTIFICATION_HISTORY_KEY);
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        // Filter out old notifications (older than 7 days)
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return parsed.filter((n: NotificationHistoryItem) => n.timestamp > sevenDaysAgo);
    } catch {
        return [];
    }
};

// Save notification history to localStorage
const saveNotificationHistory = (history: NotificationHistoryItem[]) => {
    localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
};

// Save suggestions to localStorage
const saveSuggestions = (suggestions: WorklogSuggestion[]) => {
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(suggestions.slice(0, 50))); // Keep max 50
};

// Update suggestions when a worklog is created
const updateSuggestions = (issueKey: string, summary: string, comment: string, hours: number) => {
    const suggestions = loadSuggestions();
    const existingIndex = suggestions.findIndex(s => s.issueKey === issueKey);
    
    if (existingIndex >= 0) {
        // Update existing
        const existing = suggestions[existingIndex];
        suggestions[existingIndex] = {
            ...existing,
            lastComment: comment || existing.lastComment,
            avgHours: (existing.avgHours * existing.frequency + hours) / (existing.frequency + 1),
            frequency: existing.frequency + 1,
            lastUsed: new Date().toISOString()
        };
    } else {
        // Add new
        suggestions.unshift({
            issueKey,
            summary,
            lastComment: comment,
            avgHours: hours,
            frequency: 1,
            lastUsed: new Date().toISOString()
        });
    }
    
    // Sort by frequency and recency
    suggestions.sort((a, b) => {
        const freqDiff = b.frequency - a.frequency;
        if (freqDiff !== 0) return freqDiff;
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    });
    
    saveSuggestions(suggestions);
    return suggestions;
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
  const [isAddWorklogOpen, setIsAddWorklogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>(loadNotificationHistory());
  const [suggestions, setSuggestions] = useState<WorklogSuggestion[]>(loadSuggestions());
  const [distributeTarget, setDistributeTarget] = useState<string>(settings.targetDailyHours.toString());
  const [tempTargetHours, setTempTargetHours] = useState<string>(settings.targetDailyHours.toString());
  
  // Stats
  const totalHours = useMemo(() => worklogs.reduce((acc, wl) => acc + wl.hours, 0), [worklogs]);
  const progress = Math.min((totalHours / settings.targetDailyHours) * 100, 100);
  const isTargetMet = totalHours >= settings.targetDailyHours;
  
  // Count undoable notifications
  const undoableCount = useMemo(() => 
    notificationHistory.filter(n => n.undoAction && !n.dismissed).length, 
    [notificationHistory]
  );

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

  // Save notification history when it changes
  useEffect(() => {
    saveNotificationHistory(notificationHistory);
  }, [notificationHistory]);

  // --- Actions ---

  const notify = (title: string, message: string, type: Notification['type'] = 'info', undoAction?: UndoAction, diff?: { before: string; after: string; issueKey?: string }) => {
    const id = Date.now().toString();
    const notification: NotificationHistoryItem = { id, title, message, type, timestamp: Date.now(), undoAction, diff };
    
    // Add to toast notifications
    setNotifications(prev => [...prev, notification]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
    
    // Add to history
    setNotificationHistory(prev => [notification, ...prev].slice(0, 100)); // Keep max 100
  };

  // Update target hours from progress card
  const handleTargetHoursChange = () => {
    const newTarget = parseFloat(tempTargetHours);
    if (isNaN(newTarget) || newTarget <= 0 || newTarget > 24) {
        setTempTargetHours(settings.targetDailyHours.toString());
        setIsEditingTarget(false);
        return;
    }
    
    const newSettings = { ...settings, targetDailyHours: newTarget };
    setSettings(newSettings);
    localStorage.setItem(`${APP_NAME}_targetDailyHours`, String(newTarget));
    setDistributeTarget(newTarget.toString());
    setIsEditingTarget(false);
    notify('Hedef Güncellendi', `Günlük hedef ${newTarget} saat olarak ayarlandı.`, 'success');
  };

  const handleUndo = async (notification: NotificationHistoryItem) => {
    if (!notification.undoAction) return;
    
    try {
        const { type, data } = notification.undoAction;
        
        if (type === 'CREATE') {
            // Undo create = delete
            for (const item of data) {
                await deleteWorklog(item.issueKey, item.worklogId, settings);
            }
            notify('Geri Alındı', 'Eklenen worklog silindi.', 'info');
        } else if (type === 'UPDATE' || type === 'BATCH_UPDATE') {
            // Undo update = revert to previous values
            for (const item of data) {
                const wl = worklogs.find(w => w.id === item.worklogId);
                if (wl) {
                    await updateWorklog(wl, settings, item.previousComment, item.previousSeconds);
                }
            }
            notify('Geri Alındı', `${data.length} işlem geri alındı.`, 'info');
        } else if (type === 'BATCH_CREATE') {
            // Undo batch create = delete all
            for (const item of data) {
                await deleteWorklog(item.issueKey, item.worklogId, settings);
            }
            notify('Geri Alındı', `${data.length} worklog silindi.`, 'info');
        }
        
        // Mark as dismissed in history
        setNotificationHistory(prev => 
            prev.map(n => n.id === notification.id ? { ...n, dismissed: true } : n)
        );
        
        // Reload data
        await loadData();
        
    } catch (e: any) {
        notify('Geri Alma Başarısız', e.message, 'error');
    }
  };

  const clearNotificationHistory = () => {
    setNotificationHistory([]);
  };

  const handleAddWorklog = async (issueKey: string, hours: number, comment: string) => {
    const seconds = Math.round(hours * 3600);
    
    await createWorklog(issueKey, selectedDate, seconds, comment, settings);
    
    // Get the new worklog ID for undo (reload and find the new one)
    const updatedWorklogs = await fetchWorklogs(selectedDate, settings);
    const newWorklog = updatedWorklogs.find(wl => 
        wl.issueKey === issueKey && 
        !worklogs.some(existing => existing.id === wl.id)
    );
    
    setWorklogs(updatedWorklogs);
    
    // Update suggestions
    const summary = newWorklog?.summary || issueKey;
    setSuggestions(updateSuggestions(issueKey, summary, comment, hours));
    
    // Notify with undo
    const undoAction: UndoAction = newWorklog ? {
        type: 'CREATE',
        data: [{ worklogId: newWorklog.id, issueKey }]
    } : undefined as any;
    
    notify('Worklog Eklendi', `${issueKey}: ${hours}h`, 'success', undoAction);
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

        const originalComment = wl.comment;
        const improvedText = await callGroq(prompt, settings);
        if (improvedText && improvedText.trim() !== wl.comment) {
            await handleUpdateWorklog(id, improvedText.trim());
            
            // Notify with diff for history
            const actionName = mode === 'IMPROVE' ? 'İyileştirildi' : 'İmla Düzeltildi';
            notify(
                actionName, 
                `${wl.issueKey} worklog metni güncellendi`, 
                'success',
                undefined,
                { before: originalComment, after: improvedText.trim(), issueKey: wl.issueKey }
            );
        } else {
            notify('Bilgi', 'Yapay zeka önemli bir değişiklik önermedi.', 'info');
        }

    } catch (e: any) {
        notify('AI Başarısız', e.message, 'error');
    }
  };

  // AI-powered smart distribution
  const handleSmartDistribute = async () => {
     if (loadingState === LoadingState.LOADING) return;
     
     const target = parseFloat(distributeTarget) || settings.targetDailyHours;
     
     if (worklogs.length === 0) {
         notify('Hata', 'Dağıtılacak worklog bulunamadı.', 'error');
         return;
     }

     if (!settings.groqApiKey) {
         notify('AI Hatası', 'Akıllı dağıtım için Groq API Anahtarı gerekli', 'error');
         setIsSettingsOpen(true);
         return;
     }

     notify('AI Analiz Ediyor', 'Worklog içerikleri analiz ediliyor...', 'info');
     
     try {
         // Prepare worklog data for AI
         const worklogData = worklogs.map(wl => ({
             key: wl.issueKey,
             summary: wl.summary,
             comment: wl.comment,
             currentHours: wl.hours
         }));

         const prompt = `
Sen bir iş süresi tahmin uzmanısın. Aşağıdaki worklog kayıtlarını analiz et ve toplam ${target} saati bu işler arasında mantıklı şekilde dağıt.

WORKLOG KAYITLARI:
${worklogData.map((w, i) => `${i + 1}. ${w.key}: "${w.summary}" - Yorum: "${w.comment}" (Mevcut: ${w.currentHours}h)`).join('\n')}

KURALLAR:
- Toplam tam olarak ${target} saat olmalı
- Minimum süre 0.25 saat
- İşin karmaşıklığına, yorumdaki detaylara göre dağıt
- Daha detaylı/uzun yorumlar genelde daha fazla süre gerektirir

ÇIKTI FORMAT (sadece JSON, başka bir şey yazma):
[${worklogData.map((w, i) => `{"index": ${i}, "hours": X.XX}`).join(', ')}]

Örnek çıktı: [{"index": 0, "hours": 2.5}, {"index": 1, "hours": 3.0}, {"index": 2, "hours": 2.5}]
`;

         const response = await callGroq(prompt, settings, 500);
         
         // Parse AI response
         let distribution: { index: number; hours: number }[];
         try {
             // Extract JSON from response
             const jsonMatch = response.match(/\[[\s\S]*\]/);
             if (!jsonMatch) throw new Error('JSON bulunamadı');
             distribution = JSON.parse(jsonMatch[0]);
         } catch (parseErr) {
             notify('AI Yanıt Hatası', 'Yapay zeka yanıtı işlenemedi, orantılı dağıtım yapılıyor...', 'warning');
             // Fall back to proportional
             handleDistribute('proportional');
             return;
         }

         // Validate and adjust
         const totalAIHours = distribution.reduce((sum, d) => sum + d.hours, 0);
         const ratio = target / totalAIHours;
         
         // Store previous values for undo
         const undoData = worklogs.map((wl, index) => {
             const aiHours = distribution.find(d => d.index === index)?.hours || (target / worklogs.length);
             const adjustedHours = Math.max(0.25, aiHours * ratio);
             return {
                 worklogId: wl.id,
                 issueKey: wl.issueKey,
                 previousSeconds: wl.seconds,
                 newSeconds: Math.round(adjustedHours * 3600)
             };
         });

         // Apply distribution
         const promises = worklogs.map(async (wl, index) => {
             const newSeconds = undoData[index].newSeconds;
             if (newSeconds !== wl.seconds) {
                await updateWorklog(wl, settings, undefined, newSeconds);
             }
         });
         
         await Promise.all(promises);
         await loadData();
         
         // Notify with undo
         const undoAction: UndoAction = {
             type: 'BATCH_UPDATE',
             data: undoData
         };
         notify('AI Dağıtım Tamamlandı', `Süreler akıllı şekilde ${target}h hedefe dağıtıldı.`, 'success', undoAction);
         
     } catch (e: any) {
         notify('AI Dağıtım Hatası', e.message, 'error');
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
     
     // Store previous values for undo
     const undoData = worklogs.map((wl, index) => ({
         worklogId: wl.id,
         issueKey: wl.issueKey,
         previousSeconds: wl.seconds,
         newSeconds: newSecondsArray[index]
     }));
     
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
         
         // Notify with undo capability
         const undoAction: UndoAction = {
             type: 'BATCH_UPDATE',
             data: undoData
         };
         notify('Dağıtıldı', `Süreler ${target}h hedefe göre dağıtıldı.`, 'success', undoAction);
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
          
          // Get the new worklog IDs for undo
          const updatedWorklogs = await fetchWorklogs(selectedDate, settings);
          const newWorklogs = updatedWorklogs.filter(wl => 
              !worklogs.some(existing => existing.id === wl.id)
          );
          
          setWorklogs(updatedWorklogs);
          
          // Create undo action
          const undoAction: UndoAction = {
              type: 'BATCH_CREATE',
              data: newWorklogs.map(wl => ({ worklogId: wl.id, issueKey: wl.issueKey }))
          };
          
          notify('Başarılı', `Dünden ${prevLogs.length} adet worklog kopyalandı.`, 'success', undoAction);

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
                {/* Add Worklog Button */}
                <button 
                    onClick={() => setIsAddWorklogOpen(true)} 
                    className="btn-filled text-sm hidden sm:flex"
                >
                    <Plus size={18}/> Worklog Ekle
                </button>
                <button 
                    onClick={() => setIsAddWorklogOpen(true)} 
                    className="btn-icon sm:hidden"
                    style={{ backgroundColor: 'var(--color-primary-600)', color: 'white' }}
                    aria-label="Add worklog"
                >
                    <Plus size={20}/>
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
                        <div className="flex items-center justify-between">
                            <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                                Günlük İlerleme
                            </span>
                            {/* Edit Target Button */}
                            <button 
                                onClick={() => {
                                    setTempTargetHours(settings.targetDailyHours.toString());
                                    setIsEditingTarget(true);
                                }}
                                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                                title="Hedef saati düzenle"
                            >
                                <Edit3 size={14} className="text-white/70" />
                            </button>
                        </div>
                        
                        {/* Big Number Display */}
                        <div className="flex items-baseline gap-2 mt-3 mb-5">
                            <span className="text-5xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>
                                {formatHours(totalHours)}
                            </span>
                            {isEditingTarget ? (
                                <div className="flex items-center gap-1">
                                    <span className="text-white/60 text-lg font-medium">/</span>
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
                                        className="w-16 bg-white/20 border-none rounded px-2 py-0.5 text-white text-lg font-medium text-center focus:outline-none focus:ring-2 focus:ring-white/50"
                                        style={{ fontFamily: 'var(--font-mono)' }}
                                    />
                                    <span className="text-white/60 text-lg font-medium">h</span>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => {
                                        setTempTargetHours(settings.targetDailyHours.toString());
                                        setIsEditingTarget(true);
                                    }}
                                    className="text-white/60 text-lg font-medium hover:text-white/80 transition-colors cursor-pointer"
                                    title="Tıkla düzenle"
                                >
                                    / {settings.targetDailyHours}h
                                </button>
                            )}
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
                                    <span>{formatHours(settings.targetDailyHours - totalHours)} saat kaldı</span>
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
                        
                        {/* AI Smart Distribution */}
                        <button 
                            onClick={handleSmartDistribute}
                            className="btn-filled w-full mt-3 ripple text-sm"
                            style={{ 
                                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                            }}
                            title="Yapay zeka worklog içeriklerini analiz ederek akıllı dağıtım yapar"
                        >
                            <Brain size={16} /> AI Akıllı Dağıtım
                        </button>
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
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setIsAddWorklogOpen(true)}
                                className="btn-tonal text-xs py-1.5 px-3"
                            >
                                <Plus size={14} /> Ekle
                            </button>
                            <span className="chip">
                                {worklogs.length} kayıt
                            </span>
                        </div>
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

      {/* Add Worklog Modal */}
      <AddWorklogModal
        isOpen={isAddWorklogOpen}
        onClose={() => setIsAddWorklogOpen(false)}
        onSubmit={handleAddWorklog}
        settings={settings}
        suggestions={suggestions}
        selectedDate={selectedDate}
      />

      {/* Notification History Panel */}
      <NotificationHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        notifications={notificationHistory}
        onUndo={handleUndo}
        onClear={clearNotificationHistory}
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
