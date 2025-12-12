
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Calendar as CalendarIcon, RefreshCw, CheckCircle2, AlertCircle, Info, Sparkles, Plus, History, Brain, Edit3, Clock, X } from 'lucide-react';
import { AppSettings, Worklog, LoadingState, Notification, NotificationHistoryItem, WorklogSuggestion, UndoAction, TextChangePreview, WeeklyReportItem, WorklogHistoryEntry } from './types';
import { fetchWorklogs, updateWorklog, callGroq, createWorklog, deleteWorklog, fetchIssueDetails } from './services/api';
import { SettingsModal } from './components/SettingsModal';
import { WorklogList } from './components/WorklogList';
import { AddWorklogModal } from './components/AddWorklogModal';
import { MagicCommandBar } from './components/MagicCommandBar';
import { NotificationHistory } from './components/NotificationHistory';
import { WeeklyReportModal } from './components/WeeklyReportModal';
import { AssignedIssuesDrawer } from './components/AssignedIssuesDrawer';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { InstallPrompt } from './components/InstallPrompt';
import { formatHours } from './utils/adf';
import { useSettings } from './hooks/useSettings';
import { useWorklogs } from './hooks/useWorklogs';
import { useNotifications } from './hooks/useNotifications';
import { useIsMobile } from './hooks/useIsMobile';
import { SUGGESTIONS_KEY, NOTIFICATION_HISTORY_KEY, WORKLOG_HISTORY_KEY } from './constants';
import { toLocalDateStr, getWeekMonday, getWeekDays } from './utils/date';
import { computeWordDiff, DiffPart } from './utils/diff';
import { loadSuggestions, loadWorklogHistories, saveWorklogHistories, saveNotificationHistory, updateSuggestions } from './utils/storage';
import { triggerHaptic } from './utils/ui';
import { getHistoricalContext, generateBatchContext, estimateWorkComplexity, clearAnalysisCache } from './utils/worklog-history-analyzer';

// Diff helper - kelime bazlı karşılaştırma
// Moved to utils/diff.ts

// Load suggestions from localStorage
// Moved to utils/storage.ts




