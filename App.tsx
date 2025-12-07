
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Settings, Moon, Sun, Calendar as CalendarIcon, RefreshCw, CheckCircle2, AlertCircle, Info, ChevronLeft, ChevronRight, Copy, Sparkles, Clock, Plus, Bell, History, Brain, Edit3, FileSpreadsheet, FileText } from 'lucide-react';
import { AppSettings, Worklog, LoadingState, Notification, NotificationHistoryItem, WorklogSuggestion, UndoAction, DEFAULT_SYSTEM_PROMPT, TextChangePreview, WeeklyReportItem, WorklogHistoryEntry } from './types';
import { fetchWorklogs, updateWorklog, callGroq, createWorklog, deleteWorklog, fetchIssueDetails, fetchWeekWorklogs } from './services/api';
import { SettingsModal } from './components/SettingsModal';
import { WorklogList } from './components/WorklogList';
import { AddWorklogModal } from './components/AddWorklogModal';
import { NotificationHistory } from './components/NotificationHistory';
import { WeeklyReportModal } from './components/WeeklyReportModal';
import { secondsToHours, formatHours } from './utils/adf';

// Diff helper - kelime bazlı karşılaştırma
interface DiffPart {
  text: string;
  type: 'unchanged' | 'added' | 'removed';
}

const computeWordDiff = (before: string, after: string): { beforeParts: DiffPart[], afterParts: DiffPart[] } => {
  const beforeWords = before.split(/(\s+)/);
  const afterWords = after.split(/(\s+)/);
  
  // Simple LCS-based diff for words
  const m = beforeWords.length;
  const n = afterWords.length;
  
  // Build LCS table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeWords[i - 1] === afterWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find diff
  const beforeParts: DiffPart[] = [];
  const afterParts: DiffPart[] = [];
  
  let i = m, j = n;
  const beforeResult: DiffPart[] = [];
  const afterResult: DiffPart[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeWords[i - 1] === afterWords[j - 1]) {
      beforeResult.unshift({ text: beforeWords[i - 1], type: 'unchanged' });
      afterResult.unshift({ text: afterWords[j - 1], type: 'unchanged' });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      afterResult.unshift({ text: afterWords[j - 1], type: 'added' });
      j--;
    } else if (i > 0) {
      beforeResult.unshift({ text: beforeWords[i - 1], type: 'removed' });
      i--;
    }
  }
  
  // Merge consecutive same-type parts
  const mergeParts = (parts: DiffPart[]): DiffPart[] => {
    const merged: DiffPart[] = [];
    for (const part of parts) {
      if (merged.length > 0 && merged[merged.length - 1].type === part.type) {
        merged[merged.length - 1].text += part.text;
      } else {
        merged.push({ ...part });
      }
    }
    return merged;
  };
  
  return {
    beforeParts: mergeParts(beforeResult),
    afterParts: mergeParts(afterResult)
  };
};

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

// Worklog history key
const WORKLOG_HISTORY_KEY = `${APP_NAME}_worklogHistories`;

// Load worklog histories from localStorage
const loadWorklogHistories = (): Map<string, { entries: WorklogHistoryEntry[]; index: number }> => {
    try {
        const saved = localStorage.getItem(WORKLOG_HISTORY_KEY);
        if (!saved) return new Map();
        const parsed = JSON.parse(saved);
        // Filter entries older than 24 hours
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const filtered: Record<string, { entries: WorklogHistoryEntry[]; index: number }> = {};
        for (const [key, value] of Object.entries(parsed)) {
            const historyData = value as { entries: WorklogHistoryEntry[]; index: number };
            const validEntries = historyData.entries.filter(e => e.timestamp > oneDayAgo);
            if (validEntries.length > 0) {
                filtered[key] = { entries: validEntries, index: Math.min(historyData.index, validEntries.length - 1) };
            }
        }
        return new Map(Object.entries(filtered));
    } catch {
        return new Map();
    }
};

