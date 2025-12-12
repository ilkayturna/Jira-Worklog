import { useState } from 'react';
import { AppSettings, DEFAULT_SYSTEM_PROMPT } from '../types';
import { APP_NAME } from '../constants';
import { normalizeJiraBaseUrl } from '../utils/ui';

const detectJiraUrl = () => {
    const saved = localStorage.getItem(`${APP_NAME}_jiraUrl`);
    if (saved) return normalizeJiraBaseUrl(saved);
    // Auto-detect if running inside Jira
    if (window.location.hostname.includes('atlassian.net')) {
        return normalizeJiraBaseUrl(window.location.origin);
    }
    return '';
};

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

export const useSettings = () => {
    const [settings, setSettings] = useState<AppSettings>(initialSettings);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const saveSettings = (newSettings: AppSettings) => {
        const normalizedSettings: AppSettings = {
            ...newSettings,
            jiraUrl: normalizeJiraBaseUrl(newSettings.jiraUrl)
        };

        setSettings(normalizedSettings);
        // Persist
        Object.entries(normalizedSettings).forEach(([key, value]) => {
            localStorage.setItem(`${APP_NAME}_${key}`, String(value));
        });
        setIsSettingsOpen(false);
        return normalizedSettings;
    };

    const updateTargetDailyHours = (newTarget: number) => {
        const newSettings = { ...settings, targetDailyHours: newTarget };
        setSettings(newSettings);
        localStorage.setItem(`${APP_NAME}_targetDailyHours`, String(newTarget));
        return newSettings;
    };

    const toggleTheme = () => {
        const newDarkTheme = !settings.isDarkTheme;
        const newSettings = { ...settings, isDarkTheme: newDarkTheme };
        setSettings(newSettings);
        localStorage.setItem(`${APP_NAME}_isDarkTheme`, String(newDarkTheme));
        return newDarkTheme;
    };

    return {
        settings,
        setSettings,
        isSettingsOpen,
        setIsSettingsOpen,
        saveSettings,
        updateTargetDailyHours,
        toggleTheme
    };
};
