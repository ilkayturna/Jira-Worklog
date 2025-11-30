
import React, { useState, useEffect } from 'react';
import { AppSettings, DEFAULT_SYSTEM_PROMPT } from '../types';
import { Modal } from './ui/Modal';
import { Save, RefreshCw, Zap } from 'lucide-react';

interface GroqModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  active: boolean;
  context_window: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
}

const MODELS_CACHE_KEY = 'WorklogPro_groqModels';
const MODELS_CACHE_EXPIRY_KEY = 'WorklogPro_groqModelsExpiry';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Preferred models (sorted by preference - newest/best first)
const PREFERRED_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.2-90b-vision-preview',
  'llama-3.1-70b-versatile',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
  'llama-3.1-8b-instant',
  'llama3-8b-8192',
  'gemma2-9b-it',
];

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave }) => {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [models, setModels] = useState<GroqModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Load cached models or fetch new ones when API key changes
  useEffect(() => {
    if (formData.groqApiKey && isOpen) {
      loadModels();
    }
  }, [formData.groqApiKey, isOpen]);

  // Update formData when settings change
  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const loadModels = async () => {
    // Check cache first
    const cachedModels = localStorage.getItem(MODELS_CACHE_KEY);
    const cacheExpiry = localStorage.getItem(MODELS_CACHE_EXPIRY_KEY);
    
    if (cachedModels && cacheExpiry && Date.now() < parseInt(cacheExpiry)) {
      const parsed = JSON.parse(cachedModels);
      setModels(parsed);
      // Auto-select best model if current selection is not in list
      autoSelectBestModel(parsed);
      return;
    }

    // Fetch fresh models
    await fetchModels();
  };

  const fetchModels = async () => {
    if (!formData.groqApiKey) return;
    
    setIsLoadingModels(true);
    setModelError(null);
    
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${formData.groqApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API Hatası: ${response.status}`);
      }

      const data = await response.json();
      
      // Filter to only active text models (exclude whisper, etc)
      const textModels = (data.data || []).filter((m: GroqModel) => 
        m.active && 
        !m.id.includes('whisper') && 
        !m.id.includes('distil') &&
        m.id !== 'llama-guard-3-8b'
      );
      
      // Sort by preference
      textModels.sort((a: GroqModel, b: GroqModel) => {
        const aIndex = PREFERRED_MODELS.indexOf(a.id);
        const bIndex = PREFERRED_MODELS.indexOf(b.id);
        
        // If both in preferred list, sort by preference
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        // Preferred models come first
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        // Otherwise sort by context window (larger is better)
        return b.context_window - a.context_window;
      });

      setModels(textModels);
      
      // Cache the results
      localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(textModels));
      localStorage.setItem(MODELS_CACHE_EXPIRY_KEY, String(Date.now() + CACHE_DURATION));
      
      // Auto-select best model
      autoSelectBestModel(textModels);
      
    } catch (error: any) {
      console.error('Failed to fetch Groq models:', error);
      setModelError(error.message);
      // Use fallback models
      setModels([
        { id: 'llama-3.3-70b-versatile', context_window: 32768 } as GroqModel,
        { id: 'llama-3.1-8b-instant', context_window: 131072 } as GroqModel,
        { id: 'mixtral-8x7b-32768', context_window: 32768 } as GroqModel,
      ]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const autoSelectBestModel = (modelList: GroqModel[]) => {
    if (modelList.length === 0) return;
    
    // Check if current selection is valid
    const currentModelValid = modelList.some(m => m.id === formData.groqModel);
    
    if (!currentModelValid) {
      // Select the first (best) model
      setFormData(prev => ({ ...prev, groqModel: modelList[0].id }));
    }
  };

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

  const formatContextWindow = (size: number) => {
    if (size >= 131072) return '128K';
    if (size >= 65536) return '64K';
    if (size >= 32768) return '32K';
    if (size >= 8192) return '8K';
    return `${Math.round(size / 1024)}K`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ayarlar & Yapılandırma">
      <div className="space-y-6">
        
        {/* Jira Settings */}
        <section className="space-y-4 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-bold text-jira-blue uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-2">Jira Bağlantısı</h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Jira URL Adresi</label>
              <input 
                name="jiraUrl"
                value={formData.jiraUrl}
                onChange={handleChange}
                placeholder="https://sirketiniz.atlassian.net"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-jira-blue focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">E-posta Adresi</label>
              <input 
                name="jiraEmail"
                value={formData.jiraEmail}
                onChange={handleChange}
                placeholder="adiniz@sirket.com"
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
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="text-xs text-jira-blue hover:underline mt-1 inline-block">API Token Oluştur &rarr;</a>
            </div>
          </div>
        </section>

        {/* AI Settings */}
        <section className="space-y-4 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-bold text-purple-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-2">Yapay Zeka (Groq)</h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Groq API Anahtarı</label>
              <input 
                name="groqApiKey"
                type="password"
                value={formData.groqApiKey}
                onChange={handleChange}
                placeholder="gsk_..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-xs text-purple-500 hover:underline mt-1 inline-block">Groq Anahtarı Al &rarr;</a>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Model</label>
                <button 
                  onClick={fetchModels}
                  disabled={isLoadingModels || !formData.groqApiKey}
                  className="text-xs text-slate-400 hover:text-purple-500 flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw size={10} className={isLoadingModels ? 'animate-spin' : ''}/> 
                  {isLoadingModels ? 'Yükleniyor...' : 'Modelleri Güncelle'}
                </button>
              </div>
              <select 
                name="groqModel"
                value={formData.groqModel}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-purple-500"
              >
                {models.length > 0 ? (
                  models.map((model, index) => (
                    <option key={model.id} value={model.id}>
                      {model.id} 
                      {model.context_window ? ` (${formatContextWindow(model.context_window)})` : ''}
                      {index === 0 ? ' ⭐ Önerilen' : ''}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Önerilen)</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Hızlı)</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                  </>
                )}
              </select>
              {modelError && (
                <p className="text-xs text-red-500 mt-1">Model listesi yüklenemedi: {modelError}</p>
              )}
              {models.length > 0 && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Zap size={10} className="text-purple-500" />
                  {models.length} model mevcut • Otomatik güncellenir
                </p>
              )}
            </div>
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Sistem Promptu</label>
                    <button onClick={handleResetPrompt} className="text-xs text-slate-400 hover:text-purple-500 flex items-center gap-1"><RefreshCw size={10}/> Varsayılana Dön</button>
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
          <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 pb-2">Tercihler</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Günlük Hedef (Saat)</label>
              <input 
                name="targetDailyHours"
                type="number"
                step="0.25"
                value={formData.targetDailyHours}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-400 mt-1">Varsayılan hedef saat</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Min. Worklog (Saat)</label>
              <input 
                name="minHoursPerWorklog"
                type="number"
                step="0.05"
                min="0.1"
                value={formData.minHoursPerWorklog}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-400 mt-1">Dağıtımda min. süre</p>
            </div>
          </div>
        </section>
        
        <div className="flex justify-end gap-3 pt-4">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-sm">İptal</button>
            <button 
                onClick={() => onSave(formData)}
                className="px-4 py-2 rounded-lg bg-jira-blue hover:bg-blue-700 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-blue-900/20"
            >
                <Save size={16} /> Kaydet
            </button>
        </div>
      </div>
    </Modal>
  );
};
