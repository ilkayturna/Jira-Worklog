import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Worklog, AppSettings, LoadingState } from '../types';
import { fetchWorklogs, createWorklog, updateWorklog, deleteWorklog, fetchWeekWorklogs } from '../services/api';
import { getWeekMonday, getWeekDays } from '../utils/date';
import { useOfflineQueue } from './useOfflineQueue';

// Constants
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const WORKLOG_CACHE_KEY = 'jira_worklog_cache';
const MAX_CACHE_ENTRIES = 90; // 3 months of daily data
const CACHE_CLEANUP_DAYS = 30;

// Type-safe cache entry
interface CacheEntry {
  worklogs: Worklog[];
  timestamp: number;
}

// Validation helpers
const isValidDate = (dateStr: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date.getTime());
};

const sanitizeWorklogInput = (text: string): string => {
  // Prevent XSS: Remove potentially dangerous characters
  return text.trim().replace(/[<>"']/g, '');
};

export const useWorklogs = (
  settings: AppSettings, 
  selectedDate: string, 
  notify: (title: string, msg: string, type: 'success' | 'error' | 'warning' | 'info', undo?: any) => void
) => {
    // State management with proper typing
    const [worklogs, setWorklogs] = useState<Worklog[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
    const [isLoadingWeek, setIsLoadingWeek] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);
    
    const { addToQueue, queue, processQueue, isSyncing } = useOfflineQueue(settings, notify);
    
    // Refs for cache and control flow (prevent memory leaks)
    const worklogCacheRef = useRef<Map<string, CacheEntry>>(new Map());
    const weekWorklogsCacheRef = useRef<Map<string, Worklog[]>>(new Map());
    const weekCacheMondayRef = useRef<string | null>(null);
    const currentWeekMondayRef = useRef<string>(getWeekMonday(selectedDate));
    const initialLoadDoneRef = useRef<boolean>(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isMountedRef = useRef<boolean>(true);

    // Component lifecycle tracking (prevent state updates after unmount)
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            // Cancel any pending requests
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // Load and validate cache from storage on mount
    useEffect(() => {
        const loadCacheFromStorage = () => {
            try {
                const saved = localStorage.getItem(WORKLOG_CACHE_KEY);
                if (!saved) return;

                const parsed = JSON.parse(saved);
                if (!Array.isArray(parsed)) {
                    console.warn('Invalid cache format, clearing...');
                    localStorage.removeItem(WORKLOG_CACHE_KEY);
                    return;
                }

                let validEntries = 0;
                parsed.forEach(([key, value]: [string, CacheEntry]) => {
                    // Validate cache entry structure
                    if (isValidDate(key) && 
                        value && 
                        typeof value === 'object' &&
                        Array.isArray(value.worklogs) && 
                        typeof value.timestamp === 'number') {
                        worklogCacheRef.current.set(key, value);
                        validEntries++;
                    }
                });

                if (validEntries > 0) {
                    console.log(`✅ Loaded ${validEntries} cache entries`);
                }
            } catch (error) {
                console.error('❌ Cache load error:', error);
                // Clear corrupted cache
                localStorage.removeItem(WORKLOG_CACHE_KEY);
            }
        };

        loadCacheFromStorage();
    }, []);

    const saveCacheToStorage = useCallback(() => {
        try {
            const now = Date.now();
            const cleanupThreshold = now - (CACHE_CLEANUP_DAYS * 24 * 60 * 60 * 1000);
            
            // Prune old entries and enforce size limit
            const entries = Array.from(worklogCacheRef.current.entries())
                .filter(([_, value]) => value.timestamp > cleanupThreshold)
                .sort(([, a], [, b]) => b.timestamp - a.timestamp)
                .slice(0, MAX_CACHE_ENTRIES);

            // Update in-memory cache
            worklogCacheRef.current = new Map(entries);

            // Save to localStorage with quota check
            const serialized = JSON.stringify(entries);
            localStorage.setItem(WORKLOG_CACHE_KEY, serialized);

            console.log(`💾 Cache saved: ${entries.length} entries, ${(serialized.length / 1024).toFixed(2)}KB`);
        } catch (error: any) {
            // Handle QuotaExceededError
            if (error.name === 'QuotaExceededError') {
                console.error('❌ Storage quota exceeded, clearing old cache');
                worklogCacheRef.current.clear();
                localStorage.removeItem(WORKLOG_CACHE_KEY);
            } else {
                console.error('❌ Cache save error:', error);
            }
        }
    }, []);

    const invalidateCache = useCallback((date: string) => {
        if (!isValidDate(date)) {
            console.warn(`⚠️ Invalid date for cache invalidation: ${date}`);
            return;
        }

        worklogCacheRef.current.delete(date);
        weekWorklogsCacheRef.current.delete(date);
        
        // Also invalidate related week data
        const weekMonday = getWeekMonday(date);
        if (weekCacheMondayRef.current === weekMonday) {
            weekCacheMondayRef.current = null;
        }

        saveCacheToStorage();
        console.log(`🗑️ Cache invalidated for: ${date}`);
    }, [saveCacheToStorage]);

    const loadData = useCallback(async (forceRefresh = false): Promise<void> => {
        // Input validation
        if (!isValidDate(selectedDate)) {
            console.error(`❌ Invalid date format: ${selectedDate}`);
            setError(new Error('Invalid date format'));
            return;
        }

        // Settings validation
        if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
            setLoadingState(LoadingState.IDLE);
            return;
        }

        // Cancel previous request if still running
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setLoadingState(LoadingState.LOADING);
        setError(null);

        try {
            // Cache strategy: offline-first or force refresh
            if (!forceRefresh || !navigator.onLine) {
                const cached = worklogCacheRef.current.get(selectedDate);
                if (cached) {
                    const isCacheFresh = (Date.now() - cached.timestamp) < CACHE_TTL;
                    
                    if (!navigator.onLine || isCacheFresh) {
                        if (isMountedRef.current) {
                            setWorklogs(cached.worklogs);
                            setLoadingState(LoadingState.IDLE);
                        }
                        
                        if (!navigator.onLine) {
                            notify('🚫 Çevrimdışı Mod', 'Önbellekten veriler yüklendi.', 'info');
                        }
                        return;
                    }
                }
            }

            // Network check
            if (!navigator.onLine) {
                setLoadingState(LoadingState.ERROR);
                const errorMsg = 'İnternet bağlantısı yok ve önbellekte veri bulunamadı.';
                setError(new Error(errorMsg));
                notify('❌ Çevrimdışı', errorMsg, 'warning');
                return;
            }

            // Clear stale data
            if (isMountedRef.current) {
                setWorklogs([]);
            }

            // Fetch data with timeout protection
            const fetchPromise = fetchWorklogs(selectedDate, settings);
            const timeoutPromise = new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), 30000)
            );

            const data = await Promise.race([fetchPromise, timeoutPromise]);

            // Validate response
            if (!Array.isArray(data)) {
                throw new Error('Invalid response format');
            }

            // Update state only if component is still mounted
            if (isMountedRef.current) {
                setWorklogs(data);
                setLoadingState(LoadingState.IDLE);

                // Update caches
                worklogCacheRef.current.set(selectedDate, { 
                    worklogs: data, 
                    timestamp: Date.now() 
                });
                weekWorklogsCacheRef.current.set(selectedDate, data);
                saveCacheToStorage();

                console.log(`✅ Loaded ${data.length} worklogs for ${selectedDate}`);
            }
        } catch (error: any) {
            if (!isMountedRef.current) return;

            // Handle specific error types
            const isAbortError = error.name === 'AbortError';
            const isNetworkError = error.message?.includes('Failed to fetch') || 
                                    error.message?.includes('NetworkError');
            const isTimeoutError = error.message?.includes('timeout');

            if (isAbortError) {
                console.log('🔄 Request aborted (new request started)');
                return;
            }

            setLoadingState(LoadingState.ERROR);
            setError(error);

            let errorTitle = '❌ Hata';
            let errorMessage = error.message || 'Veriler yüklenirken hata oluştu';

            if (isNetworkError) {
                errorTitle = '🌐 Ağ Hatası';
                errorMessage = 'Jira sunucusuna bağlanılamıyor. Lütfen bağlantınızı kontrol edin.';
            } else if (isTimeoutError) {
                errorTitle = '⏱️ Zaman Aşımı';
                errorMessage = 'İstek çok uzun sürdü. Lütfen tekrar deneyin.';
            }

            notify(errorTitle, errorMessage, 'error');
            console.error('❌ loadData error:', error);
        } finally {
            abortControllerRef.current = null;
        }
    }, [selectedDate, settings, notify, saveCacheToStorage]);

    // Load entire week data with optimized parallel processing
    const loadWeekData = useCallback(async (mondayDate?: string): Promise<void> => {
        // Validation
        if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
            console.warn('⚠️ Cannot load week data: settings incomplete');
            return;
        }

        if (!navigator.onLine) {
            console.log('📵 Offline: skipping week data load');
            return;
        }

        const monday = mondayDate || getWeekMonday(selectedDate);
        if (!isValidDate(monday)) {
            console.error(`❌ Invalid Monday date: ${monday}`);
            return;
        }

        const weekDays = getWeekDays(monday);
        setIsLoadingWeek(true);

        try {
            // Check if week is already cached and fresh
            const allDaysCached = weekDays.every(day => {
                const cached = worklogCacheRef.current.get(day);
                return cached && (Date.now() - cached.timestamp) < CACHE_TTL;
            });

            if (allDaysCached && !mondayDate) {
                console.log('✅ Week data already fresh in cache');
                setIsLoadingWeek(false);
                return;
            }

            console.log(`📅 Loading week data for ${monday}...`);

            // Fetch with timeout
            const fetchPromise = fetchWeekWorklogs(monday, settings);
            const timeoutPromise = new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Week load timeout')), 45000)
            );

            const weekData = await Promise.race([fetchPromise, timeoutPromise]);

            if (!isMountedRef.current) return;

            // Atomic cache update
            let updatedDays = 0;
            weekDays.forEach((dateStr) => {
                const dayWorklogs = weekData.get(dateStr);
                if (dayWorklogs) {
                    worklogCacheRef.current.set(dateStr, { 
                        worklogs: dayWorklogs, 
                        timestamp: Date.now() 
                    });
                    weekWorklogsCacheRef.current.set(dateStr, dayWorklogs);
                    updatedDays++;
                }
            });

            saveCacheToStorage();

            // Update current day if it's in this week
            if (weekDays.includes(selectedDate)) {
                const currentDayData = weekData.get(selectedDate);
                if (currentDayData && isMountedRef.current) {
                    setWorklogs(currentDayData);
                }
            }

            console.log(`✅ Week loaded: ${updatedDays}/7 days updated`);
        } catch (error: any) {
            if (!isMountedRef.current) return;

            console.error('❌ Week data load error:', error);
            
            // Don't show error if user navigated away
            if (error.message?.includes('timeout')) {
                notify('⏱️ Zaman Aşımı', 'Haftalık veriler yüklenemedi, ancak günlük veriler kullanılabilir.', 'warning');
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoadingWeek(false);
            }
        }
    }, [selectedDate, settings, notify, saveCacheToStorage]);

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

    const addWorklog = async (
        issueKey: string, 
        timeSpentSeconds: number, 
        comment: string, 
        started?: string
    ): Promise<Worklog | null> => {
        // Input validation
        if (!issueKey?.trim()) {
            notify('❌ Geçersiz Giriş', 'Issue key boş olamaz', 'error');
            return null;
        }

        if (timeSpentSeconds <= 0 || timeSpentSeconds > 86400) { // Max 24 hours
            notify('❌ Geçersiz Süre', 'Süre 0 ile 24 saat arasında olmalı', 'error');
            return null;
        }

        // Sanitize inputs
        const sanitizedComment = sanitizeWorklogInput(comment);
        const targetDate = started || selectedDate;

        if (!isValidDate(targetDate)) {
            notify('❌ Geçersiz Tarih', 'Tarih formatı hatalı', 'error');
            return null;
        }

        // Offline handling with optimistic UI
        if (!navigator.onLine) {
            const tempWorklog: Worklog = {
                id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                issueKey: issueKey.trim().toUpperCase(),
                summary: '💾 Çevrimdışı Kaydı (Bekliyor...)',
                seconds: timeSpentSeconds,
                hours: timeSpentSeconds / 3600,
                comment: sanitizedComment,
                started: targetDate
            };

            addToQueue({
                type: 'CREATE',
                data: { 
                    issueKey: issueKey.trim(), 
                    date: targetDate, 
                    seconds: timeSpentSeconds, 
                    comment: sanitizedComment 
                }
            });

            if (isMountedRef.current) {
                setWorklogs(prev => [...prev, tempWorklog]);
            }

            notify('💾 Çevrimdışı Kayda Alındı', 'İnternet bağlantısı geldiğinde otomatik gönderilecek.', 'info');
            return tempWorklog;
        }

        try {
            setLoadingState(LoadingState.LOADING);

            const newWorklog = await createWorklog(
                issueKey.trim().toUpperCase(), 
                targetDate, 
                timeSpentSeconds, 
                sanitizedComment, 
                settings
            );

            if (!isMountedRef.current) return null;

            // Invalidate and reload
            invalidateCache(targetDate);
            await loadData(true);

            notify('✅ Başarılı', `Worklog eklendi: ${(timeSpentSeconds / 3600).toFixed(2)}h`, 'success');
            return newWorklog;
        } catch (error: any) {
            if (!isMountedRef.current) return null;

            const isNetworkError = error.message?.includes('Failed to fetch') || 
                                    error.message?.includes('NetworkError');

            if (isNetworkError) {
                // Fallback to queue on network error
                addToQueue({
                    type: 'CREATE',
                    data: { 
                        issueKey: issueKey.trim(), 
                        date: targetDate, 
                        seconds: timeSpentSeconds, 
                        comment: sanitizedComment 
                    }
                });
                notify('📡 Ağ Hatası', 'Kayda alındı, tekrar denenecek.', 'warning');
                return null;
            }

            notify('❌ Hata', error.message || 'Worklog eklenemedi', 'error');
            setLoadingState(LoadingState.IDLE);
            return null;
        }
    };

    const editWorklog = async (
        worklog: Worklog, 
        newComment: string, 
        newSeconds: number, 
        newDate?: string
    ): Promise<boolean> => {
        // Validation
        if (newSeconds <= 0 || newSeconds > 86400) {
            notify('❌ Geçersiz Süre', 'Süre 0 ile 24 saat arasında olmalı', 'error');
            return false;
        }

        // Sanitize
        const sanitizedComment = sanitizeWorklogInput(newComment);

        // Store previous state for rollback
        const previousWorklogs = [...worklogs];

        // Optimistic UI update
        if (isMountedRef.current) {
            setWorklogs(prev => prev.map(w => 
                w.id === worklog.id 
                    ? { ...w, comment: sanitizedComment, seconds: newSeconds, hours: newSeconds / 3600 }
                    : w
            ));
        }

        // Offline handling
        if (!navigator.onLine) {
            addToQueue({
                type: 'UPDATE',
                data: { worklog, comment: sanitizedComment, seconds: newSeconds, date: newDate }
            });
            notify('💾 Çevrimdışı Güncellendi', 'İnternet geldiğinde senkronize edilecek.', 'info');
            return true;
        }

        try {
            setLoadingState(LoadingState.LOADING);

            await updateWorklog(worklog, settings, sanitizedComment, newSeconds, newDate);

            if (!isMountedRef.current) return false;

            invalidateCache(newDate || selectedDate);
            await loadData(true);

            notify('✅ Güncellendi', 'Worklog başarıyla güncellendi', 'success');
            return true;
        } catch (error: any) {
            if (!isMountedRef.current) return false;

            // Rollback on error
            setWorklogs(previousWorklogs);

            const isNetworkError = error.message?.includes('Failed to fetch') || 
                                    error.message?.includes('NetworkError');

            if (isNetworkError) {
                addToQueue({
                    type: 'UPDATE',
                    data: { worklog, comment: sanitizedComment, seconds: newSeconds, date: newDate }
                });
                notify('📡 Ağ Hatası', 'Güncelleme kuyruğa eklendi.', 'warning');
                return true;
            }

            notify('❌ Hata', error.message || 'Güncelleme başarısız', 'error');
            setLoadingState(LoadingState.IDLE);
            return false;
        }
    };

    const removeWorklog = async (issueKey: string, worklogId: string): Promise<boolean> => {
        // Validation
        if (!issueKey?.trim() || !worklogId?.trim()) {
            notify('❌ Geçersiz Giriş', 'Issue key veya worklog ID eksik', 'error');
            return false;
        }

        // Store previous state for rollback
        const previousWorklogs = [...worklogs];
        const worklogToDelete = worklogs.find(w => w.id === worklogId);

        // Optimistic UI update
        if (isMountedRef.current) {
            setWorklogs(prev => prev.filter(w => w.id !== worklogId));
        }

        // Offline handling
        if (!navigator.onLine) {
            addToQueue({
                type: 'DELETE',
                data: { issueKey: issueKey.trim(), worklogId: worklogId.trim() }
            });
            notify('📦 Çevrimdışı Silme', 'İnternet geldiğinde silinecek.', 'info');
            return true;
        }

        try {
            setLoadingState(LoadingState.LOADING);

            await deleteWorklog(issueKey.trim(), worklogId.trim(), settings);

            if (!isMountedRef.current) return false;

            invalidateCache(selectedDate);
            await loadData(true);

            notify('✅ Silindi', 'Worklog başarıyla silindi', 'success');
            return true;
        } catch (error: any) {
            if (!isMountedRef.current) return false;

            // Rollback on error
            setWorklogs(previousWorklogs);

            const isNetworkError = error.message?.includes('Failed to fetch') || 
                                    error.message?.includes('NetworkError');

            if (isNetworkError) {
                addToQueue({
                    type: 'DELETE',
                    data: { issueKey: issueKey.trim(), worklogId: worklogId.trim() }
                });
                notify('📡 Ağ Hatası', 'Silme işlemi kuyruğa eklendi.', 'warning');
                // Keep UI optimistic
                setWorklogs(prev => prev.filter(w => w.id !== worklogId));
                return true;
            }

            notify('❌ Hata', error.message || 'Silme başarısız', 'error');
            setLoadingState(LoadingState.IDLE);
            return false;
        }
    };

    return {
        worklogs,
        loadingState,
        isLoadingWeek,
        error,
        loadData,
        loadWeekData,
        addWorklog,
        editWorklog,
        removeWorklog,
        weekWorklogsCacheRef,
        worklogCacheRef,
        queue,
        isSyncing,
        processQueue
    };
};
