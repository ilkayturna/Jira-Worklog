import React, { useState } from 'react';
import { AppSettings, DEFAULT_SYSTEM_PROMPT } from '../types';
import { Modal } from './ui/Modal';
import { Save, RefreshCw, Globe } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave }) => {
  const [formData, setFormData] = useState<AppSettings>(settings);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleResetPrompt = () => {
      setFormData(prev => ({ ...prev, aiSystemPrompt: DEFAULT_SYSTEM_PROMPT }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings & API Configuration">
      <div className="space-y-6">
        
        {/* Jira Settings */}
        <section className="space-y-4 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-bold text-jira-blue uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-2">Jira Connection</h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Jira Instance URL</label>
              <input 
                name="jiraUrl"
                value={formData.jiraUrl}
                onChange={handleChange}
                placeholder="https://your-company.atlassian.net"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-jira-blue focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email Address</label>
              <input 
                name="jiraEmail"
                value={formData.jiraEmail}
                onChange={handleChange}
                placeholder="you@company.com"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-jira-blue focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">API Token</label>
              <input 
                name="jiraToken"
                type="password"
                value={formData.jiraToken}
                onChange={handleChange}
                placeholder="Atlassian API Token"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-jira-blue focus:border-transparent"
              />
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="text-xs text-jira-blue hover:underline mt-1 inline-block">Create API Token &rarr;</a>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Globe size={12} className="text-slate-500"/>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">CORS Proxy URL (Optional)</label>
              </div>
              <input 
                name="corsProxy"
                value={formData.corsProxy}
                onChange={handleChange}
                placeholder="e.g. https://cors-anywhere.herokuapp.com/"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-jira-blue focus:border-transparent"
              />
              <p className="text-[10px] text-slate-400 mt-1">Required for browser-based apps to access Jira API directly. Use a trusted proxy or host your own.</p>
            </div>
          </div>
        </section>

        {/* AI Settings */}
        <section className="space-y-4 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-bold text-purple-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-2">AI Configuration (Groq)</h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Groq API Key</label>
              <input 
                name="groqApiKey"
                type="password"
                value={formData.groqApiKey}
                onChange={handleChange}
                placeholder="gsk_..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-xs text-purple-500 hover:underline mt-1 inline-block">Get Groq Key &rarr;</a>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Model</label>
              <select 
                name="groqModel"
                value={formData.groqModel}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
              >
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Recommended)</option>
                <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Faster)</option>
                <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
              </select>
            </div>
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">System Prompt</label>
                    <button onClick={handleResetPrompt} className="text-xs text-slate-400 hover:text-purple-500 flex items-center gap-1"><RefreshCw size={10}/> Reset Default</button>
                </div>
                <textarea 
                    name="aiSystemPrompt"
                    value={formData.aiSystemPrompt}
                    onChange={handleChange}
                    rows={4}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
            </div>
          </div>
        </section>

        {/* General */}
        <section className="space-y-4 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-2">Preferences</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Daily Target (Hours)</label>
              <input 
                name="targetDailyHours"
                type="number"
                step="0.25"
                value={formData.targetDailyHours}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Min. Worklog (Hours)</label>
              <input 
                name="minHoursPerWorklog"
                type="number"
                step="0.25"
                min="0.1"
                value={formData.minHoursPerWorklog}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </section>
        
        <div className="flex justify-end gap-3 pt-4">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-sm">Cancel</button>
            <button 
                onClick={() => onSave(formData)}
                className="px-4 py-2 rounded-lg bg-jira-blue hover:bg-blue-700 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-blue-900/20"
            >
                <Save size={16} /> Save Configuration
            </button>
        </div>
      </div>
    </Modal>
  );
};