// Save worklog histories to localStorage
const saveWorklogHistories = (histories: Map<string, { entries: WorklogHistoryEntry[]; index: number }>) => {
    try {
        const obj = Object.fromEntries(histories);
        localStorage.setItem(WORKLOG_HISTORY_KEY, JSON.stringify(obj));
    } catch {
        // Ignore storage errors
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

// Update suggestions when a worklog is created - with min/max tracking
const updateSuggestions = (issueKey: string, summary: string, comment: string, hours: number) => {
    const suggestions = loadSuggestions();
    const existingIndex = suggestions.findIndex(s => s.issueKey === issueKey);
    
    if (existingIndex >= 0) {
        // Update existing with min/max/total tracking
        const existing = suggestions[existingIndex];
        const newTotalHours = (existing.totalHours || existing.avgHours * existing.frequency) + hours;
        const newFrequency = existing.frequency + 1;
        suggestions[existingIndex] = {
            ...existing,
            lastComment: comment || existing.lastComment,
            avgHours: newTotalHours / newFrequency,
            frequency: newFrequency,
            lastUsed: new Date().toISOString(),
            minHours: Math.min(existing.minHours || existing.avgHours, hours),
            maxHours: Math.max(existing.maxHours || existing.avgHours, hours),
            totalHours: newTotalHours
        };
    } else {
        // Add new
        suggestions.unshift({
            issueKey,
            summary,
            lastComment: comment,
            avgHours: hours,
            frequency: 1,
            lastUsed: new Date().toISOString(),
            minHours: hours,
            maxHours: hours,
            totalHours: hours
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
  minHoursPerWorklog: parseFloat(localStorage.getItem(`${APP_NAME}_minHoursPerWorklog`) || '0.25'),
  aiSystemPrompt: localStorage.getItem(`${APP_NAME}_aiSystemPrompt`) || DEFAULT_SYSTEM_PROMPT,
  isDarkTheme: localStorage.getItem(`${APP_NAME}_isDarkTheme`) === null ? true : localStorage.getItem(`${APP_NAME}_isDarkTheme`) === 'true',
};

// Varsayılan başlangıç tarihini hesapla - Yerel tarih kullan
const getDefaultStartDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper: Local date string (YYYY-MM-DD)
const toLocalDateStr = (d: Date): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Helper: Haftanın Pazartesi gününü bul
const getWeekMonday = (dateStr: string): string => {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  return toLocalDateStr(monday);
};

// Helper: Haftanın tüm günlerini al (Pazartesi-Pazar)
const getWeekDays = (dateStr: string): string[] => {
  const monday = getWeekMonday(dateStr);
  const mondayDate = new Date(monday);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(mondayDate);
    day.setDate(mondayDate.getDate() + i);
    days.push(toLocalDateStr(day));
  }
  return days;
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddWorklogOpen, setIsAddWorklogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWeeklyReportOpen, setIsWeeklyReportOpen] = useState(false);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getDefaultStartDate());
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>(loadNotificationHistory());
  const [suggestions, setSuggestions] = useState<WorklogSuggestion[]>(loadSuggestions());
  const [tempTargetHours, setTempTargetHours] = useState<string>(settings.targetDailyHours.toString());
  
  // Worklog history for undo/redo (per worklog) - localStorage'dan yükle
  const [worklogHistories, setWorklogHistories] = useState<Map<string, { entries: WorklogHistoryEntry[]; index: number }>>(loadWorklogHistories());
  
  // Daily cache - aynı gün için tekrar istek atmamak için
  const worklogCacheRef = useRef<Map<string, { worklogs: Worklog[]; timestamp: number }>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 dakika cache süresi
  
  // Hafta cache'i - tüm hafta verilerini sakla (date -> worklogs)
  const weekWorklogsCacheRef = useRef<Map<string, Worklog[]>>(new Map());
  const weekCacheMondayRef = useRef<string | null>(null);
  const [isLoadingWeek, setIsLoadingWeek] = useState(false);
  
  // Mevcut haftayı takip et (Pazartesi tarihi)
  const currentWeekMondayRef = useRef<string>(getWeekMonday(selectedDate));
  
  // Distribution Preview State
  const [distributionPreview, setDistributionPreview] = useState<{
    mode: 'equal' | 'ai';
    items: { issueKey: string; summary: string; currentHours: number; newHours: number }[];
    targetHours: number;
  } | null>(null);
  const [isDistributing, setIsDistributing] = useState(false);
  
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
        await loadData(settings, true);
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

  useEffect(() => {
    // Only load if all credentials are present to prevent errors
    if(settings.jiraUrl && settings.jiraToken && settings.jiraEmail) {
        const weekMonday = getWeekMonday(selectedDate);
        // Eğer hafta değişiyorsa, tüm hafta verilerini yükle
        if (weekCacheMondayRef.current !== weekMonday) {
            loadData(settings, true);
            currentWeekMondayRef.current = weekMonday;
        } else {
            // Aksi takdirde sadece o günün verilerini cache'ten al
            loadData(settings, false);
        }
    }
  }, [selectedDate, settings]);

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
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // N = New worklog
      if (e.key === 'n' || e.key === 'N') {
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
        loadData(settings, true);
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

  // Tek bir günün worklog'larını yükle ve cache'e kaydet
  const loadDayWorklogs = async (dateStr: string, currentSettings = settings): Promise<Worklog[]> => {
    const cached = worklogCacheRef.current.get(dateStr);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.worklogs;
    }
    
    try {
      const data = await fetchWorklogs(dateStr, currentSettings);
      worklogCacheRef.current.set(dateStr, { worklogs: data, timestamp: Date.now() });
      return data;
    } catch {
      return [];
    }
  };

  // Hafta değişikliğinde tüm haftanın günlerini sırayla yükle
  useEffect(() => {
    const loadWeekData = async () => {
      if (!settings.jiraUrl || !settings.jiraToken || !settings.jiraEmail) return;
      
      const newMonday = getWeekMonday(selectedDate);
      const prevMonday = currentWeekMondayRef.current;
      
      // Hafta değişti mi kontrol et
      if (newMonday !== prevMonday) {
        currentWeekMondayRef.current = newMonday;
        const weekDays = getWeekDays(selectedDate);
        
        // Önce seçili günü yükle
        setIsLoadingWeek(true);
        
        // Seçili günden başla, sonra diğer günleri sırayla yükle
        const selectedIndex = weekDays.indexOf(selectedDate);
        
        // Önce seçili günü yükle (loadData zaten yapacak ama hızlıca)
        await loadDayWorklogs(selectedDate, settings);
        
        // Sonra diğer günleri sırayla yükle (seçili günden başlayarak)
        for (let i = 0; i < weekDays.length; i++) {
          const dayDate = weekDays[i];
          if (dayDate !== selectedDate) {
            await loadDayWorklogs(dayDate, settings);
            // Her günden sonra weeklyHours'u güncelle ki UI'da yavaş yavaş görünsün
            updateWeeklyHoursFromCache();
          }
        }
        
        setIsLoadingWeek(false);
      }
    };
    
    loadWeekData();
  }, [selectedDate, settings.jiraUrl, settings.jiraToken, settings.jiraEmail]);

  // WeeklyHours'u cache'den güncelle (Pazartesi-Pazar sıralaması)
  const updateWeeklyHoursFromCache = () => {
    const weekMonday = getWeekMonday(selectedDate);
    const weekDays = getWeekDays(selectedDate);
    const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    
    const days: { date: string; hours: number; dayName: string }[] = [];
    
    for (let i = 0; i < weekDays.length; i++) {
      const dateStr = weekDays[i];
      // Hafta cache'inden al
      const weekCached = weekWorklogsCacheRef.current.get(dateStr);
      
      let totalHours = 0;
      if (weekCached) {
        totalHours = weekCached.reduce((sum, wl) => sum + wl.hours, 0);
      } else if (dateStr === selectedDate) {
        // Mevcut gün için state'ten al
        totalHours = worklogs.reduce((sum, wl) => sum + wl.hours, 0);
      }
      
      days.push({ date: dateStr, hours: totalHours, dayName: dayNames[i] });
    }
    
    setWeeklyHours(days);
  };

  // Load weekly hours for chart - seçilen tarihin haftası (Pazartesi-Pazar)
  useEffect(() => {
    updateWeeklyHoursFromCache();
  }, [selectedDate, worklogs, settings.jiraUrl, settings.jiraToken]);

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

  const deleteNotification = (id: string) => {
    setNotificationHistory(prev => prev.filter(n => n.id !== id));
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
    
    // Invalidate cache
    invalidateCache(selectedDate);
    
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

  // Hafta başında tüm hafta verilerini paralel olarak çek
  const loadWeekData = async (mondayDate: string, currentSettings?: AppSettings) => {
    const settings_to_use = currentSettings || settings;
    if (!settings_to_use.jiraUrl || !settings_to_use.jiraEmail || !settings_to_use.jiraToken) {
        return;
    }

    setIsLoadingWeek(true);
    try {
      const weekData: Map<string, Worklog[]> = await fetchWeekWorklogs(mondayDate, settings_to_use);
      
      // Cache'e kaydet - weekData zaten Map
      weekWorklogsCacheRef.current.clear();
      weekData.forEach((value, key) => {
        weekWorklogsCacheRef.current.set(key, value);
      });
      weekCacheMondayRef.current = mondayDate;
      
      // Mevcut günün verilerini state'e koy
      const todayWorklogs = weekData.get(selectedDate) || [];
      setWorklogs(todayWorklogs);
      
      // Haftalık özet'i güncelle
      updateWeeklyHoursFromCache();
      
      setLoadingState(LoadingState.SUCCESS);
    } catch (e: any) {
      console.error(e);
      setLoadingState(LoadingState.ERROR);
      notify('Hafta Verisi Yükleme Hatası', e.message, 'error');
      if(e.message.includes('Bilgileri Eksik') || e.message.includes('401')) {
          setIsSettingsOpen(true);
      }
    } finally {
      setIsLoadingWeek(false);
    }
  };

  const loadData = async (currentSettings = settings, forceRefresh = false) => {
    if (!currentSettings.jiraUrl || !currentSettings.jiraEmail || !currentSettings.jiraToken) {
        return;
    }

    const weekMonday = getWeekMonday(selectedDate);
    
    // Eğer haftanın başında değişim varsa, tüm hafta verilerini çek
    if (forceRefresh || weekCacheMondayRef.current !== weekMonday) {
        await loadWeekData(weekMonday, currentSettings);
        currentWeekMondayRef.current = weekMonday;
        return;
    }
    
    // Aksi takdirde cache'ten al
    const cachedWeekData = weekWorklogsCacheRef.current.get(selectedDate);
    if (cachedWeekData) {
        setWorklogs(cachedWeekData);
        // Haftalık özet'i güncelle
        updateWeeklyHoursFromCache();
        setLoadingState(LoadingState.SUCCESS);
    } else {
        // Haftanın cache'i var ama bu tarih yok (hata durumu), hafta verilerini yeniden yükle
        await loadWeekData(weekMonday, currentSettings);
    }
  };

  // Cache'i invalidate et (worklog eklendiğinde/güncellendiğinde)
  const invalidateCache = (date: string) => {
    worklogCacheRef.current.delete(date);
    // Ayrıca hafta cache'ini de temizle - o haftayı yeniden load etmeye zorla
    weekWorklogsCacheRef.current.delete(date);
    // Eğer hafta cache'i boşaldıysa veya tarih haftaya ait ise, mondayRef'i sıfırla
    const weekMonday = getWeekMonday(date);
    if (weekCacheMondayRef.current === weekMonday) {
      weekCacheMondayRef.current = null; // Hafta cache'ini invalidate et
    }
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

  const handleUpdateWorklog = async (id: string, comment?: string, seconds?: number, skipNotification?: boolean, isUndoRedo?: boolean) => {
    const wl = worklogs.find(w => w.id === id);
    if (!wl) return;

    const previousComment = wl.comment;
    const previousSeconds = wl.seconds;

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
      
      // Undo/Redo işlemlerinde bildirim gösterme
      if (isUndoRedo) return;
      
      // Skip notification if called from batch operations
      if (skipNotification) return;
      
      // Create diff and undo action for manual edits
      if (comment !== undefined && comment !== previousComment) {
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
      
      // Invalidate cache
      invalidateCache(selectedDate);
    } catch (e: any) {
      notify('Güncelleme Başarısız', e.message, 'error');
      loadData(); // Revert
    }
  };

  // Delete worklog
  const handleDeleteWorklog = async (id: string) => {
    const wl = worklogs.find(w => w.id === id);
    if (!wl) return;
    
    try {
      await deleteWorklog(wl.issueKey, id, settings);
      
      // Remove from local state
      setWorklogs(prev => prev.filter(w => w.id !== id));
      
      // Invalidate cache
      invalidateCache(selectedDate);
      
      notify('Silindi', `${wl.issueKey} worklog'u başarıyla silindi`, 'success');
    } catch (e: any) {
      notify('Silme Başarısız', e.message, 'error');
    }
  };

  // Clean AI output - remove quotes and unwanted formatting
  const cleanAIOutput = (text: string, isSpellMode: boolean = false): string => {
    let cleaned = text.trim();
    
    // SPELL modu için daha agresif temizlik
    if (isSpellMode) {
        // Markdown yıldızlarını kaldır (**text** -> text)
        cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
        cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
        cleaned = cleaned.replace(/__(.+?)__/g, '$1');
        cleaned = cleaned.replace(/_(.+?)_/g, '$1');
        
        // Herhangi bir "prefix:" içeren satırları kaldır (Düzeltilmiş:, ÖNCEKİ:, YENİ: vs)
        // Ama paragrafın ortasında varsa sakla
        const lines = cleaned.split('\n');
        cleaned = lines.filter(line => {
            const trimmed = line.trim();
            // Eğer satır SADECE "Şey:" gibi bir prefix ise, kaldır
            if (/^(Düzeltilmi[şs]|Düzeltme|Output|Çıktı|Result|ÖNCEKİ|YENİ|BEFORE|AFTER|Original|Fixed|Corrected|Spell|Check|Note|Info|Cevap|Answer|Sonuç|Original|Modified|Changed)[:|]?\s*$/i.test(trimmed)) {
                return false;
            }
            return true;
        }).join('\n');
        
        // Boş satırları temizle
        cleaned = cleaned.replace(/\n\n+/g, '\n').trim();
    } else {
        // IMPROVE modu için hafif temizlik
        cleaned = cleaned.replace(/^["'"'""'']+|["'"'""'']+$/g, '');
        cleaned = cleaned.replace(/^[#*_`]+|[#*_`]+$/g, '');
        cleaned = cleaned.replace(/^(Düzeltilmi[şs]:?|Düzeltme:?|Output:?|Çıktı:?|Result:?)\s*/i, '');
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
            prompt = `Worklog notunu profesyonelleştir ve genişlet.

Talep: ${wl.summary}
Mevcut not: ${wl.comment}

GÖREV:
- Mevcut notu 2-3 cümleye genişlet (150-250 karakter)
- Talep başlığındaki konuyu kullanarak bağlam ekle
- Her eylemi biraz daha açıklayıcı yaz
- Doğal Türkçe kullan

ÖRNEK:
Giriş: "Hata düzeltildi"
Çıkış: "Bildirilen hata incelendi ve kaynağı tespit edildi. Gerekli düzeltmeler yapılarak sorun giderildi."

YASAK:
- "Gerçekleştirildi", "sağlandı", "optimize edildi", "başarıyla tamamlandı" klişeleri
- Metinde olmayan teknik terimler (SQL, API, modül adı)
- Tırnak, emoji, madde işareti

Genişletilmiş not:`;
            maxTokensForMode = 1000;
        } else {
            // SPELL modu: Ultra temiz prompt - sadece metni düzelt
            maxTokensForMode = Math.max(wl.comment.length * 2, 800);
            prompt = `Yazım ve noktalama hatalarını düzelt:\n\n${wl.comment}`;
        }

        const originalComment = wl.comment;
        const rawResponse = await callGroq(prompt, settings, maxTokensForMode);
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
        } else if (improvedText) {
            // Metin var ama çok benzer - yine de uygula
            await handleUpdateWorklog(id, improvedText, undefined, true);
            notify('Güncellendi', `${wl.issueKey} metni güncellendi`, 'success');
        } else {
            notify('Hata', 'AI yanıt veremedi, tekrar deneyin.', 'error');
        }

    } catch (e: any) {
        notify('AI Başarısız', e.message, 'error');
    }
  };

  // Batch AI Preview - Tüm worklog'ları önizleme ile göster
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
        const previews: TextChangePreview[] = [];
        
        for (const wl of worklogsWithComments) {
            let prompt = '';
            if (mode === 'IMPROVE') {
                prompt = `Worklog notunu profesyonelleştir ve genişlet.

Talep: ${wl.summary}
Mevcut not: ${wl.comment}

GÖREV:
- Mevcut notu 2-3 cümleye genişlet (150-250 karakter)
- Talep başlığındaki konuyu kullanarak bağlam ekle
- Her eylemi biraz daha açıklayıcı yaz
- Doğal Türkçe kullan

ÖRNEK:
Giriş: "Hata düzeltildi"
Çıkış: "Bildirilen hata incelendi ve kaynağı tespit edildi. Gerekli düzeltmeler yapılarak sorun giderildi."

YASAK:
- "Gerçekleştirildi", "sağlandı", "optimize edildi", "başarıyla tamamlandı" klişeleri
- Metinde olmayan teknik terimler (SQL, API, modül adı)
- Tırnak, emoji, madde işareti

Genişletilmiş not:`;
            } else {
                // SPELL modu: Ultra temiz prompt - sadece metni düzelt
                prompt = `Yazım ve noktalama hatalarını düzelt:\n\n${wl.comment}`;
            }

            // SPELL modu: orijinal metin kadar token al (uzun metinler için yeterli)
            const maxTokensForMode = mode === 'IMPROVE' ? 1000 : Math.max(wl.comment.length * 2, 800);
            const rawResponse = await callGroq(prompt, settings, maxTokensForMode);
            const improvedText = cleanAIOutput(rawResponse || '', mode === 'SPELL');
            
            // Normalize edip karşılaştır - küçük farkları da kabul et
            const normalizeText = (t: string) => t.toLowerCase().replace(/[^a-zçğıöşü0-9]/gi, '');
            const isDifferent = improvedText && normalizeText(improvedText) !== normalizeText(wl.comment);
            
            if (improvedText && isDifferent) {
                previews.push({
                    worklogId: wl.id,
                    issueKey: wl.issueKey,
                    summary: wl.summary,
                    before: wl.comment,
                    after: improvedText,
                    mode
                });
            } else if (improvedText) {
                // Metin var ama çok benzer - yine de ekle
                previews.push({
                    worklogId: wl.id,
                    issueKey: wl.issueKey,
                    summary: wl.summary,
                    before: wl.comment,
                    after: improvedText,
                    mode
                });
            }
        }
        
        if (previews.length === 0) {
            notify('Hata', 'AI yanıt veremedi, tekrar deneyin.', 'error');
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
        
        for (const preview of textChangePreview) {
            await handleUpdateWorklog(preview.worklogId, preview.after, undefined, true);
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
            `${textChangePreview.length} worklog ${modeLabel.toLowerCase()} uygulandı.`, 
            'success',
            batchUndoAction
        );
        
        setTextChangePreview(null);
        setTextChangeMode(null);
        
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
     
     if (remaining <= 0) {
         notify('Hedef Tamam', `Mevcut toplam (${currentTotal.toFixed(2)}h) zaten hedefe (${target}h) ulaşmış veya aşmış!`, 'info');
         return;
     }

     if (!settings.groqApiKey) {
         notify('AI Hatası', 'Akıllı dağıtım için Groq API Anahtarı gerekli', 'error');
         setIsSettingsOpen(true);
         return;
     }

     setIsDistributing(true);
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
Sen bir iş süresi tahmin uzmanısın. Aşağıdaki worklog kayıtlarına EKLENECEK saatleri belirle.

MEVCUT DURUM:
- Toplam mevcut süre: ${currentTotal.toFixed(2)} saat
- Hedef: ${target} saat
- DAĞITILACAK EK SÜRE: ${remaining.toFixed(2)} saat

WORKLOG KAYITLARI:
${worklogData.map((w, i) => `${i + 1}. ${w.key}: "${w.summary}" - Yorum: "${w.comment}" (Mevcut: ${w.currentHours}h)`).join('\n')}

KURALLAR:
- Toplam ek süre tam olarak ${remaining.toFixed(2)} saat olmalı
- Her log'a eklenecek süre minimum 0 olabilir (bazı loglara hiç eklenmeyebilir)
- İşin karmaşıklığına, yorumdaki detaylara göre dağıt
- Daha detaylı/uzun yorumlar, daha karmaşık işler daha fazla ek süre alabilir
- Basit, kısa işler daha az ek süre alabilir

ÇIKTI FORMAT (sadece JSON, başka bir şey yazma):
Her index için EKLENECEK saat miktarını ver (mevcut değil, EK miktar)
[${worklogData.map((_, i) => `{"index": ${i}, "addHours": X.XX}`).join(', ')}]

Örnek: 2 saat dağıtılacaksa ve 3 log varsa: [{"index": 0, "addHours": 0.75}, {"index": 1, "addHours": 1.0}, {"index": 2, "addHours": 0.25}]
`;

         const response = await callGroq(prompt, settings, 500);
         
         // Parse AI response
         let distribution: { index: number; addHours: number }[];
         try {
             // Extract JSON from response
             const jsonMatch = response.match(/\[[\s\S]*\]/);
             if (!jsonMatch) throw new Error('JSON bulunamadı');
             distribution = JSON.parse(jsonMatch[0]);
         } catch (parseErr) {
             notify('AI Yanıt Hatası', 'Yapay zeka yanıtı işlenemedi.', 'error');
             setIsDistributing(false);
             return;
         }

         // Validate and adjust - AI'ın önerdiği ek saatlerin toplamı 'remaining' olmalı
         const totalAIAddHours = distribution.reduce((sum, d) => sum + (d.addHours || 0), 0);
         const ratio = totalAIAddHours > 0 ? remaining / totalAIAddHours : 1;
         
         // Create preview - mevcut saat + AI'ın önerdiği ek saat
         const previewItems = worklogs.map((wl, index) => {
             const aiAddHours = distribution.find(d => d.index === index)?.addHours || (remaining / worklogs.length);
             const adjustedAddHours = Math.max(0, Math.round(aiAddHours * ratio * 100) / 100);
             return {
                 issueKey: wl.issueKey,
                 summary: wl.summary,
                 currentHours: wl.hours,
                 newHours: Math.round((wl.hours + adjustedAddHours) * 100) / 100
             };
         });
         
         // Adjust last item to match exact target
         const previewTotal = previewItems.reduce((sum, item) => sum + item.newHours, 0);
         if (Math.abs(previewTotal - target) > 0.01 && previewItems.length > 0) {
             previewItems[previewItems.length - 1].newHours = Math.round((previewItems[previewItems.length - 1].newHours + (target - previewTotal)) * 100) / 100;
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
     
     if (remaining <= 0) {
         notify('Hedef Tamam', `Mevcut toplam (${currentTotal.toFixed(2)}h) zaten hedefe (${target}h) ulaşmış veya aşmış!`, 'info');
         return;
     }
     
     // Kalan saati eşit dağıt: her log'a +remaining/count saat
     const addPerLog = remaining / worklogs.length;
     
     const previewItems = worklogs.map(wl => ({
         issueKey: wl.issueKey,
         summary: wl.summary,
         currentHours: wl.hours,
         newHours: Math.round((wl.hours + addPerLog) * 100) / 100
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
         await loadData();
         
         // Notify with undo
         const undoAction: UndoAction = {
             type: 'BATCH_UPDATE',
             data: undoData
         };
         
         const modeLabel = distributionPreview.mode === 'ai' ? 'AI Akıllı' : 'Eşit';
         notify('Dağıtım Tamamlandı', `Süreler ${modeLabel} dağıtım ile ${distributionPreview.targetHours}h hedefe ayarlandı.`, 'success', undoAction);
         
         setDistributionPreview(null);
     } catch (e: any) {
         notify('Dağıtım Hatası', e.message, 'error');
     } finally {
         setIsDistributing(false);
     }
  };

  const handleDistribute = async (mode: 'equal' | 'proportional' = 'proportional') => {
     if (loadingState === LoadingState.LOADING) return;
     
     const target = settings.targetDailyHours;
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

  // Confetti component
  const ConfettiEffect = () => {
    if (!showConfetti) return null;
    
    const colors = ['#4285f4', '#34a853', '#fbbc04', '#ea4335', '#9c27b0', '#00bcd4'];
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

  // Weekly Chart Component
  const WeeklyChart = () => {
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
    
    return (
      <section className="surface-card p-5" aria-label="Weekly overview">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-on-surface-variant)' }}>
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
            
            return (
              <div key={day.date} className="flex flex-col items-center flex-1 gap-1">
                <div 
                  className="w-full relative group cursor-pointer"
                  style={{ height: '80px' }}
                  onClick={() => setSelectedDate(day.date)}
                >
                  {/* Target line */}
                  <div 
                    className="absolute w-full border-t border-dashed"
                    style={{ 
                      bottom: `${(settings.targetDailyHours / maxHours) * 100}%`,
                      borderColor: 'var(--color-warning)',
                      opacity: 0.5
                    }}
                  />
                  {/* Bar */}
                  <div 
                    className={`chart-bar absolute bottom-0 w-full ${settings.isDarkTheme && metTarget ? 'glow-success' : ''}`}
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
        </div>
      </section>
    );
  };

  return (
    <main ref={mainRef} className="min-h-screen py-6 px-4 md:py-10 md:px-6 animate-fade-in">
      
      {/* Pull to Refresh Indicator */}
      <div 
        className={`pull-indicator ${isPulling ? 'visible' : ''} ${loadingState === LoadingState.LOADING ? 'refreshing' : ''}`}
        style={{ transform: `translateX(-50%) translateY(${pullProgress * 60 - 60}px)` }}
      >
        <RefreshCw size={16} className="pull-icon" />
        {loadingState === LoadingState.LOADING ? 'Yenileniyor...' : 'Yenilemek için bırak'}
      </div>
      
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="offline-indicator">
          <span className="offline-dot" />
          Çevrimdışı
        </div>
      )}
      
      {/* Confetti Effect */}
      <ConfettiEffect />
      
      {/* Main Container - Clean Google-style layout */}
      <div className="w-full max-w-5xl mx-auto space-y-6">
        
        {/* Header - Apple Glassmorphism */}
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
                    onClick={() => {
                        const newDarkTheme = !settings.isDarkTheme;
                        setSettings(s => ({...s, isDarkTheme: newDarkTheme}));
                        localStorage.setItem(`${APP_NAME}_isDarkTheme`, String(newDarkTheme));
                    }} 
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
                                    const isWeekend = i >= 5;
                                    
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
                        onClick={() => loadData(settings, true)} 
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
                <WeeklyChart />
            </aside>

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
                        onUpdate={handleUpdateWorklog}
                        onImprove={(id) => handleAIAction(id, 'IMPROVE')}
                        onSpellCheck={(id) => handleAIAction(id, 'SPELL')}
                        jiraBaseUrl={settings.jiraUrl}
                        worklogHistories={worklogHistories}
                        onHistoryChange={handleWorklogHistoryChange}
                        onDelete={handleDeleteWorklog}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setDistributionPreview(null)}>
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
                                             ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
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
                                    className="p-3 rounded-xl border"
                                    style={{ 
                                        backgroundColor: 'var(--color-surface-variant)',
                                        borderColor: 'var(--color-outline-variant)'
                                    }}
                                >
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
                            onClick={() => setDistributionPreview(null)} 
                            className="btn-text"
                        >
                            İptal
                        </button>
                        <button 
                            onClick={applyDistribution}
                            className="btn-filled ripple"
                            disabled={isDistributing}
                            style={distributionPreview.mode === 'ai' ? { 
                                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
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
                                             ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                                             : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
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
                                                      style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
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
                                                                color: '#dc2626',
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
                                                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' }}>
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
                                                                color: '#16a34a',
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
                                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                                } : {
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
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
            background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)', 
            color: 'white',
            borderRadius: 'var(--radius-full)',
            padding: '0.5rem 1rem',
            boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)'
          }}
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
        <button 
          onClick={() => {
            if ('vibrate' in navigator) navigator.vibrate(5);
            loadData(settings, true);
          }}
          className={`bottom-nav-item haptic-feedback ${loadingState === LoadingState.LOADING ? 'active' : ''}`}
        >
          <RefreshCw size={22} strokeWidth={1.5} className={loadingState === LoadingState.LOADING ? 'animate-spin' : ''} />
          <span>Yenile</span>
        </button>
        <button 
          onClick={() => {
            if ('vibrate' in navigator) navigator.vibrate(5);
            setIsSettingsOpen(true);
          }}
          className="bottom-nav-item haptic-feedback"
        >
          <Settings size={22} strokeWidth={1.5} />
          <span>Ayarlar</span>
        </button>
      </nav>

      {/* Apple-style Footer */}
      <footer className="apple-footer hidden lg:block">
        <span className="footer-text">
          Powered by <span className="footer-author">İlkay Turna</span>
        </span>
      </footer>

    </main>
  );
}
