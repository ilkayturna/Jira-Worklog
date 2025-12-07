import { useState, useEffect, useRef, useCallback } from 'react';
import { Worklog, AppSettings, LoadingState, UndoAction } from '../types';
import { fetchWorklogs, createWorklog, updateWorklog, deleteWorklog, fetchWeekWorklogs } from '../services/api';
import { getWeekMonday, getWeekDays } from '../utils/date';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useWorklogs = (settings: AppSettings, selectedDate: string, notify: (title: string, msg: string, type: any, undo?: any) => void) => {
    const [worklogs, setWorklogs] = useState<Worklog[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
    
    // Caches
    const worklogCacheRef = useRef<Map<string, { worklogs: Worklog[]; timestamp: number }>>(new Map());
    const weekWorklogsCacheRef = useRef<Map<string, Worklog[]>>(new Map());
    const weekCacheMondayRef = useRef<string | null>(null);
    const currentWeekMondayRef = useRef<string>(getWeekMonday(selectedDate));

    const invalidateCache = (date: string) => {
        worklogCacheRef.current.delete(date);
        // Also invalidate week cache if needed
        weekWorklogsCacheRef.current.delete(date);
    };

    const loadData = useCallback(async (forceRefresh = false) => {
        if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
            setLoadingState(LoadingState.IDLE);
            return;
        }

        setLoadingState(LoadingState.LOADING);

        // Check cache
        if (!forceRefresh) {
            const cached = worklogCacheRef.current.get(selectedDate);
            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
                setWorklogs(cached.worklogs);
                setLoadingState(LoadingState.IDLE);
                return;
            }
        }

        try {
            const data = await fetchWorklogs(selectedDate, settings);
            setWorklogs(data);
            worklogCacheRef.current.set(selectedDate, { worklogs: data, timestamp: Date.now() });
            
            // Update week cache for this day
            weekWorklogsCacheRef.current.set(selectedDate, data);
            
            setLoadingState(LoadingState.IDLE);
        } catch (error: any) {
            console.error(error);
            notify('Hata', error.message || 'Veriler yüklenirken hata oluştu', 'error');
            setLoadingState(LoadingState.ERROR);
        }
    }, [selectedDate, settings, notify]);

    // Initial load
    useEffect(() => {
        loadData();
    }, [loadData]);

    // Week data loading logic (simplified from App.tsx)
    useEffect(() => {
        if (!settings.jiraUrl) return;
        const weekMonday = getWeekMonday(selectedDate);
        if (weekCacheMondayRef.current !== weekMonday) {
            // New week, maybe clear week cache or load new week
            // For now, we just track it. App.tsx had complex logic here.
            // We'll keep it simple: loadData loads the current day.
            // If we want to load the whole week for the chart, we can do it separately.
            weekCacheMondayRef.current = weekMonday;
        }
    }, [selectedDate, settings.jiraUrl]);

    const addWorklog = async (issueKey: string, timeSpentSeconds: number, comment: string, started?: string) => {
        try {
            setLoadingState(LoadingState.LOADING);
            const newWorklog = await createWorklog(issueKey, started || selectedDate, timeSpentSeconds, comment, settings);
            invalidateCache(selectedDate);
            await loadData(true);
            return newWorklog;
        } catch (error: any) {
            notify('Hata', error.message || 'Worklog eklenemedi', 'error');
            setLoadingState(LoadingState.IDLE); // Reset to idle (or error)
            return null;
        }
    };

    const editWorklog = async (worklog: Worklog, newComment: string, newSeconds: number) => {
        try {
            setLoadingState(LoadingState.LOADING);
            await updateWorklog(worklog, settings, newComment, newSeconds);
            invalidateCache(selectedDate);
            await loadData(true);
            return true;
        } catch (error: any) {
            notify('Hata', error.message || 'Güncelleme başarısız', 'error');
            setLoadingState(LoadingState.IDLE);
            return false;
        }
    };

    const removeWorklog = async (issueKey: string, worklogId: string) => {
        try {
            setLoadingState(LoadingState.LOADING);
            await deleteWorklog(issueKey, worklogId, settings);
            invalidateCache(selectedDate);
            await loadData(true);
            return true;
        } catch (error: any) {
            notify('Hata', error.message || 'Silme başarısız', 'error');
            setLoadingState(LoadingState.IDLE);
            return false;
        }
    };

    return {
        worklogs,
        loadingState,
        loadData,
        addWorklog,
        editWorklog,
        removeWorklog,
        weekWorklogsCacheRef // Expose if needed for charts
    };
};
