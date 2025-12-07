import { WorklogSuggestion, WorklogHistoryEntry, NotificationHistoryItem } from '../types';
import { SUGGESTIONS_KEY, WORKLOG_HISTORY_KEY, NOTIFICATION_HISTORY_KEY } from '../constants';

// Load suggestions from localStorage
export const loadSuggestions = (): WorklogSuggestion[] => {
    try {
        const saved = localStorage.getItem(SUGGESTIONS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
};

// Load worklog histories from localStorage
export const loadWorklogHistories = (): Map<string, { entries: WorklogHistoryEntry[]; index: number }> => {
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
export const saveWorklogHistories = (histories: Map<string, { entries: WorklogHistoryEntry[]; index: number }>) => {
    try {
        const obj = Object.fromEntries(histories);
        localStorage.setItem(WORKLOG_HISTORY_KEY, JSON.stringify(obj));
    } catch {
        // Ignore storage errors
    }
};

// Save notification history to localStorage
export const saveNotificationHistory = (history: NotificationHistoryItem[]) => {
    localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
};

// Save suggestions to localStorage
export const saveSuggestions = (suggestions: WorklogSuggestion[]) => {
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(suggestions.slice(0, 50))); // Keep max 50
};

// Update suggestions when a worklog is created - with min/max tracking
export const updateSuggestions = (issueKey: string, summary: string, comment: string, hours: number) => {
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
