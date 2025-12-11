import { useState, useEffect, useRef, useCallback } from 'react';
import { Worklog, AppSettings, LoadingState, UndoAction } from '../types';
import { fetchWorklogs, createWorklog, updateWorklog, deleteWorklog, fetchWeekWorklogs } from '../services/api';
import { getWeekMonday, getWeekDays } from '../utils/date';
import { useOfflineQueue } from './useOfflineQueue';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const WORKLOG_CACHE_KEY = 'jira_worklog_cache';

export const useWorklogs = (settings: AppSettings, selectedDate: string, notify: (title: string, msg: string, type: any, undo?: any) => void) => {
    const [worklogs, setWorklogs] = useState<Worklog[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
    const [isLoadingWeek, setIsLoadingWeek] = useState(false);
    
    const { addToQueue, queue, processQueue, isSyncing } = useOfflineQueue(settings, notify);
    
    // Caches
    const worklogCacheRef = useRef<Map<string, { worklogs: Worklog[]; timestamp: number }>>(new Map());
    const weekWorklogsCacheRef = useRef<Map<string, Worklog[]>>(new Map());
    const weekCacheMondayRef = useRef<string | null>(null);
    const currentWeekMondayRef = useRef<string>(getWeekMonday(selectedDate));
    const initialLoadDoneRef = useRef(false);

    // Load cache from storage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(WORKLOG_CACHE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    parsed.forEach(([key, value]: [string, any]) => {
                        worklogCacheRef.current.set(key, value);
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load worklog cache', e);
        }
    }, []);

    const saveCacheToStorage = () => {
        try {
            // Prune old entries (older than 30 days) to save space
            const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
            for (const [key, value] of worklogCacheRef.current.entries()) {
                if (value.timestamp < thirtyDaysAgo) {
                    worklogCacheRef.current.delete(key);
                }
            }
            const entries = Array.from(worklogCacheRef.current.entries());
            localStorage.setItem(WORKLOG_CACHE_KEY, JSON.stringify(entries));
        } catch (e) {
            console.error('Failed to save worklog cache', e);
        }
    };

    const invalidateCache = (date: string) => {
        worklogCacheRef.current.delete(date);
        // Also invalidate week cache if needed
        weekWorklogsCacheRef.current.delete(date);
        saveCacheToStorage();
    };

    const loadData = useCallback(async (forceRefresh = false) => {
        if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
            setLoadingState(LoadingState.IDLE);
            return;
        }

        setLoadingState(LoadingState.LOADING);

        // Check cache
        // If offline, always try to use cache regardless of TTL
        if (!forceRefresh || !navigator.onLine) {
            const cached = worklogCacheRef.current.get(selectedDate);
            if (cached) {
                if (!navigator.onLine || (Date.now() - cached.timestamp) < CACHE_TTL) {
                    setWorklogs(cached.worklogs);
                    setLoadingState(LoadingState.IDLE);
                    if (!navigator.onLine) {
                        notify('Çevrimdışı Mod', 'Önbellekten veriler yüklendi.', 'info');
                    }
                    return;
                }
            }
        }

        // Clear previous worklogs to avoid stale data display while loading
        setWorklogs([]);
        
        if (!navigator.onLine) {
            setLoadingState(LoadingState.ERROR);
            notify('Çevrimdışı', 'İnternet bağlantısı yok ve önbellekte veri bulunamadı.', 'warning');
            return;
        }

        try {
            const data = await fetchWorklogs(selectedDate, settings);
            setWorklogs(data);
            worklogCacheRef.current.set(selectedDate, { worklogs: data, timestamp: Date.now() });
            saveCacheToStorage();
            
            // Update week cache for this day
            weekWorklogsCacheRef.current.set(selectedDate, data);
            
            setLoadingState(LoadingState.IDLE);
        } catch (error: any) {
            console.error(error);
            notify('Hata', error.message || 'Veriler yüklenirken hata oluştu', 'error');
            setLoadingState(LoadingState.ERROR);
        }
    }, [selectedDate, settings, notify]);

    // Load entire week data (all 7 days)
    const loadWeekData = useCallback(async (mondayDate?: string) => {
        if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) return;
        if (!navigator.onLine) return;

        const monday = mondayDate || getWeekMonday(selectedDate);
        const weekDays = getWeekDays(monday);
        
        setIsLoadingWeek(true);

        try {
            // Fetch all week data using the API
            const weekData = await fetchWeekWorklogs(monday, settings);
            
            // Update caches for all days
            weekDays.forEach((dateStr) => {
                const dayWorklogs = weekData.get(dateStr) || [];
                worklogCacheRef.current.set(dateStr, { worklogs: dayWorklogs, timestamp: Date.now() });
                weekWorklogsCacheRef.current.set(dateStr, dayWorklogs);
            });
            
            saveCacheToStorage();
            
            // Update current day worklogs if it's in this week
            if (weekDays.includes(selectedDate)) {
                const currentDayData = weekData.get(selectedDate) || [];
                setWorklogs(currentDayData);
            }
        } catch (error: any) {
            console.error('Week data load error:', error);
        } finally {
            setIsLoadingWeek(false);
        }
    }, [selectedDate, settings, notify]);

    // Initial load - load current day + entire week on first mount
    useEffect(() => {
        loadData();
        
        // Load entire week on first mount or when week changes
        if (!initialLoadDoneRef.current) {
            initialLoadDoneRef.current = true;
            loadWeekData();
        }
    }, [loadData, loadWeekData]);

    // Week change detection - reload week data when week changes
    useEffect(() => {
        if (!settings.jiraUrl) return;
        const weekMonday = getWeekMonday(selectedDate);
        if (weekCacheMondayRef.current !== null && weekCacheMondayRef.current !== weekMonday) {
            // Week changed, load new week data
            loadWeekData(weekMonday);
        }
        weekCacheMondayRef.current = weekMonday;
    }, [selectedDate, settings.jiraUrl, loadWeekData]);

    const addWorklog = async (issueKey: string, timeSpentSeconds: number, comment: string, started?: string) => {
        // Offline Check
        if (!navigator.onLine) {
            addToQueue({
                type: 'CREATE',
                data: { issueKey, date: started || selectedDate, seconds: timeSpentSeconds, comment }
            });
            notify('Çevrimdışı Kayıt', 'İnternet gelince gönderilecek.', 'info');
            
            // Optimistic UI update (fake worklog)
            const fakeWorklog: Worklog = {
                id: `temp-${Date.now()}`,
                issueKey,
                summary: 'Çevrimdışı Kayıt',
                seconds: timeSpentSeconds,
                hours: timeSpentSeconds / 3600,
                comment,
                started: started || selectedDate
            };
            setWorklogs(prev => [...prev, fakeWorklog]);
            return fakeWorklog;
        }

        try {
            setLoadingState(LoadingState.LOADING);
            const newWorklog = await createWorklog(issueKey, started || selectedDate, timeSpentSeconds, comment, settings);
            invalidateCache(selectedDate);
            await loadData(true);
            return newWorklog;
        } catch (error: any) {
            // If network error, add to queue
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                addToQueue({
                    type: 'CREATE',
                    data: { issueKey, date: started || selectedDate, seconds: timeSpentSeconds, comment }
                });
                notify('Ağ Hatası', 'Kayıt kuyruğa eklendi, sonra denenecek.', 'warning');
                return null;
            }
            
            notify('Hata', error.message || 'Worklog eklenemedi', 'error');
            setLoadingState(LoadingState.IDLE); // Reset to idle (or error)
            return null;
        }
    };

    const editWorklog = async (worklog: Worklog, newComment: string, newSeconds: number, newDate?: string) => {
        // Offline Check
        if (!navigator.onLine) {
            addToQueue({
                type: 'UPDATE',
                data: { worklog, comment: newComment, seconds: newSeconds, date: newDate }
            });
            notify('Çevrimdışı Güncelleme', 'İnternet gelince güncellenecek.', 'info');
            
            // Optimistic UI update
            setWorklogs(prev => prev.map(w => w.id === worklog.id ? { ...w, comment: newComment, seconds: newSeconds, hours: newSeconds / 3600 } : w));
            return true;
        }

        try {
            setLoadingState(LoadingState.LOADING);
            await updateWorklog(worklog, settings, newComment, newSeconds, newDate);
            invalidateCache(selectedDate);
            await loadData(true);
            return true;
        } catch (error: any) {
             if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                addToQueue({
                    type: 'UPDATE',
                    data: { worklog, comment: newComment, seconds: newSeconds, date: newDate }
                });
                notify('Ağ Hatası', 'Güncelleme kuyruğa eklendi.', 'warning');
                return true; // Treat as success for UI
            }

            notify('Hata', error.message || 'Güncelleme başarısız', 'error');
            setLoadingState(LoadingState.IDLE);
            return false;
        }
    };

    const removeWorklog = async (issueKey: string, worklogId: string) => {
        // Offline Check
        if (!navigator.onLine) {
            addToQueue({
                type: 'DELETE',
                data: { issueKey, worklogId }
            });
            notify('Çevrimdışı Silme', 'İnternet gelince silinecek.', 'info');
            setWorklogs(prev => prev.filter(w => w.id !== worklogId));
            return true;
        }

        try {
            setLoadingState(LoadingState.LOADING);
            await deleteWorklog(issueKey, worklogId, settings);
            invalidateCache(selectedDate);
            await loadData(true);
            return true;
        } catch (error: any) {
             if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                addToQueue({
                    type: 'DELETE',
                    data: { issueKey, worklogId }
                });
                notify('Ağ Hatası', 'Silme işlemi kuyruğa eklendi.', 'warning');
                setWorklogs(prev => prev.filter(w => w.id !== worklogId));
                return true;
            }

            notify('Hata', error.message || 'Silme başarısız', 'error');
            setLoadingState(LoadingState.IDLE);
            return false;
        }
    };

    return {
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
        isSyncing,
        processQueue
    };
};
