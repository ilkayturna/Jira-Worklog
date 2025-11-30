
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
    <Modal isOpen={isOpen} onClose={onClose} title="Ayarlar">
      <div className="space-y-6">
        
        {/* Jira Settings - Apple Grouped List Style */}
        <section>
          <h3 className="apple-section-header">Jira Bağlantısı</h3>
          <div className="apple-grouped-list">
            <div className="apple-settings-item">
              <label className="apple-label">Jira URL</label>
              <input 
                name="jiraUrl"
                value={formData.jiraUrl}
                onChange={handleChange}
                placeholder="https://sirketiniz.atlassian.net"
                className="apple-input"
              />
            </div>
            <div className="apple-settings-item">
              <label className="apple-label">E-posta</label>
              <input 
                name="jiraEmail"
                value={formData.jiraEmail}
                onChange={handleChange}
                placeholder="adiniz@sirket.com"
                className="apple-input"
              />
            </div>
            <div className="apple-settings-item">
              <label className="apple-label">API Token</label>
              <input 
                name="jiraToken"
                type="password"
                value={formData.jiraToken}
                onChange={handleChange}
                placeholder="••••••••"
                className="apple-input"
              />
            </div>
          </div>
          <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" 
             className="text-[13px] mt-2 inline-block" style={{ color: 'var(--color-primary-500)' }}>
            API Token Oluştur →
          </a>
        </section>

        {/* AI Settings */}
        <section>
          <h3 className="apple-section-header">Yapay Zeka</h3>
          <div className="apple-grouped-list">
            <div className="apple-settings-item">
              <label className="apple-label">Groq API Key</label>
              <input 
                name="groqApiKey"
                type="password"
                value={formData.groqApiKey}
                onChange={handleChange}
                placeholder="gsk_..."
                className="apple-input"
              />
            </div>
            <div className="apple-settings-item">
              <div className="flex justify-between items-center mb-1">
                <label className="apple-label">Model</label>
                <button 
                  onClick={fetchModels}
                  disabled={isLoadingModels || !formData.groqApiKey}
                  className="text-[13px] flex items-center gap-1 disabled:opacity-50"
                  style={{ color: 'var(--color-primary-500)' }}
                >
                  <RefreshCw size={12} className={isLoadingModels ? 'animate-spin' : ''}/> 
                  {isLoadingModels ? 'Yükleniyor' : 'Güncelle'}
                </button>
              </div>
              <select 
                name="groqModel"
                value={formData.groqModel}
                onChange={handleChange}
                className="apple-select"
              >
                {models.length > 0 ? (
                  models.map((model, index) => (
                    <option key={model.id} value={model.id}>
                      {model.id} 
                      {model.context_window ? ` (${formatContextWindow(model.context_window)})` : ''}
                      {index === 0 ? ' ⭐' : ''}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                  </>
                )}
              </select>
              {modelError && (
                <p className="text-[12px] mt-1" style={{ color: 'var(--color-error)' }}>{modelError}</p>
              )}
            </div>
            <div className="apple-settings-item">
              <div className="flex justify-between items-center mb-1">
                <label className="apple-label">Sistem Promptu</label>
                <button onClick={handleResetPrompt} className="text-[13px] flex items-center gap-1" style={{ color: 'var(--color-primary-500)' }}>
                  <RefreshCw size={12}/> Sıfırla
                </button>
              </div>
              <textarea 
                name="aiSystemPrompt"
                value={formData.aiSystemPrompt}
                onChange={handleChange}
                rows={3}
                className="apple-textarea"
              />
            </div>
          </div>
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" 
             className="text-[13px] mt-2 inline-block" style={{ color: 'var(--color-primary-500)' }}>
            Groq API Key Al →
          </a>
        </section>

        {/* Preferences */}
        <section>
          <h3 className="apple-section-header">Tercihler</h3>
          <div className="apple-grouped-list">
            <div className="apple-settings-item">
              <label className="apple-label">Günlük Hedef</label>
              <div className="flex items-center gap-2">
                <input 
                  name="targetDailyHours"
                  type="number"
                  step="0.25"
                  value={formData.targetDailyHours}
                  onChange={handleChange}
                  className="apple-input w-20 text-right"
                />
                <span className="text-[15px]" style={{ color: 'var(--color-on-surface-variant)' }}>saat</span>
              </div>
            </div>
            <div className="apple-settings-item">
              <label className="apple-label">Min. Worklog Süresi</label>
              <div className="flex items-center gap-2">
                <input 
                  name="minHoursPerWorklog"
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={formData.minHoursPerWorklog}
                  onChange={handleChange}
                  className="apple-input w-20 text-right"
                />
                <span className="text-[15px]" style={{ color: 'var(--color-on-surface-variant)' }}>saat</span>
              </div>
            </div>
          </div>
        </section>
        
        {/* Action Buttons - Apple Style */}
        <div className="flex gap-3 pt-2">
          <button 
            onClick={onClose} 
            className="flex-1 py-3 rounded-xl text-[15px] font-semibold transition-all active:scale-[0.98]"
            style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}
          >
            İptal
          </button>
          <button 
            onClick={() => onSave(formData)}
            className="flex-1 py-3 rounded-xl text-[15px] font-semibold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--color-primary-500)' }}
          >
            <Save size={16} /> Kaydet
          </button>
        </div>
      </div>
    </Modal>
  );
};
