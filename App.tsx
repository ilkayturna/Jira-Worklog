
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Settings, Moon, Sun, Calendar as CalendarIcon, RefreshCw, CheckCircle2, AlertCircle, Info, ChevronLeft, ChevronRight, Copy, Sparkles, Clock, Plus, Bell, History, Brain, Edit3, FileSpreadsheet, FileText } from 'lucide-react';
import { AppSettings, Worklog, LoadingState, Notification, NotificationHistoryItem, WorklogSuggestion, UndoAction, DEFAULT_SYSTEM_PROMPT, TextChangePreview, WeeklyReportItem, WorklogHistoryEntry } from './types';
import { fetchWorklogs, updateWorklog, callGroq, createWorklog, deleteWorklog, fetchIssueDetails } from './services/api';
import { SettingsModal } from './components/SettingsModal';
import { WorklogList } from './components/WorklogList';
import { AddWorklogModal } from './components/AddWorklogModal';
import { NotificationHistory } from './components/NotificationHistory';
import { WeeklyReportModal } from './components/WeeklyReportModal';
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
  const [distributeTarget, setDistributeTarget] = useState<string>(settings.targetDailyHours.toString());
  const [tempTargetHours, setTempTargetHours] = useState<string>(settings.targetDailyHours.toString());
  
  // Worklog history for undo/redo (per worklog)
  const [worklogHistories, setWorklogHistories] = useState<Map<string, { entries: WorklogHistoryEntry[]; index: number }>>(new Map());
  
  // Daily cache - aynı gün için tekrar istek atmamak için
  const worklogCacheRef = useRef<Map<string, { worklogs: Worklog[]; timestamp: number }>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 dakika cache süresi
  
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

  const loadData = async (currentSettings = settings, forceRefresh = false) => {
    if (!currentSettings.jiraUrl || !currentSettings.jiraEmail || !currentSettings.jiraToken) {
        return;
    }

    // Cache kontrolü
    const cached = worklogCacheRef.current.get(selectedDate);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        setWorklogs(cached.worklogs);
        setLoadingState(LoadingState.SUCCESS);
        return;
    }

    setLoadingState(LoadingState.LOADING);
    try {
      const data = await fetchWorklogs(selectedDate, currentSettings);
      setWorklogs(data);
      
      // Cache'e kaydet
      worklogCacheRef.current.set(selectedDate, {
        worklogs: data,
        timestamp: Date.now()
      });
      
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

  // Cache'i invalidate et (worklog eklendiğinde/güncellendiğinde)
  const invalidateCache = (date: string) => {
    worklogCacheRef.current.delete(date);
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
  const fetchWeekWorklogs = async (startDate: string, endDate: string): Promise<Worklog[]> => {
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
    } catch (e: any) {
      notify('Güncelleme Başarısız', e.message, 'error');
      loadData(); // Revert
    }
  };

  // Clean AI output - remove quotes and unwanted formatting
  const cleanAIOutput = (text: string): string => {
    let cleaned = text.trim();
    // Remove leading/trailing quotes (single, double, smart quotes)
    cleaned = cleaned.replace(/^["'"'""'']+|["'"'""'']+$/g, '');
    // Remove markdown formatting
    cleaned = cleaned.replace(/^[#*_`]+|[#*_`]+$/g, '');
    // Remove "Düzeltilmiş:", "Düzeltme:", "Output:" etc prefixes
    cleaned = cleaned.replace(/^(Düzeltilmi[şs]:?|Düzeltme:?|Output:?|Çıktı:?|Result:?)\s*/i, '');
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
        if (mode === 'IMPROVE') {
            prompt = `Sen tecrübeli bir yazılım danışmanısın. Aşağıdaki kısa worklog notunu, bir insanın yazacağı gibi doğal ve profesyonel bir şekilde genişlet.

Talep başlığı: ${wl.summary}
Mevcut not: ${wl.comment}

YAZIM REHBERİ:
- Mevcut notu temel al ve bağlamından kopmadan genişlet
- Talep başlığındaki konuyu kullanarak ne yapıldığını açıkla
- 2-3 cümle yaz (120-200 karakter)
- Doğal Türkçe kullan, bir çalışanın günlük raporu gibi yaz
- Somut fiiller kullan: incelendi, düzeltildi, kontrol edildi, eklendi, güncellendi
- Metinde geçen teknik terimleri koru

YASAK:
- "Gerçekleştirildi", "sağlandı", "optimize edildi" gibi klişeler
- Metinde olmayan özel isimler veya teknik detaylar uydurma (SQL, API, modül adı vb.)
- Tırnak işareti, madde işareti, emoji
- "Bu kapsamda", "Bu çalışmada" gibi kalıp girişler

İyileştirilmiş not:`;
        } else {
            prompt = `SADECE yazım hatalarını ve noktalama işaretlerini düzelt. Başka HİÇBİR ŞEY yapma.

KURALLAR:
- Sadece yanlış yazılmış kelimeleri düzelt
- Noktalama işaretlerini düzelt (virgül, nokta, ünlem, soru işareti)
- Hiç kelime ekleme
- Hiç kelime çıkarma  
- Hiç kelime değiştirme (sadece yazım hatası varsa düzelt)
- Metni yeniden yazma
- Başına "Düzeltilmiş:", "Düzeltme:" gibi hiçbir şey ekleme
- Sonuna hiçbir şey ekleme
- Metnin başına veya sonuna tırnak işareti KOYMA
- Sadece düzeltilmiş metni döndür, başka hiçbir şey yazma

METİN:
${wl.comment}

ÇIKTI (sadece düzeltilmiş metin):`;
        }

        const originalComment = wl.comment;
        const rawResponse = await callGroq(prompt, settings);
        const improvedText = cleanAIOutput(rawResponse || '');
        
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
                prompt = `Sen tecrübeli bir yazılım danışmanısın. Aşağıdaki kısa worklog notunu, bir insanın yazacağı gibi doğal ve profesyonel bir şekilde genişlet.

Talep başlığı: ${wl.summary}
Mevcut not: ${wl.comment}

YAZIM REHBERİ:
- Mevcut notu temel al ve bağlamından kopmadan genişlet
- Talep başlığındaki konuyu kullanarak ne yapıldığını açıkla
- 2-3 cümle yaz (120-200 karakter)
- Doğal Türkçe kullan, bir çalışanın günlük raporu gibi yaz
- Somut fiiller kullan: incelendi, düzeltildi, kontrol edildi, eklendi, güncellendi
- Metinde geçen teknik terimleri koru

YASAK:
- "Gerçekleştirildi", "sağlandı", "optimize edildi" gibi klişeler
- Metinde olmayan özel isimler veya teknik detaylar uydurma (SQL, API, modül adı vb.)
- Tırnak işareti, madde işareti, emoji
- "Bu kapsamda", "Bu çalışmada" gibi kalıp girişler

İyileştirilmiş not:`;
            } else {
                prompt = `SADECE yazım hatalarını ve noktalama işaretlerini düzelt. Başka HİÇBİR ŞEY yapma.

KURALLAR:
- Sadece yanlış yazılmış kelimeleri düzelt
- Noktalama işaretlerini düzelt (virgül, nokta, ünlem, soru işareti)
- Hiç kelime ekleme
- Hiç kelime çıkarma
- Hiç kelime değiştirme (sadece yazım hatası varsa düzelt)
- Metni yeniden yazma
- Başına "Düzeltilmiş:", "Düzeltme:" gibi hiçbir şey ekleme
- Sonuna hiçbir şey ekleme
- Metnin başına veya sonuna tırnak işareti KOYMA
- Sadece düzeltilmiş metni döndür, başka hiçbir şey yazma

METİN:
${wl.comment}

ÇIKTI (sadece düzeltilmiş metin):`;
            }

            const rawResponse = await callGroq(prompt, settings);
            const improvedText = cleanAIOutput(rawResponse || '');
            
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
     
     const target = parseFloat(distributeTarget) || settings.targetDailyHours;
     
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
     const target = parseFloat(distributeTarget) || settings.targetDailyHours;
     
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
                    
                    {/* Week Days Quick Navigation */}
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex gap-1">
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
                                            className={`flex-1 py-2 px-1 rounded-lg text-center transition-all ${isSelected ? 'scale-105' : 'hover:scale-102'}`}
                                            style={{
                                                backgroundColor: isSelected 
                                                    ? 'var(--color-primary-600)' 
                                                    : isToday 
                                                        ? (settings.isDarkTheme ? 'rgba(66, 133, 244, 0.3)' : 'var(--color-primary-100)')
                                                        : 'transparent',
                                                color: isSelected 
                                                    ? 'white' 
                                                    : isToday
                                                        ? (settings.isDarkTheme ? '#93c5fd' : 'var(--color-primary-700)')
                                                        : isWeekend 
                                                            ? 'var(--color-text-tertiary)' 
                                                            : 'var(--color-text-primary)',
                                                fontWeight: isSelected || isToday ? 600 : 400
                                            }}
                                        >
                                            <div className="text-xs opacity-70">{days[i]}</div>
                                            <div className="text-sm font-medium">{day.getDate()}</div>
                                            {isToday && !isSelected && (
                                                <div className="w-1.5 h-1.5 rounded-full mx-auto mt-0.5" style={{ backgroundColor: 'var(--color-primary-500)' }} />
                                            )}
                                        </button>
                                    );
                                }
                                
                                return weekDays;
                            })()}
                        </div>
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
                        <div className="space-y-2">
                            <button 
                                onClick={previewEqualDistribute} 
                                className="btn-filled ripple text-sm w-full"
                                style={{ 
                                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                    color: 'white',
                                    opacity: isDistributing ? 0.7 : 1
                                }}
                                title="Tüm worklog'lara eşit süre dağıtır"
                                disabled={isDistributing}
                            >
                                <Clock size={16} /> Eşit Dağıtım
                            </button>
                            
                            {/* AI Smart Distribution */}
                            <button 
                                onClick={previewSmartDistribute}
                                className="btn-filled w-full ripple text-sm"
                                style={{ 
                                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                                }}
                                title="Yapay zeka worklog içeriklerini analiz ederek akıllı dağıtım yapar"
                                disabled={isDistributing}
                            >
                                {isDistributing ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" /> Analiz Ediliyor...
                                    </>
                                ) : (
                                    <>
                                        <Brain size={16} /> AI Akıllı Dağıtım
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {/* AI Text Operations */}
                    <div className="pt-4 border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
                        <label className="text-xs font-semibold uppercase tracking-wider block mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
                            Toplu AI İşlemleri
                        </label>
                        <div className="space-y-2">
                            <button 
                                onClick={() => previewBatchAI('SPELL')}
                                className="btn-outlined w-full ripple text-sm"
                                style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
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
                        jiraBaseUrl={settings.jiraUrl}
                        worklogHistories={worklogHistories}
                        onHistoryChange={handleWorklogHistoryChange}
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
        onFetchWeekWorklogs={fetchWeekWorklogs}
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
                                        {/* Before - Kırmızı */}
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
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap" 
                                               style={{ 
                                                   color: 'var(--color-on-surface)',
                                                   textDecoration: 'line-through',
                                                   textDecorationColor: 'rgba(239, 68, 68, 0.5)'
                                               }}>
                                                {item.before}
                                            </p>
                                        </div>
                                        
                                        {/* After - Yeşil */}
                                        <div className="p-4" style={{ backgroundColor: 'rgba(34, 197, 94, 0.08)' }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded" 
                                                      style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' }}>
                                                    YENİ
                                                </span>
                                            </div>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-on-surface)' }}>
                                                {item.after}
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
