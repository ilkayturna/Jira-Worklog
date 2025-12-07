import { useState, useEffect, useCallback } from 'react';
import { AppSettings, Worklog } from '../types';
import { createWorklog, updateWorklog, deleteWorklog } from '../services/api';

const QUEUE_KEY = 'WorklogPro_offlineQueue';

export type QueueItem = 
  | { id: string; type: 'CREATE'; data: { issueKey: string; date: string; seconds: number; comment: string }; timestamp: number }
  | { id: string; type: 'UPDATE'; data: { worklog: Worklog; comment?: string; seconds?: number }; timestamp: number }
  | { id: string; type: 'DELETE'; data: { issueKey: string; worklogId: string }; timestamp: number };

export const useOfflineQueue = (settings: AppSettings, notify: (title: string, msg: string, type: any) => void) => {
    const [queue, setQueue] = useState<QueueItem[]>(() => {
        try {
            const saved = localStorage.getItem(QUEUE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }, [queue]);

    const addToQueue = useCallback((item: Omit<QueueItem, 'id' | 'timestamp'>) => {
        const newItem = {
            ...item,
            id: Math.random().toString(36).substring(7),
            timestamp: Date.now()
        } as QueueItem;
        
        setQueue(prev => [...prev, newItem]);
        return newItem;
    }, []);

    const processQueue = useCallback(async () => {
        if (queue.length === 0 || isSyncing || !navigator.onLine) return;
        
        setIsSyncing(true);
        const currentQueue = [...queue];
        const remainingQueue: QueueItem[] = [];
        let successCount = 0;

        notify('Senkronizasyon', 'Çevrimdışı işlemler gönderiliyor...', 'info');

        for (const item of currentQueue) {
            try {
                if (item.type === 'CREATE') {
                    await createWorklog(item.data.issueKey, item.data.date, item.data.seconds, item.data.comment, settings);
                } else if (item.type === 'UPDATE') {
                    await updateWorklog(item.data.worklog, settings, item.data.comment, item.data.seconds);
                } else if (item.type === 'DELETE') {
                    await deleteWorklog(item.data.issueKey, item.data.worklogId, settings);
                }
                successCount++;
            } catch (error) {
                console.error('Sync error for item:', item, error);
                // Keep in queue if it's a network error, otherwise maybe discard or flag?
                // For now, keep it to retry later
                remainingQueue.push(item);
            }
        }

        setQueue(remainingQueue);
        setIsSyncing(false);

        if (successCount > 0) {
            notify('Senkronizasyon Tamamlandı', `${successCount} işlem başarıyla gönderildi.`, 'success');
        }
        if (remainingQueue.length > 0) {
            notify('Senkronizasyon Uyarısı', `${remainingQueue.length} işlem gönderilemedi, sonra tekrar denenecek.`, 'warning');
        }
    }, [queue, isSyncing, settings, notify]);

    // Auto-sync when coming online
    useEffect(() => {
        const handleOnline = () => {
            processQueue();
        };
        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [processQueue]);

    return {
        queue,
        addToQueue,
        processQueue,
        isSyncing
    };
};
