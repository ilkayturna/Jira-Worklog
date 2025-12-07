import { useState, useCallback, useEffect } from 'react';
import { Notification, NotificationHistoryItem, UndoAction } from '../types';
import { NOTIFICATION_HISTORY_KEY } from '../constants';

const loadNotificationHistory = (): NotificationHistoryItem[] => {
    try {
        const saved = localStorage.getItem(NOTIFICATION_HISTORY_KEY);
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return parsed.filter((n: NotificationHistoryItem) => n.timestamp > sevenDaysAgo);
    } catch {
        return [];
    }
};

export const useNotifications = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>(loadNotificationHistory());

    useEffect(() => {
        localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(notificationHistory.slice(0, 100)));
    }, [notificationHistory]);

    const notify = useCallback((title: string, message: string, type: Notification['type'] = 'info', undoAction?: UndoAction, diff?: { before: string; after: string; issueKey?: string }) => {
        const id = Math.random().toString(36).substring(7);
        const notification: NotificationHistoryItem = {
            id,
            title,
            message,
            type,
            timestamp: Date.now(),
            undoAction,
            diff
        };
        
        setNotifications(prev => [...prev, notification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
        
        setNotificationHistory(prev => [notification, ...prev].slice(0, 100));
    }, []);

    const clearNotificationHistory = useCallback(() => {
        setNotificationHistory([]);
    }, []);

    const deleteNotification = useCallback((id: string) => {
        setNotificationHistory(prev => prev.filter(n => n.id !== id));
    }, []);

    return {
        notifications,
        notificationHistory,
        setNotificationHistory,
        notify,
        clearNotificationHistory,
        deleteNotification
    };
};