import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// Varsayılan başlangıç tarihini hesapla - Yerel tarih kullan
const getDefaultStartDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function App() {
  const { 
    settings, 
    setSettings, 
    isSettingsOpen, 
    setIsSettingsOpen, 
    saveSettings: persistSettings, 
    updateTargetDailyHours,
    toggleTheme
  } = useSettings();
  const isMobileDevice = useIsMobile();
  const [isAddWorklogOpen, setIsAddWorklogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWeeklyReportOpen, setIsWeeklyReportOpen] = useState(false);
  const [isMagicBarOpen, setIsMagicBarOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getDefaultStartDate());

  // Add device class to body for CSS targeting
  useEffect(() => {
    document.body.classList.toggle('is-mobile-device', isMobileDevice);
    document.body.classList.toggle('is-desktop-device', !isMobileDevice);
  }, [isMobileDevice]);

  const { 
    notifications, 
    notificationHistory, 
    setNotificationHistory, 
    notify, 
    clearNotificationHistory, 
    deleteNotification 
  } = useNotifications();
  
  const { 
    worklogs, 
    loadingState, 
    loadData,
    loadWeekData, 
    addWorklog, 
    editWorklog, 
    removeWorklog,
    weekWorklogsCacheRef,
    worklogCacheRef,
    isLoadingWeek,
    queue,
    isSyncing
  } = useWorklogs(settings, selectedDate, notify);

  // Keyboard Shortcuts
  useKeyboardShortcuts([
    {
      key: 'n',
      ctrlKey: true,
      action: () => setIsAddWorklogOpen(true),
      preventDefault: true
    },
    {
      key: 'k',
      ctrlKey: true,
      action: () => setIsMagicBarOpen(true),
      preventDefault: true
    },
    {
      key: 'r',
      ctrlKey: true,
      action: () => loadData(true),
      preventDefault: true
    },
    {
      key: ',',
      ctrlKey: true,
      action: () => setIsSettingsOpen(true),
      preventDefault: true
    }
  ]);

  const [suggestions, setSuggestions] = useState<WorklogSuggestion[]>(loadSuggestions());
  const [tempTargetHours, setTempTargetHours] = useState<string>(settings.targetDailyHours.toString());
  
  // Worklog history for undo/redo (per worklog) - localStorage'dan yükle
  const [worklogHistories, setWorklogHistories] = useState<Map<string, { entries: WorklogHistoryEntry[]; index: number }>>(loadWorklogHistories());
  
  // Distribution Preview State
  const [distributionPreview, setDistributionPreview] = useState<{
    mode: 'equal' | 'ai';
    items: { issueKey: string; summary: string; currentHours: number; newHours: number }[];
    targetHours: number;
  } | null>(null);
  const [isDistributing, setIsDistributing] = useState(false);
  const [editingDistItemIndex, setEditingDistItemIndex] = useState<number | null>(null);
  const [editDistHoursStr, setEditDistHoursStr] = useState('');
  
  // AI Text Change Preview State
  const [textChangePreview, setTextChangePreview] = useState<TextChangePreview[] | null>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [textChangeMode, setTextChangeMode] = useState<'IMPROVE' | 'SPELL' | null>(null);
  
  // Stats
  const totalHours = useMemo(() => worklogs.reduce((acc, wl) => acc + wl.hours, 0), [worklogs]);
  const progress = Math.min((totalHours / settings.targetDailyHours) * 100, 100);
  const isTargetMet = totalHours >= settings.targetDailyHours;
  
  // Confetti state
  const [showConfetti, setShowConfetti] = useState(false);
  const prevIsTargetMet = useRef(isTargetMet);
  
  // Weekly hours for chart
  const [weeklyHours, setWeeklyHours] = useState<{ date: string; hours: number; dayName: string }[]>([]);
  
  // Count undoable notifications
  const undoableCount = useMemo(() => 
    notificationHistory.filter(n => n.undoAction && !n.dismissed).length, 
    [notificationHistory]
  );

  // Mobile States
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const pullStartY = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  // --- Effects ---

  // Online/Offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Pull to refresh
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    let pulling = false;
    
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0 && e.touches.length === 1) {
        pullStartY.current = e.touches[0].clientY;
        pulling = true;
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (!pulling) return;
      
      const currentY = e.touches[0].clientY;
      const diff = currentY - pullStartY.current;
      
      if (diff > 0 && window.scrollY === 0) {
        const progress = Math.min(diff / 100, 1);
        setPullProgress(progress);
        setIsPulling(progress > 0.3);
      }
    };
    
    const handleTouchEnd = async () => {
      if (isPulling && pullProgress >= 1) {
        // Trigger refresh
        await loadData(true);
        // Haptic feedback simulation
        if ('vibrate' in navigator) {
          navigator.vibrate(10);
        }
      }
      setPullProgress(0);
      setIsPulling(false);
      pulling = false;
    };
    
    main.addEventListener('touchstart', handleTouchStart, { passive: true });
    main.addEventListener('touchmove', handleTouchMove, { passive: true });
    main.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      main.removeEventListener('touchstart', handleTouchStart);
      main.removeEventListener('touchmove', handleTouchMove);
      main.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isPulling, pullProgress, settings]);

  // Swipe left/right for day change
  useEffect(() => {
    let touchStartX = 0;
    let touchEndX = 0;
    
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
    };
    
    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX - touchEndX;
      const threshold = 100; // minimum swipe distance
      
      // Only trigger on significant horizontal swipe
      if (Math.abs(diff) > threshold) {
        if (diff > 0) {
          // Swipe left -> next day
          changeDate(1);
        } else {
          // Swipe right -> previous day
          changeDate(-1);
        }
        // Haptic feedback
        if ('vibrate' in navigator) {
          navigator.vibrate(5);
        }
      }
    };
    
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [selectedDate]);

  useEffect(() => {
    if (settings.isDarkTheme) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [settings.isDarkTheme]);



  // Save notification history when it changes
  useEffect(() => {
    saveNotificationHistory(notificationHistory);
  }, [notificationHistory]);

  // Save worklog histories when it changes
  useEffect(() => {
    saveWorklogHistories(worklogHistories);
  }, [worklogHistories]);

  // Confetti effect when target is met for the first time
  useEffect(() => {
    if (isTargetMet && !prevIsTargetMet.current && totalHours > 0) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
    prevIsTargetMet.current = isTargetMet;
  }, [isTargetMet, totalHours]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea (except for Ctrl+S which should work everywhere)
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      
      // Ctrl+S: Save (Global)
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        // Save event will be handled by active modal
        window.dispatchEvent(new CustomEvent('trigger-save'));
        return;
      }

      // Ctrl+K = Magic Command Bar
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsMagicBarOpen(prev => !prev);
      }

      if (isInput) return;
      
      // Ctrl+N = New worklog
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setIsAddWorklogOpen(true);
      }
      // Left arrow = Previous day
      else if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const prev = new Date(selectedDate);
        prev.setDate(prev.getDate() - 1);
        setSelectedDate(prev.toISOString().split('T')[0]);
      }
      // Right arrow = Next day
      else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const next = new Date(selectedDate);
        next.setDate(next.getDate() + 1);
        setSelectedDate(next.toISOString().split('T')[0]);
      }
      // T = Today
      else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setSelectedDate(new Date().toISOString().split('T')[0]);
      }
      // R = Refresh
      else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        loadData(true);
      }
      // S = Settings
      else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
      // H = History
      else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setIsHistoryOpen(true);
      }
      // Escape = Close modals
      else if (e.key === 'Escape') {
        setIsAddWorklogOpen(false);
        setIsSettingsOpen(false);
        setIsHistoryOpen(false);
        setIsWeeklyReportOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate, settings]);

  // WeeklyHours'u cache'den güncelle (Pazartesi-Pazar sıralaması)
  const updateWeeklyHoursFromCache = useCallback(() => {
    const weekMonday = getWeekMonday(selectedDate);
    const weekDays = getWeekDays(selectedDate);
    const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    
    const days: { date: string; hours: number; dayName: string }[] = [];
    
    for (let i = 0; i < weekDays.length; i++) {
      const dateStr = weekDays[i];
      
      // Önce week cache'den al, yoksa worklog cache'den al
      let dayWorklogs = weekWorklogsCacheRef.current.get(dateStr);
      
      if (!dayWorklogs) {
        // Week cache'de yoksa, worklog cache'den dene
        const cached = worklogCacheRef.current.get(dateStr);
        dayWorklogs = cached ? cached.worklogs : [];
      }
      
      // Eğer seçili günse ve cache'de yoksa, state'teki worklogs'u kullan
      if ((!dayWorklogs || dayWorklogs.length === 0) && dateStr === selectedDate) {
        dayWorklogs = worklogs;
      }
      
      const totalHours = dayWorklogs?.reduce((sum, wl) => sum + wl.hours, 0) || 0;
      days.push({ date: dateStr, hours: totalHours, dayName: dayNames[i] });
    }
    
    setWeeklyHours(days);
  }, [selectedDate, worklogs, weekWorklogsCacheRef, worklogCacheRef]);

  // Load weekly hours for chart - seçilen tarihin haftası (Pazartesi-Pazar)
  useEffect(() => {
    updateWeeklyHoursFromCache();
  }, [updateWeeklyHoursFromCache]);

  // --- Actions ---

  // Update target hours from progress card
  const handleTargetHoursChange = () => {
    const newTarget = parseFloat(tempTargetHours);
    if (isNaN(newTarget) || newTarget <= 0 || newTarget > 24) {
        setTempTargetHours(settings.targetDailyHours.toString());
        setIsEditingTarget(false);
        return;
    }
    
    updateTargetDailyHours(newTarget);
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
        await loadData(true);
        
    } catch (e: any) {
        notify('Geri Alma Başarısız', e.message, 'error');
    }
  };

  // AI-powered time estimation based on issue summary and historical data
  const getTimeEstimation = (issueKey: string, summary: string): { estimate: number; confidence: 'high' | 'medium' | 'low'; message: string } | null => {
    // Check if we have historical data for this specific issue
    const suggestion = suggestions.find(s => s.issueKey === issueKey);
    if (suggestion && suggestion.frequency >= 2) {
      const range = suggestion.maxHours && suggestion.minHours 
        ? `${suggestion.minHours.toFixed(1)}-${suggestion.maxHours.toFixed(1)}h` 
        : `~${suggestion.avgHours.toFixed(1)}h`;
      return {
        estimate: suggestion.avgHours,
        confidence: suggestion.frequency >= 5 ? 'high' : 'medium',
        message: `Bu iş genelde ${range} sürüyor (${suggestion.frequency}x kayıt)`
      };
    }

    // Try to match by similar keywords in summary
    const keywords = summary.toLowerCase().split(/\s+/);
    const similarSuggestions = suggestions.filter(s => {
      const suggestionWords = s.summary.toLowerCase().split(/\s+/);
      return keywords.some(kw => kw.length > 3 && suggestionWords.some(sw => sw.includes(kw) || kw.includes(sw)));
    });

    if (similarSuggestions.length >= 2) {
      const avgHours = similarSuggestions.reduce((sum, s) => sum + s.avgHours, 0) / similarSuggestions.length;
      return {
        estimate: avgHours,
        confidence: 'low',
        message: `Benzer işler genelde ~${avgHours.toFixed(1)}h sürüyor`
      };
    }

    return null;
  };

  const handleAddWorklog = async (issueKey: string, hours: number, comment: string) => {
    const seconds = Math.round(hours * 3600);
    
    const newWorklog = await addWorklog(issueKey, seconds, comment);
    
    if (newWorklog) {
        // Update suggestions
        // Note: newWorklog from create API might not have summary
        const summary = (newWorklog as any).summary || issueKey;
        setSuggestions(updateSuggestions(issueKey, summary, comment, hours));
        
        // Notify with undo
        const undoAction: UndoAction = {
            type: 'CREATE',
            data: [{ worklogId: newWorklog.id, issueKey }]
        };
        
        notify('Worklog Eklendi', `${issueKey}: ${hours}h`, 'success', undoAction);
        triggerHaptic();
        
        // Auto-refresh selected date after adding worklog
        setTimeout(() => {
            loadData(true);
        }, 500);
    }
  };

  const saveSettings = (newSettings: AppSettings) => {
    persistSettings(newSettings);
    notify('Ayarlar Kaydedildi', 'Yapılandırmanız güncellendi.', 'success');
  };





  // Worklog history change handler
  const handleWorklogHistoryChange = (worklogId: string, entries: WorklogHistoryEntry[], index: number) => {
    setWorklogHistories(prev => {
      const newMap = new Map(prev);
      newMap.set(worklogId, { entries, index });
      return newMap;
    });
  };

  // Fetch worklogs for a date range (for weekly report)
  const fetchDateRangeWorklogs = async (startDate: string, endDate: string): Promise<Worklog[]> => {
    if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
        return [];
    }
    
    try {
        // Fetch each day in the range
        const allLogs: Worklog[] = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayLogs = await fetchWorklogs(dateStr, settings);
            allLogs.push(...dayLogs);
        }
        
        return allLogs;
    } catch (e) {
        console.error('Failed to fetch week worklogs:', e);
        return [];
    }
  };

  // AI Generate Weekly Report - Smart distribution by importance with issue descriptions
  const generateAIWeeklyReport = async (worklogs: Worklog[], weekStart: string): Promise<WeeklyReportItem[]> => {
    if (!settings.groqApiKey || worklogs.length === 0) {
        notify('Hata', 'Groq API anahtarı veya geçen hafta verisi eksik', 'error');
        return [];
    }
    
    const DAYS_ARRAY = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
    
    // Group worklogs by issue and calculate importance
    const issueMap = new Map<string, { worklog: Worklog; lastDay: Date; totalHours: number; comments: string[]; description?: string; projectName?: string }>();
    
    worklogs.forEach(log => {
        const date = new Date(log.started);
        const existing = issueMap.get(log.issueKey);
        
        if (!existing) {
            issueMap.set(log.issueKey, {
                worklog: log,
                lastDay: date,
                totalHours: log.hours,
                comments: log.comment ? [log.comment] : []
            });
        } else {
            if (date > existing.lastDay) {
                existing.lastDay = date;
                existing.worklog = log;
            }
            existing.totalHours += log.hours;
            if (log.comment && !existing.comments.includes(log.comment)) {
                existing.comments.push(log.comment);
            }
        }
    });
    
    // Sort by total hours (most important first)
    const sortedIssues = Array.from(issueMap.entries())
        .map(([key, data]) => ({ issueKey: key, ...data }))
        .sort((a, b) => b.totalHours - a.totalHours);
    
    if (sortedIssues.length === 0) {
        notify('Bilgi', 'Geçen hafta işlenmiş worklog bulunamadı', 'info');
        return [];
    }

    // Fetch issue descriptions from Jira for better context
    notify('Bilgi', 'Issue detayları Jira\'dan çekiliyor...', 'info');
    
    const issueDetailsPromises = sortedIssues.slice(0, 10).map(async (issue) => {
        const details = await fetchIssueDetails(issue.issueKey, settings);
        if (details) {
            issue.description = details.description;
            issue.projectName = details.projectName;
        }
        return issue;
    });
    
    await Promise.all(issueDetailsPromises);
    
    // Build detailed issue list for prompt with Jira descriptions
    const issueList = sortedIssues.slice(0, 10).map((data, idx) => {
        const comments = data.comments.slice(0, 2).join(' | ');
        const desc = data.description ? data.description.substring(0, 200) : '';
        const projectInfo = data.projectName ? `[${data.projectName}]` : '';
        return `${idx + 1}. ${data.issueKey} ${projectInfo}: ${data.worklog.summary}
   - Geçen hafta: ${data.totalHours.toFixed(1)} saat çalışıldı
   - Son notlar: ${comments || 'Yok'}
   - Jira Açıklaması: ${desc || 'Yok'}`;
    }).join('\n\n');
    
    // Enhanced prompt with issue descriptions for better context
    const prompt = `Sen deneyimli bir SAP Business One / yazılım danışmanısın. Geçen hafta yapılan işlere ve Jira açıklamalarına bakarak bu hafta için DETAYLI ve SPESİFİK plan hazırla.

ÖNEMLİ KURALLAR:
1. Her açıklama EN AZ 50-80 karakter olmalı
2. Müşteri/şirket adı varsa MUTLAKA kullan (Jira açıklamasından bul)
3. "Devam edilecek", "Test edilecek" gibi kısa cevaplar YASAK
4. Her açıklamada: NE yapılacak + KİME/NEREYE + SONUÇ/HEDEF olmalı

ÖRNEK İYİ AÇIKLAMALAR:
- "ABC Teknoloji için e-fatura entegrasyonu test ortamında kontrol edilecek, başarılı olursa ADD onayına sunulacak"
- "XYZ Holding KDV raporu revizyonları tamamlanacak, muhasebe departmanına mail ile iletilecek"
- "BLF Optik stok modülü kurulumu devam edecek, cuma günü kullanıcı eğitimi planlanacak"
- "DEF AŞ için hazırlanan Crystal Report tasarımı müşteriye sunulacak, geri bildirim alınacak"

GEÇEN HAFTA YAPILAN İŞLER:
${issueList}

SADECE JSON array döndür, başka bir şey yazma:
[{"issueKey":"XXX-123","day":"Pazartesi","status":"devam","description":"Detaylı açıklama buraya..."}]

day: Pazartesi/Salı/Çarşamba/Perşembe/Cuma (işleri günlere dengeli dağıt)
status: devam/test/tamamlandı/beklemede`;

    try {
        console.log('AI Weekly Report Prompt:', prompt);
        const response = await callGroq(prompt, settings, 1000); // Daha uzun yanıt için
        console.log('AI Weekly Report Response:', response);
        
        // Try multiple patterns to find JSON
        let jsonData = null;
        
        // Pattern 1: Full array
        const match1 = response.match(/\[[\s\S]*\]/);
        if (match1) {
            try {
                jsonData = JSON.parse(match1[0]);
            } catch (e) {
                console.log('Pattern 1 failed:', e);
            }
        }
        
        // Pattern 2: Try to find JSON objects and build array
        if (!jsonData) {
            const objectMatches = response.match(/\{[^{}]*"issueKey"[^{}]*\}/g);
            if (objectMatches && objectMatches.length > 0) {
                try {
                    jsonData = objectMatches.map(m => JSON.parse(m));
                } catch (e) {
                    console.log('Pattern 2 failed:', e);
                }
            }
        }
        
        // If AI failed, create smart fallback based on issue descriptions
        if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
            console.log('AI JSON parsing failed, using smart fallback');
            
            const fallbackItems: WeeklyReportItem[] = sortedIssues.slice(0, 5).map((issue, idx) => {
                const day = DAYS_ARRAY[Math.min(idx, 4)] as any;
                const statusGuess = issue.totalHours > 4 ? 'devam' : issue.totalHours > 2 ? 'test' : 'tamamlandı';
                
                // Generate better description using available data
                let smartDesc = '';
                const projectName = issue.projectName || '';
                const summary = issue.worklog.summary.toLowerCase();
                const desc = (issue.description || '').toLowerCase();
                
                if (summary.includes('rapor') || summary.includes('report')) {
                    smartDesc = `${projectName} için hazırlanan rapor kontrol edilecek, gerekirse revizyon yapılacak ve ilgili birime iletilecek`;
                } else if (summary.includes('e-fatura') || summary.includes('efatura')) {
                    smartDesc = `${projectName} e-fatura entegrasyonu test edilecek, sorun yoksa ADD onayı için başvuru yapılacak`;
                } else if (summary.includes('kurulum') || summary.includes('setup')) {
                    smartDesc = `${projectName} için kurulum işlemlerine devam edilecek, kullanıcı testleri yapılacak`;
                } else if (summary.includes('hata') || summary.includes('bug') || summary.includes('fix')) {
                    smartDesc = `${projectName} sisteminde tespit edilen hata düzeltmesi kontrol edilecek ve canlıya alınacak`;
                } else {
                    smartDesc = `${projectName} için ${issue.worklog.summary} çalışmalarına devam edilecek, ilerleme raporu hazırlanacak`;
                }
                
                return {
                    issueKey: issue.issueKey,
                    summary: issue.worklog.summary,
                    status: statusGuess,
                    day: day,
                    description: smartDesc.trim(),
                    hours: issue.totalHours
                };
            });
            
            notify('Bilgi', `AI yanıtı işlenemedi, ${fallbackItems.length} görev otomatik planlandı`, 'info');
            return fallbackItems;
        }
        
        const result: WeeklyReportItem[] = jsonData.map((item: any) => {
            const issueData = issueMap.get(item.issueKey);
            const validDay = DAYS_ARRAY.includes(item.day) ? item.day : 'Pazartesi';
            
            return {
                issueKey: item.issueKey || 'UNKNOWN',
                summary: issueData?.worklog.summary || item.issueKey,
                status: ['devam', 'test', 'tamamlandı', 'yeni', 'beklemede'].includes(item.status) ? item.status : 'devam',
                day: validDay as 'Pazartesi' | 'Salı' | 'Çarşamba' | 'Perşembe' | 'Cuma',
                description: item.description || 'İlgili çalışmalara devam edilecek',
                hours: issueData?.totalHours
            };
        });
        
        notify('Başarılı', `${result.length} görev AI ile planlandı`, 'success');
        return result;
        
    } catch (e: any) {
        console.error('AI weekly report generation failed:', e);
        
        // Even on error, provide smart fallback
        const fallbackItems: WeeklyReportItem[] = sortedIssues.slice(0, 5).map((issue, idx) => ({
            issueKey: issue.issueKey,
            summary: issue.worklog.summary,
            status: 'devam' as const,
            day: DAYS_ARRAY[Math.min(idx, 4)] as any,
            description: `${issue.projectName || ''} için ${issue.worklog.summary} çalışmalarına devam edilecek`.trim(),
            hours: issue.totalHours
        }));
        
        notify('Uyarı', `AI hatası, ${fallbackItems.length} görev otomatik planlandı`, 'warning');
        return fallbackItems;
    }
  };

  const handleUpdateWorklog = async (id: string, comment?: string, seconds?: number, skipNotification?: boolean, isUndoRedo?: boolean, newDate?: string) => {
    const wl = worklogs.find(w => w.id === id);
    if (!wl) {
      console.error('❌ handleUpdateWorklog: Worklog not found in state:', id);
      return;
    }

    const previousComment = wl.comment;
    const previousSeconds = wl.seconds;
    
    const newComment = comment !== undefined ? comment : wl.comment;
    const newSeconds = seconds !== undefined ? seconds : wl.seconds;

    const success = await editWorklog(wl, newComment, newSeconds, newDate);
    
    if (success) {
      // Skip notifications and auto-refresh for batch operations (skipNotification=true)
      if (skipNotification) {
        console.log('✅ Batch update successful for:', wl.issueKey);
        return;
      }
      
      if (isUndoRedo) return;

      if (newDate) {
          notify('Taşındı', `${wl.issueKey} worklog'u ${newDate} tarihine taşındı.`, 'success');
      } else if (comment !== undefined && comment !== previousComment) {
        const undoAction: UndoAction = {
          type: 'UPDATE',
          data: [{ worklogId: id, issueKey: wl.issueKey, previousComment, newComment: comment }]
        };
        notify('Güncellendi', `${wl.issueKey} worklog metni güncellendi`, 'success', undoAction, {
          before: previousComment,
          after: comment,
          issueKey: wl.issueKey
        });
      } else if (seconds !== undefined) {
        const undoAction: UndoAction = {
          type: 'UPDATE',
          data: [{ worklogId: id, issueKey: wl.issueKey, previousSeconds, newSeconds: seconds }]
        };
        notify('Güncellendi', `${wl.issueKey} worklog süresi güncellendi`, 'success', undoAction, {
          before: `${(previousSeconds / 3600).toFixed(2)} saat`,
          after: `${(seconds / 3600).toFixed(2)} saat`,
          issueKey: wl.issueKey
        });
      } else {
        notify('Güncellendi', 'Kayıt başarıyla güncellendi', 'success');
      }
      
      // Auto-refresh selected date after updating worklog (skip for batch ops)
      setTimeout(() => {
        loadData(true);
      }, 300);
    }
  };

  // Delete worklog
  const handleDeleteWorklog = async (id: string) => {
    const wl = worklogs.find(w => w.id === id);
    if (!wl) return;
    
    const success = await removeWorklog(wl.issueKey, id);
    // Note: Notification is already handled by removeWorklog in useWorklogs.ts
    // No need to notify or loadData here - removeWorklog does both
  };

  // Clean AI output - remove quotes and unwanted formatting
  const cleanAIOutput = (text: string, isSpellMode: boolean = false): string => {
    let cleaned = text.trim();
    
    // Ortak temizlik: Başlangıç ve bitiş pattern'leri
    const commonPrefixes = [
        /^(GELİŞTİRİLMİŞ NOT:|DÜZELTİLMİŞ METİN:|Geliştirilmiş Not:|Düzeltilmiş Metin:)\s*/i,
        /^(Output:|Çıktı:|Result:|Sonuç:|Cevap:|Answer:)\s*/i,
        /^(İşte|Burada|Here is)[^:]*:\s*/i
    ];
    
    for (const prefix of commonPrefixes) {
        cleaned = cleaned.replace(prefix, '');
    }
    
    // SPELL modu için daha agresif temizlik
    if (isSpellMode) {
        // 1. Splitter Strategy: Eğer "YENİ", "Düzeltilmiş" gibi ayırıcılar varsa, ondan sonrasını al.
        const splitters = [
            /(?:^|\n)(?:YENİ|NEW|AFTER|SONRA|Düzeltilmi[şs](?:\s+(?:metin|hali|versiyon))?|Corrected(?:\s+(?:text|version))?|Output|Result|Cevap|Answer|Çıktı)[:|]?\s*(?:\n|$)/i
        ];

        for (const splitter of splitters) {
            const match = cleaned.match(splitter);
            if (match && match.index !== undefined) {
                const potentialContent = cleaned.substring(match.index + match[0].length).trim();
                if (potentialContent.length > 0) {
                    cleaned = potentialContent;
                    break; 
                }
            }
        }

        // 2. Markdown temizliği (**text** -> text)
        cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
        cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
        cleaned = cleaned.replace(/__(.+?)__/g, '$1');
        cleaned = cleaned.replace(/_(.+?)_/g, '$1');
        
        // 3. Satır bazlı temizlik (Kalan başlıkları temizle)
        const lines = cleaned.split('\n');
        cleaned = lines.filter(line => {
            const trimmed = line.trim();
            if (/^(Düzeltilmi[şs]|Düzeltme|Output|Çıktı|Result|ÖNCEKİ|YENİ|BEFORE|AFTER|Original|Fixed|Corrected|Spell|Check|Note|Info|Cevap|Answer|Sonuç|Modified|Changed|Burada|İşte|Here)[:|]?\s*(?:metin|text|hali|version|versiyon)?[:|]?\s*$/i.test(trimmed)) {
                return false;
            }
            return true;
        }).join('\n');
        
        // Boş satırları temizle
        cleaned = cleaned.replace(/\n\n+/g, '\n').trim();
    } else {
        // IMPROVE modu için temizlik
        cleaned = cleaned.replace(/^["'"'""'']+|["'"'""'']+$/g, '');
        cleaned = cleaned.replace(/^[#*_`]+|[#*_`]+$/g, '');
        
        // Markdown temizliği
        cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
        cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
        
        // Başlık temizliği
        cleaned = cleaned.replace(/^(Düzeltilmi[şs]:?|Düzeltme:?|Output:?|Çıktı:?|Result:?|Geliştirilmiş:?)\s*/i, '');
    }
    
    return cleaned.trim();
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
        let maxTokensForMode = 600;
        
        if (mode === 'IMPROVE') {
            // Get historical context for writing style only
            const historicalContext = getHistoricalContext(wl, worklogCacheRef, 3);
            
            prompt = `Sen profesyonel bir worklog asistanısın. Verilen kısa worklog notunu geliştir.

BAĞLAM (Issue Özeti): ${wl.summary}
${historicalContext}

KURALLAR:
- Metni 2-3 cümleye genişlet (150-250 karakter arası).
- Doğal, profesyonel Türkçe kullan.
- Yapılan işi somut eylemlerle anlat: görüşüldü, incelendi, düzeltildi, eklendi, test edildi.
- "Gerçekleştirildi", "sağlandı", "tamamlandı", "optimize edildi" gibi klişelerden KAÇIN.
- Orijinal metinde olmayan teknik terim veya detay EKLEME.
- Tırnak işareti, emoji, madde işareti KULLANMA.
- Sadece düz metin döndür, başka bir şey yazma.

ORİJİNAL NOT:
${wl.comment}

GELİŞTİRİLMİŞ NOT:`;
            maxTokensForMode = 500;
        } else {
            // SPELL modu: Sadece yazım hatalarını düzelt
            maxTokensForMode = Math.max(wl.comment.length * 2, 500);
            prompt = `Sen bir yazım denetleyicisisin. Verilen metindeki yazım ve noktalama hatalarını düzelt.

KURALLAR:
- SADECE yazım ve noktalama hatalarını düzelt.
- Cümle yapısını veya kelimeleri DEĞİŞTİRME (yanlış yazılmış kelimeler hariç).
- Anlamı AYNEN koru.
- Sadece düzeltilmiş metni döndür, başka bir şey yazma.

ORİJİNAL METİN:
${wl.comment}

DÜZELTİLMİŞ METİN:`;
        }

        const originalComment = wl.comment;
        // Use very low temperature for spell check, low for improve
        const temperature = mode === 'SPELL' ? 0.05 : 0.2;
        const rawResponse = await callGroq(prompt, settings, maxTokensForMode, temperature);
        const improvedText = cleanAIOutput(rawResponse || '', mode === 'SPELL');
        
        // Küçük farkları da kabul et - normalize edip karşılaştır
        const normalizeText = (t: string) => t.toLowerCase().replace(/[^a-zçğıöşü0-9]/gi, '');
        const isDifferent = improvedText && normalizeText(improvedText) !== normalizeText(wl.comment);
        
        if (improvedText && isDifferent) {
            // Create undo action BEFORE updating
            const undoAction: UndoAction = {
                type: 'UPDATE',
                data: [{
                    worklogId: wl.id,
                    issueKey: wl.issueKey,
                    previousComment: originalComment,
                    newComment: improvedText
                }]
            };
            
            await handleUpdateWorklog(id, improvedText, undefined, true);
            
            // Notify with diff AND undo action
            const actionName = mode === 'IMPROVE' ? 'İyileştirildi' : 'İmla Düzeltildi';
            notify(
                actionName, 
                `${wl.issueKey} worklog metni güncellendi`, 
                'success',
                undoAction,
                { before: originalComment, after: improvedText, issueKey: wl.issueKey }
            );
            
            // Refresh data after AI action
            setTimeout(() => loadData(true), 500);
        } else if (improvedText) {
            // Metin var ama çok benzer - yine de uygula
            await handleUpdateWorklog(id, improvedText, undefined, true);
            notify('Güncellendi', `${wl.issueKey} metni güncellendi`, 'success');
            setTimeout(() => loadData(true), 500);
        } else {
            notify('Hata', 'AI yanıt veremedi, tekrar deneyin.', 'error');
        }

    } catch (e: any) {
        notify('AI Başarısız', e.message, 'error');
    }
  };

  // Batch AI Preview - Tüm worklog'ları önizleme ile göster (OPTIMIZED: Single Request with History)
  const previewBatchAI = async (mode: 'IMPROVE' | 'SPELL') => {
    if (isAIProcessing) return;
    
    const worklogsWithComments = worklogs.filter(wl => wl.comment && wl.comment.trim().length > 0);
    
    if (worklogsWithComments.length === 0) {
        notify('Hata', 'İşlenecek yorum içeren worklog bulunamadı.', 'error');
        return;
    }

    if (!settings.groqApiKey) {
        notify('AI Hatası', 'Ayarlarda Groq API Anahtarı eksik', 'error');
        setIsSettingsOpen(true);
        return;
    }

    setIsAIProcessing(true);
    setTextChangeMode(mode);
    const actionName = mode === 'IMPROVE' ? 'İyileştirme' : 'İmla Düzeltme';
    notify('AI İşleniyor', `${worklogsWithComments.length} worklog için ${actionName.toLowerCase()} hazırlanıyor...`, 'info');
    
    try {
        // Prepare JSON payload
        const items = worklogsWithComments.map(wl => ({
            id: wl.id,
            summary: wl.summary,
            text: wl.comment
        }));

        // Get historical context for better AI learning
        const historicalContext = mode === 'IMPROVE' 
            ? generateBatchContext(worklogsWithComments, worklogCacheRef)
            : '';

        let prompt = '';
        if (mode === 'IMPROVE') {
            prompt = `Sen profesyonel bir worklog asistanısın. Aşağıdaki worklog notlarını geliştir.

KURALLAR:
- Her notu 2-3 cümleye genişlet (150-250 karakter).
- Bağlam için verilen 'summary' alanını kullan.
- Doğal, profesyonel Türkçe kullan.
- Yapılan işi somut eylemlerle anlat: görüşüldü, incelendi, düzeltildi, eklendi, test edildi.
- "Gerçekleştirildi", "sağlandı", "tamamlandı", "optimize edildi" gibi klişelerden KAÇIN.
- Orijinal metinde olmayan teknik terim EKLEME.
- SADECE JSON array döndür, başka bir şey yazma.
${historicalContext}

GİRİŞ JSON:
${JSON.stringify(items, null, 2)}

ÇIKIŞ JSON FORMATI:
[{"id": "xxx", "text": "Geliştirilmiş metin..."}]`;
        } else {
            // SPELL MODE - Sadece yazım hatalarını düzelt
            prompt = `Sen bir yazım denetleyicisisin. Aşağıdaki metinlerdeki yazım ve noktalama hatalarını düzelt.

KURALLAR:
- SADECE yazım ve noktalama hatalarını düzelt.
- Cümle yapısını veya kelimeleri DEĞİŞTİRME (yanlış yazılmış kelimeler hariç).
- Anlamı AYNEN koru.
- SADECE JSON array döndür, başka bir şey yazma.

GİRİŞ JSON:
${JSON.stringify(items, null, 2)}

ÇIKIŞ JSON FORMATI:
[{"id": "xxx", "text": "Düzeltilmiş metin..."}]`;
        }

        // Calculate tokens - more generous for IMPROVE mode
        const inputLength = JSON.stringify(items).length;
        const maxTokens = mode === 'IMPROVE' 
            ? Math.min(8000, Math.max(3000, inputLength * 4))
            : Math.min(4000, Math.max(1500, inputLength * 2));

        // Lower temperature for spell check, slightly higher for improve
        const temperature = mode === 'SPELL' ? 0.05 : 0.15;
        
        const rawResponse = await callGroq(prompt, settings, maxTokens, temperature);
        
        let parsedResponse: {id: string, text: string}[] = [];
        try {
            // Extract JSON from response (handle potential wrapper text)
            const jsonMatch = rawResponse.match(/\[[\s\S]*?\]/);
            if (jsonMatch) {
                parsedResponse = JSON.parse(jsonMatch[0]);
            } else {
                parsedResponse = JSON.parse(rawResponse);
            }
        } catch (e) {
            console.error("JSON Parse Error:", e, "Raw:", rawResponse.substring(0, 500));
            throw new Error("AI yanıtı işlenemedi. Lütfen tekrar deneyin.");
        }

        const previews: TextChangePreview[] = [];
        
        for (const item of parsedResponse) {
            const original = worklogsWithComments.find(w => w.id === item.id);
            if (original && item.text) {
                const improvedText = cleanAIOutput(item.text.trim(), mode === 'SPELL');
                
                // Normalize check
                const normalizeText = (t: string) => t.toLowerCase().replace(/[^a-zçğıöşü0-9]/gi, '');
                const isDifferent = normalizeText(improvedText) !== normalizeText(original.comment);
                
                if (isDifferent || improvedText) {
                    previews.push({
                        worklogId: original.id,
                        issueKey: original.issueKey,
                        summary: original.summary,
                        before: original.comment,
                        after: improvedText,
                        mode
                    });
                }
            }
        }
        
        if (previews.length === 0) {
            notify('Bilgi', 'Değişiklik önerisi bulunamadı.', 'info');
            setIsAIProcessing(false);
            return;
        }
        
        setTextChangePreview(previews);
        
    } catch (e: any) {
        notify('AI Başarısız', e.message, 'error');
    } finally {
        setIsAIProcessing(false);
    }
  };

  // Apply batch AI changes
  const applyTextChanges = async () => {
    if (!textChangePreview || textChangePreview.length === 0) return;
    
    setIsAIProcessing(true);
    
    try {
        // Collect all undo data first
        const allUndoData = textChangePreview.map(preview => ({
            worklogId: preview.worklogId,
            issueKey: preview.issueKey,
            previousComment: preview.before,
            newComment: preview.after
        }));
        
        // Process all updates sequentially (skipNotification=true prevents individual loadData calls)
        let successCount = 0;
        for (const preview of textChangePreview) {
            try {
                await handleUpdateWorklog(preview.worklogId, preview.after, undefined, true);
                successCount++;
            } catch (err) {
                console.error(`❌ Failed to update worklog ${preview.worklogId}:`, err);
            }
        }
        
        // Create single batch undo action
        const batchUndoAction: UndoAction = {
            type: 'BATCH_UPDATE',
            data: allUndoData
        };
        
        // Add individual entries to history (without toast) for each change
        for (const preview of textChangePreview) {
            const actionName = preview.mode === 'IMPROVE' ? 'İyileştirildi' : 'İmla Düzeltildi';
            const historyEntry: NotificationHistoryItem = {
                id: `${Date.now()}-${preview.worklogId}`,
                title: actionName,
                message: `${preview.issueKey} worklog metni güncellendi`,
                type: 'success',
                timestamp: Date.now(),
                diff: { before: preview.before, after: preview.after, issueKey: preview.issueKey }
            };
            setNotificationHistory(prev => [historyEntry, ...prev].slice(0, 100));
        }
        
        // Final notification with toast + batch undo
        const modeLabel = textChangeMode === 'IMPROVE' ? 'İyileştirme' : 'İmla Düzeltme';
        notify(
            'Toplu İşlem Tamamlandı', 
            `${successCount}/${textChangePreview.length} worklog ${modeLabel.toLowerCase()} uygulandı.`, 
            'success',
            batchUndoAction
        );
        
        setTextChangePreview(null);
        setTextChangeMode(null);
        
        // Single loadData call after all batch updates complete
        setTimeout(() => {
            loadData(true);
        }, 500);
        
    } catch (e: any) {
        notify('Uygulama Hatası', e.message, 'error');
    } finally {
        setIsAIProcessing(false);
    }
  };

  // AI-powered smart distribution - Preview
  // Kalan saati (hedef - mevcut toplam) AI ile akıllı şekilde dağıtır
  const previewSmartDistribute = async () => {
     if (loadingState === LoadingState.LOADING || isDistributing) return;
     
     const target = settings.targetDailyHours;
     
     if (worklogs.length === 0) {
         notify('Hata', 'Dağıtılacak worklog bulunamadı.', 'error');
         return;
     }

     const currentTotal = worklogs.reduce((sum, wl) => sum + wl.hours, 0);
     const remaining = target - currentTotal;

     if (!settings.groqApiKey) {
         notify('AI Hatası', 'Akıllı dağıtım için Groq API Anahtarı gerekli', 'error');
         setIsSettingsOpen(true);
         return;
     }

     setIsDistributing(true);
     notify('AI Analiz Ediyor', 'Geçmiş veriler ve iş karmaşıklığı analiz ediliyor...', 'info');
     
     try {
         // 1. Her worklog için geçmiş veri analizi yap
         const worklogAnalysis = worklogs.map(wl => {
             const estimate = estimateWorkComplexity(wl, worklogCacheRef);
             return {
                 id: wl.id,
                 key: wl.issueKey,
                 summary: wl.summary,
                 comment: wl.comment || '',
                 currentHours: wl.hours,
                 historicalAvg: estimate.estimatedHours,
                 confidence: estimate.confidence,
                 reasoning: estimate.reasoning
             };
         });

         // 2. Geçmiş verilerden özet oluştur
         let contextLogs: string[] = [];
         if (worklogCacheRef.current) {
             worklogCacheRef.current.forEach((cached, date) => {
                 if (date !== selectedDate) {
                     cached.worklogs.forEach(l => {
                         if (l.comment && l.hours > 0.2) {
                             contextLogs.push(`[${l.issueKey}] ${l.summary}: ${l.hours}h`);
                         }
                     });
                 }
             });
         }
         const contextText = contextLogs.slice(-20).join('\n');

         // 3. AI'ya zengin bağlam gönder
         const prompt = `Sen uzman bir proje yöneticisi ve SAP danışmanısın. Bugünün iş kayıtlarının sürelerini optimize et.

HEDEF: Toplam süre TAM OLARAK ${target} saat olmalı.
MEVCUT: ${currentTotal.toFixed(2)} saat
FARK: ${remaining > 0 ? '+' : ''}${remaining.toFixed(2)} saat ${remaining > 0 ? 'eklenmeli' : 'azaltılmalı'}

BUGÜNÜN KAYITLARI (GEÇMİŞ ANALİZİ DAHİL):
${worklogAnalysis.map((w, i) => `${i}. [${w.key}] ${w.summary}
   Detay: "${w.comment}"
   Mevcut: ${w.currentHours}h | Geçmiş Ort: ${w.historicalAvg}h (${w.confidence} güven)
   Analiz: ${w.reasoning}`).join('\n\n')}

GEÇMİŞ KAYITLAR (Referans):
${contextText || 'Veri yok'}

ANALİZ KRİTERLERİ:
1. YORUM UZUNLUĞU: Uzun, detaylı yorumlar = daha fazla süre
2. GEÇMİŞ VERİ: Benzer işlerin ortalamasını dikkate al
3. İŞ KARMAŞIKLIĞI: Issue başlığından zorluğu tahmin et
4. MANTIKLILIK: "Hata düzeltildi" gibi basit işler < "Entegrasyon analizi" gibi karmaşık işler

KURALLAR:
1. Toplam TAM ${target} saat olmalı (virgüllü sayılar olabilir: 2.5, 1.75)
2. Minimum süre: 0.25h (15 dakika)
3. Geçmiş verisi olan işlere öncelik ver
4. Detaylı yorum = daha fazla süre, kısa yorum = daha az süre

JSON ÇIKTI (SADECE ARRAY):
[{"index": 0, "newTotalHours": 2.5, "reason": "detaylı analiz yapılmış"}, ...]`;

         const response = await callGroq(prompt, settings, 1000, 0.1);
         
         // Parse AI response
         let distribution: { index: number; newTotalHours: number; reason?: string }[];
         try {
             const jsonMatch = response.match(/\[[\s\S]*?\]/);
             if (!jsonMatch) throw new Error('JSON bulunamadı');
             distribution = JSON.parse(jsonMatch[0]);
         } catch (parseErr) {
             console.error('AI Parse Error:', parseErr, response.substring(0, 500));
             notify('AI Yanıt Hatası', 'Yapay zeka yanıtı işlenemedi. Lütfen tekrar deneyin.', 'error');
             setIsDistributing(false);
             return;
         }

         // Validate and adjust to exact target
         const totalAINewHours = distribution.reduce((sum, d) => sum + (d.newTotalHours || 0), 0);
         const ratio = totalAINewHours > 0 ? target / totalAINewHours : 1;
         
         const previewItems = worklogs.map((wl, index) => {
             const aiItem = distribution.find(d => d.index === index);
             const aiNewHours = aiItem?.newTotalHours || (target / worklogs.length);
             const adjustedHours = Math.max(0.25, Math.round(aiNewHours * ratio * 100) / 100);
             return {
                 issueKey: wl.issueKey,
                 summary: wl.summary,
                 currentHours: wl.hours,
                 newHours: adjustedHours
             };
         });
         
         // Final adjustment for exact target
         const previewTotal = previewItems.reduce((sum, item) => sum + item.newHours, 0);
         if (Math.abs(previewTotal - target) > 0.01 && previewItems.length > 0) {
             const lastIndex = previewItems.length - 1;
             previewItems[lastIndex].newHours = Math.round((previewItems[lastIndex].newHours + (target - previewTotal)) * 100) / 100;
             // Ensure minimum
             if (previewItems[lastIndex].newHours < 0.25) {
                 previewItems[lastIndex].newHours = 0.25;
             }
         }
         
         setDistributionPreview({
             mode: 'ai',
             items: previewItems,
             targetHours: target
         });
         
     } catch (e: any) {
         notify('AI Dağıtım Hatası', e.message, 'error');
     } finally {
         setIsDistributing(false);
     }
  };

  // Equal distribution - Preview
  // Kalan saati (hedef - mevcut toplam) mevcut work log'lara eşit dağıtır
  const previewEqualDistribute = () => {
     const target = settings.targetDailyHours;
     
     if (worklogs.length === 0) {
         notify('Hata', 'Dağıtılacak worklog bulunamadı.', 'error');
         return;
     }

     const currentTotal = worklogs.reduce((sum, wl) => sum + wl.hours, 0);
     const remaining = target - currentTotal;
     
     // NOT: remaining <= 0 olsa bile devam et (azaltma yapılacak)
     
     // Kalan saati eşit dağıt: her log'a +remaining/count saat
     const addPerLog = remaining / worklogs.length;
     
     const previewItems = worklogs.map(wl => ({
         issueKey: wl.issueKey,
         summary: wl.summary,
         currentHours: wl.hours,
         newHours: Math.max(0, Math.round((wl.hours + addPerLog) * 100) / 100)
     }));
     
     // Adjust for rounding errors - son log'u düzelt
     const previewTotal = previewItems.reduce((sum, item) => sum + item.newHours, 0);
     if (Math.abs(previewTotal - target) > 0.01 && previewItems.length > 0) {
         previewItems[previewItems.length - 1].newHours = Math.round((previewItems[previewItems.length - 1].newHours + (target - previewTotal)) * 100) / 100;
     }
     
     setDistributionPreview({
         mode: 'equal',
         items: previewItems,
         targetHours: target
     });
  };

  // Apply distribution from preview
  const applyDistribution = async () => {
     if (!distributionPreview) return;
     
     setIsDistributing(true);
     
     try {
         // Store previous values for undo
         const undoData = worklogs.map((wl, index) => ({
             worklogId: wl.id,
             issueKey: wl.issueKey,
             previousSeconds: wl.seconds,
             newSeconds: Math.round(distributionPreview.items[index].newHours * 3600)
         }));
         
         // Apply distribution
         const promises = worklogs.map(async (wl, index) => {
             const newSeconds = undoData[index].newSeconds;
             if (newSeconds !== wl.seconds) {
                await updateWorklog(wl, settings, undefined, newSeconds);
             }
         });
         
         await Promise.all(promises);
         await loadData(true);
         
         // Notify with undo
         const undoAction: UndoAction = {
             type: 'BATCH_UPDATE',
             data: undoData
         };
         
         const modeLabel = distributionPreview.mode === 'ai' ? 'AI Akıllı' : 'Eşit';
         notify('Dağıtım Tamamlandı', `Süreler ${modeLabel} dağıtım ile ${distributionPreview.targetHours}h hedefe ayarlandı.`, 'success', undoAction);
         
         setDistributionPreview(null);
         setEditingDistItemIndex(null);
     } catch (e: any) {
         notify('Dağıtım Hatası', e.message, 'error');
     } finally {
         setIsDistributing(false);
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
          
          // setWorklogs(updatedWorklogs);
          loadData(true);
          
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

  // Confetti component
  const ConfettiEffect = () => {
    if (!showConfetti) return null;
    
    // Use design system colors - these work in both light and dark mode
    const colors = [
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary-500').trim() || '#3B82F6',
      getComputedStyle(document.documentElement).getPropertyValue('--color-success').trim() || '#10B981',
      getComputedStyle(document.documentElement).getPropertyValue('--color-warning').trim() || '#F59E0B',
      getComputedStyle(document.documentElement).getPropertyValue('--color-error').trim() || '#EF4444',
      getComputedStyle(document.documentElement).getPropertyValue('--color-ai-500').trim() || '#8B5CF6',
      getComputedStyle(document.documentElement).getPropertyValue('--color-info').trim() || '#06B6D4'
    ];
    const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 6,
      rotation: Math.random() * 360
    }));
    
    return (
      <div className="confetti-container">
        {confettiPieces.map(piece => (
          <div
            key={piece.id}
            className="confetti-piece"
            style={{
              left: `${piece.left}%`,
              width: piece.size,
              height: piece.size,
              backgroundColor: piece.color,
              borderRadius: Math.random() > 0.5 ? '50%' : '0',
              animationDelay: `${piece.delay}s`,
              transform: `rotate(${piece.rotation}deg)`
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <main ref={mainRef} className={`min-h-screen py-4 px-3 sm:py-6 sm:px-4 md:py-10 md:px-6 animate-fade-in overflow-x-hidden ${isMobileDevice ? 'pb-24' : ''}`}>
      
      {/* Pull to Refresh Indicator */}
      <div 
        className={`pull-indicator ${isPulling ? 'visible' : ''} ${loadingState === LoadingState.LOADING ? 'refreshing' : ''}`}
        style={{ transform: `translateX(-50%) translateY(${pullProgress * 60 - 60}px)` }}
      >
        <RefreshCw size={16} className="pull-icon" />
        {loadingState === LoadingState.LOADING ? 'Yenileniyor...' : 'Yenilemek için bırak'}
      </div>
      
      {/* Offline/Sync Status Indicator */}
      {(!isOnline || queue.length > 0 || isSyncing) && (
        <div className="offline-indicator" style={{ 
            background: isOnline ? 'var(--color-surface)' : 'var(--color-surface-container)',
            borderColor: isOnline ? 'var(--color-primary-200)' : 'var(--color-outline)'
        }}>
          {!isOnline ? (
            <>
              <span className="offline-dot" style={{ background: 'var(--color-error)' }} />
              Çevrimdışı
            </>
          ) : (
            <>
              {isSyncing ? (
                 <RefreshCw size={14} className="animate-spin text-blue-500" />
              ) : (
                 <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              )}
              <span style={{ color: 'var(--color-on-surface)' }}>
                {isSyncing ? 'Senkronize ediliyor...' : `${queue.length} değişiklik kuyrukta`}
              </span>
            </>
          )}
        </div>
      )}
      
      {/* Confetti Effect */}
      <ConfettiEffect />
      
      {/* Main Container - Clean Google-style layout */}
      <div className="w-full max-w-5xl mx-auto space-y-6">
        
        <Header 
            setIsAddWorklogOpen={setIsAddWorklogOpen}
            setIsWeeklyReportOpen={setIsWeeklyReportOpen}
            setIsHistoryOpen={setIsHistoryOpen}
            setIsSettingsOpen={setIsSettingsOpen}
            toggleTheme={toggleTheme}
            isDarkTheme={settings.isDarkTheme}
            undoableCount={undoableCount}
            onToggleDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
        />

        {/* Dashboard Grid - Responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Sidebar: Controls & Stats */}
            <Sidebar 
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                changeDate={changeDate}
                totalHours={totalHours}
                settings={settings}
                isTargetMet={isTargetMet}
                progress={progress}
                isEditingTarget={isEditingTarget}
                setIsEditingTarget={setIsEditingTarget}
                tempTargetHours={tempTargetHours}
                setTempTargetHours={setTempTargetHours}
                handleTargetHoursChange={handleTargetHoursChange}
                loadData={loadData}
                loadingState={loadingState}
                isDistributing={isDistributing}
                previewEqualDistribute={previewEqualDistribute}
                previewSmartDistribute={previewSmartDistribute}
                isAIProcessing={isAIProcessing}
                textChangeMode={textChangeMode}
                previewBatchAI={previewBatchAI}
                copyPreviousDay={copyPreviousDay}
                weeklyHours={weeklyHours}
                isLoadingWeek={isLoadingWeek}
            />

            {/* Right: Worklog List */}
            <section className="lg:col-span-8" aria-label="Worklog list">
                <div className="surface-card p-4 md:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.05em' }}>
                            Kayıtlar
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
                        onUpdate={(id, comment, seconds, isUndoRedo, newDate) => 
                            handleUpdateWorklog(id, comment, seconds, false, isUndoRedo, newDate)
                        }
                        onImprove={(id) => handleAIAction(id, 'IMPROVE')}
                        onSpellCheck={(id) => handleAIAction(id, 'SPELL')}
                        jiraBaseUrl={settings.jiraUrl}
                        worklogHistories={worklogHistories}
                        onHistoryChange={handleWorklogHistoryChange}
                        onDelete={handleDeleteWorklog}
                        settings={settings}
                        isAIProcessing={isAIProcessing}
                        aiProcessingMode={textChangeMode}
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
        getTimeEstimation={getTimeEstimation}
      />

      {/* Notification History Panel */}
      <NotificationHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        notifications={notificationHistory}
        onUndo={handleUndo}
        onDelete={deleteNotification}
        onClear={clearNotificationHistory}
      />

      {/* Weekly Report Modal */}
      <WeeklyReportModal
        isOpen={isWeeklyReportOpen}
        onClose={() => setIsWeeklyReportOpen(false)}
        settings={settings}
        onFetchWeekWorklogs={fetchDateRangeWorklogs}
        onAIGenerate={settings.groqApiKey ? generateAIWeeklyReport : undefined}
      />

      {/* Distribution Preview Modal */}
      {distributionPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => { setDistributionPreview(null); setEditingDistItemIndex(null); }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            
            <div 
                className="relative w-full max-w-lg animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <div className="surface-card p-0 overflow-hidden" style={{ boxShadow: 'var(--elevation-4)' }}>
                    
                    {/* Header */}
                    <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-outline-variant)' }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" 
                                     style={{ 
                                         background: distributionPreview.mode === 'ai' 
                                             ? 'var(--gradient-ai)'
                                             : 'var(--color-success-container)'
                                     }}>
                                    {distributionPreview.mode === 'ai' ? (
                                        <Brain size={22} className="text-white" />
                                    ) : (
                                        <Clock size={22} style={{ color: 'var(--color-success)' }} />
                                    )}
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                                        {distributionPreview.mode === 'ai' ? 'AI Akıllı Dağıtım' : 'Eşit Dağıtım'}
                                    </h2>
                                    <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                        Hedef: {distributionPreview.targetHours} saat
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Body - Preview List */}
                    <div className="p-4 max-h-96 overflow-y-auto">
                        <div className="space-y-2">
                            {distributionPreview.items.map((item, index) => (
                                <div 
                                    key={index}
                                    className="p-3 rounded-xl border relative group"
                                    style={{ 
                                        backgroundColor: 'var(--color-surface-variant)',
                                        borderColor: 'var(--color-outline-variant)'
                                    }}
                                >
                                    {/* Delete button */}
                                    {distributionPreview.items.length > 1 && (
                                        <button
                                            onClick={() => {
                                                setDistributionPreview(prev => prev ? {
                                                    ...prev,
                                                    items: prev.items.filter((_, i) => i !== index)
                                                } : null);
                                            }}
                                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            style={{ 
                                                backgroundColor: 'var(--color-error)',
                                                color: 'white'
                                            }}
                                            title="Kaldır"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                    
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-bold px-2 py-0.5 rounded mr-2" 
                                                  style={{ backgroundColor: 'var(--color-primary-container)', color: 'var(--color-primary-600)' }}>
                                                {item.issueKey}
                                            </span>
                                            <p className="text-sm font-medium truncate mt-1" style={{ color: 'var(--color-on-surface)' }}>
                                                {item.summary}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            {editingDistItemIndex === index ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={editDistHoursStr}
                                                        onChange={(e) => setEditDistHoursStr(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                const newVal = parseFloat(editDistHoursStr);
                                                                if (!isNaN(newVal) && newVal >= 0.1 && newVal <= 24) {
                                                                    setDistributionPreview(prev => prev ? {
                                                                        ...prev,
                                                                        items: prev.items.map((it, i) => 
                                                                            i === index ? { ...it, newHours: newVal } : it
                                                                        )
                                                                    } : null);
                                                                    setEditingDistItemIndex(null);
                                                                }
                                                            } else if (e.key === 'Escape') {
                                                                setEditingDistItemIndex(null);
                                                            }
                                                        }}
                                                        onBlur={() => {
                                                            const newVal = parseFloat(editDistHoursStr);
                                                            if (!isNaN(newVal) && newVal >= 0.1 && newVal <= 24) {
                                                                setDistributionPreview(prev => prev ? {
                                                                    ...prev,
                                                                    items: prev.items.map((it, i) => 
                                                                        i === index ? { ...it, newHours: newVal } : it
                                                                    )
                                                                } : null);
                                                            }
                                                            setEditingDistItemIndex(null);
                                                        }}
                                                        className="w-16 px-2 py-1 text-sm rounded border text-center"
                                                        style={{
                                                            backgroundColor: 'var(--color-surface)',
                                                            borderColor: 'var(--color-primary)',
                                                            color: 'var(--color-on-surface)'
                                                        }}
                                                        step="0.25"
                                                        min="0.1"
                                                        max="24"
                                                        autoFocus
                                                    />
                                                    <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>saat</span>
                                                </div>
                                            ) : (
                                                <div 
                                                    className="cursor-pointer hover:opacity-80 transition-opacity"
                                                    onClick={() => {
                                                        setEditingDistItemIndex(index);
                                                        setEditDistHoursStr(item.newHours.toString());
                                                    }}
                                                    title="Tıklayarak düzenle"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm line-through" style={{ color: 'var(--color-on-surface-variant)' }}>
                                                            {formatHours(item.currentHours)}h
                                                        </span>
                                                        <span className="text-lg font-bold" style={{ 
                                                            color: item.newHours > item.currentHours 
                                                                ? 'var(--color-success)' 
                                                                : item.newHours < item.currentHours 
                                                                    ? 'var(--color-error)' 
                                                                    : 'var(--color-on-surface)'
                                                        }}>
                                                            {formatHours(item.newHours)}h
                                                        </span>
                                                        <Edit3 size={14} style={{ color: 'var(--color-on-surface-variant)' }} />
                                                    </div>
                                                    {item.newHours !== item.currentHours && (
                                                        <span className="text-xs" style={{ 
                                                            color: item.newHours > item.currentHours 
                                                                ? 'var(--color-success)' 
                                                                : 'var(--color-error)' 
                                                        }}>
                                                            {item.newHours > item.currentHours ? '+' : ''}{formatHours(item.newHours - item.currentHours)}h
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Summary */}
                        <div className="mt-4 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-primary-container)' }}>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
                                    Toplam
                                </span>
                                <span className="text-lg font-bold" style={{ color: 'var(--color-primary-600)' }}>
                                    {formatHours(distributionPreview.items.reduce((sum, item) => sum + item.newHours, 0))}h
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="px-6 py-4 border-t flex items-center justify-end gap-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
                        <button 
                            onClick={() => { setDistributionPreview(null); setEditingDistItemIndex(null); }} 
                            className="btn-text"
                        >
                            İptal
                        </button>
                        <button 
                            onClick={applyDistribution}
                            className="btn-filled ripple"
                            disabled={isDistributing}
                            style={distributionPreview.mode === 'ai' ? { 
                                background: 'var(--gradient-ai)'
                            } : {}}
                        >
                            {isDistributing ? (
                                <>
                                    <RefreshCw size={18} className="animate-spin" /> Uygulanıyor...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={18} /> Uygula
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Text Change Preview Modal - AI İyileştirme/İmla Önizleme */}
      {textChangePreview && textChangePreview.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setTextChangePreview(null)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            
            <div 
                className="relative w-full max-w-3xl animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <div className="surface-card p-0 overflow-hidden" style={{ boxShadow: 'var(--elevation-4)' }}>
                    
                    {/* Header */}
                    <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-outline-variant)' }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" 
                                     style={{ 
                                         background: textChangeMode === 'IMPROVE' 
                                             ? 'var(--gradient-ai)'
                                             : 'linear-gradient(135deg, var(--color-warning) 0%, var(--color-warning-dark) 100%)'
                                     }}>
                                    {textChangeMode === 'IMPROVE' ? (
                                        <Sparkles size={22} className="text-white" />
                                    ) : (
                                        <Edit3 size={22} className="text-white" />
                                    )}
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                                        {textChangeMode === 'IMPROVE' ? 'Metin İyileştirme Önizleme' : 'İmla Düzeltme Önizleme'}
                                    </h2>
                                    <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                        {textChangePreview.length} worklog değişecek
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Body - Preview List */}
                    <div className="p-4 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-4">
                            {textChangePreview.map((item, index) => (
                                <div 
                                    key={index}
                                    className="rounded-xl border overflow-hidden"
                                    style={{ borderColor: 'var(--color-outline-variant)' }}
                                >
                                    {/* Issue Header */}
                                    <div className="px-4 py-3 border-b" style={{ 
                                        backgroundColor: 'var(--color-surface-variant)',
                                        borderColor: 'var(--color-outline-variant)'
                                    }}>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded mr-2" 
                                              style={{ backgroundColor: 'var(--color-primary-container)', color: 'var(--color-primary-600)' }}>
                                            {item.issueKey}
                                        </span>
                                        <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                                            {item.summary}
                                        </span>
                                    </div>
                                    
                                    {/* Diff View */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                                        {/* Before - Silinen kısımlar üzeri çizili */}
                                        <div className="p-4 border-b md:border-b-0 md:border-r" style={{ 
                                            backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                            borderColor: 'var(--color-outline-variant)'
                                        }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded" 
                                                      style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' }}>
                                                    ÖNCEKİ
                                                </span>
                                            </div>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-on-surface)' }}>
                                                {(() => {
                                                    const { beforeParts } = computeWordDiff(item.before, item.after);
                                                    return beforeParts.map((part, idx) => (
                                                        part.type === 'removed' ? (
                                                            <span key={idx} style={{ 
                                                                textDecoration: 'line-through',
                                                                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                                                                color: 'var(--color-error)',
                                                                borderRadius: '2px',
                                                                padding: '0 2px'
                                                            }}>{part.text}</span>
                                                        ) : (
                                                            <span key={idx}>{part.text}</span>
                                                        )
                                                    ));
                                                })()}
                                            </p>
                                        </div>
                                        
                                        {/* After - Eklenen kısımlar bold ve vurgulu */}
                                        <div className="p-4" style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)' }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded" 
                                                      style={{ backgroundColor: 'var(--color-success-container)', color: 'var(--color-success)' }}>
                                                    YENİ
                                                </span>
                                            </div>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-on-surface)' }}>
                                                {(() => {
                                                    const { afterParts } = computeWordDiff(item.before, item.after);
                                                    return afterParts.map((part, idx) => (
                                                        part.type === 'added' ? (
                                                            <span key={idx} style={{ 
                                                                fontWeight: 700,
                                                                backgroundColor: 'rgba(34, 197, 94, 0.25)',
                                                                color: 'var(--color-success)',
                                                                borderRadius: '2px',
                                                                padding: '0 2px'
                                                            }}>{part.text}</span>
                                                        ) : (
                                                            <span key={idx}>{part.text}</span>
                                                        )
                                                    ));
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-outline-variant)' }}>
                        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                            <span className="font-semibold">{textChangePreview.length}</span> değişiklik uygulanacak
                        </p>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => {
                                    setTextChangePreview(null);
                                    setTextChangeMode(null);
                                }} 
                                className="btn-text"
                            >
                                İptal
                            </button>
                            <button 
                                onClick={applyTextChanges}
                                className="btn-filled ripple"
                                disabled={isAIProcessing}
                                style={textChangeMode === 'IMPROVE' ? { 
                                    background: 'var(--gradient-ai)'
                                } : {
                                    background: 'linear-gradient(135deg, var(--color-warning) 0%, var(--color-warning-dark) 100%)'
                                }}
                            >
                                {isAIProcessing ? (
                                    <>
                                        <RefreshCw size={18} className="animate-spin" /> Uygulanıyor...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={18} /> Tümünü Uygula
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Toast Notifications - Mobile-friendly positioning */}
      <div className="fixed bottom-24 lg:bottom-6 right-4 lg:right-6 flex flex-col gap-3 z-50 pointer-events-none max-w-[calc(100vw-2rem)]" role="alert" aria-live="polite">
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

      {/* Mobile Bottom Navigation - Apple Tab Bar Style */}
      <nav className="bottom-nav">
        <button 
          onClick={() => setSelectedDate(toLocalDateStr(new Date()))}
          className={`bottom-nav-item haptic-feedback ${selectedDate === toLocalDateStr(new Date()) ? 'active' : ''}`}
        >
          <CalendarIcon size={22} strokeWidth={1.5} />
          <span>Bugün</span>
        </button>
        <button 
          onClick={() => {
            if ('vibrate' in navigator) navigator.vibrate(5);
            setIsHistoryOpen(true);
          }}
          className="bottom-nav-item haptic-feedback"
        >
          <History size={22} strokeWidth={1.5} />
          <span>Geçmiş</span>
        </button>
        <button 
          onClick={() => {
            if ('vibrate' in navigator) navigator.vibrate(5);
            setIsAddWorklogOpen(true);
          }}
          className="bottom-nav-item haptic-feedback"
          style={{ 
            background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)', 
            color: 'white',
            borderRadius: 'var(--radius-full)',
            padding: '0.5rem 1rem',
            boxShadow: 'var(--shadow-primary)'
          }}
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
        <button 
          onClick={() => {
            if ('vibrate' in navigator) navigator.vibrate(5);
            loadData(true);
          }}
          className={`bottom-nav-item haptic-feedback ${loadingState === LoadingState.LOADING || isSyncing ? 'active' : ''}`}
        >
          <RefreshCw size={22} strokeWidth={1.5} className={loadingState === LoadingState.LOADING || isSyncing ? 'animate-spin' : ''} />
          <span>{isSyncing ? 'Sync...' : 'Yenile'}</span>
          {queue.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          )}
        </button>
        <button 
          onClick={() => {
            if ('vibrate' in navigator) navigator.vibrate(5);
            setIsSettingsOpen(true);
          }}
          className="bottom-nav-item haptic-feedback"
        >
          <Edit3 size={22} strokeWidth={1.5} />
          <span>Ayarlar</span>
        </button>
      </nav>

      {/* Apple-style Footer */}
      <footer className="apple-footer hidden lg:block">
        <span className="footer-text">
          Powered by <span className="footer-author">İlkay Turna</span>
        </span>
      </footer>

      {/* Floating Magic Button - Desktop only */}
      <button
        onClick={() => {
            triggerHaptic();
            setIsMagicBarOpen(true);
        }}
        className="desktop-only fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
        style={{ 
            background: 'linear-gradient(135deg, var(--color-ai-500) 0%, var(--color-primary-500) 100%)',
            boxShadow: '0 6px 24px rgba(139, 92, 246, 0.35)'
        }}
        title="AI Worklog Asistanı (Ctrl+K)"
      >
        <Sparkles size={20} className="text-white" />
      </button>

        <MagicCommandBar
            isOpen={isMagicBarOpen}
            onClose={() => setIsMagicBarOpen(false)}
            onSubmit={handleAddWorklog}
            settings={settings}
        />

        <AssignedIssuesDrawer 
            isOpen={isDrawerOpen} 
            onClose={() => setIsDrawerOpen(false)} 
            settings={settings}
            onDragStart={() => {}}
        />

        {/* PWA Install Prompt */}
        <InstallPrompt />
    </main>
  );
}
