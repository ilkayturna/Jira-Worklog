import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Clock, MessageSquare, Plus, Sparkles, Loader2, Zap, TrendingUp, Wand2 } from 'lucide-react';
import { AppSettings, JiraIssue, WorklogSuggestion } from '../types';
import { searchIssues, callGroq } from '../services/api';

interface TimeEstimation {
    estimate: number;
    confidence: 'high' | 'medium' | 'low';
    message: string;
}

interface AddWorklogModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (issueKey: string, hours: number, comment: string) => Promise<void>;
    settings: AppSettings;
    suggestions: WorklogSuggestion[];
    selectedDate: string;
    getTimeEstimation: (issueKey: string, summary: string) => TimeEstimation | null;
}

export const AddWorklogModal: React.FC<AddWorklogModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    settings,
    suggestions,
    selectedDate,
    getTimeEstimation
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<JiraIssue[]>([]);
    const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
    const [hours, setHours] = useState('1');
    const [comment, setComment] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [timeEstimation, setTimeEstimation] = useState<TimeEstimation | null>(null);
    const [aiSuggestedComment, setAiSuggestedComment] = useState<string | null>(null);
    const [aiSuggestedHours, setAiSuggestedHours] = useState<number | null>(null);
    const [isAiCommentLoading, setIsAiCommentLoading] = useState(false);
    const [isAiTimeLoading, setIsAiTimeLoading] = useState(false);
    const [error, setError] = useState('');
    
    const searchInputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setSearchResults([]);
            setSelectedIssue(null);
            setHours('1');
            setComment('');
            setShowSuggestions(true);
            setTimeEstimation(null);
            setAiSuggestedComment(null);
            setAiSuggestedHours(null);
            setIsAiCommentLoading(false);
            setIsAiTimeLoading(false);
            setError('');
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Update time estimation when issue changes
    useEffect(() => {
        if (selectedIssue) {
            const estimation = getTimeEstimation(selectedIssue.key, selectedIssue.summary);
            setTimeEstimation(estimation);
        } else {
            setTimeEstimation(null);
        }
    }, [selectedIssue, getTimeEstimation]);

    // Debounced search
    const handleSearch = useCallback(async (query: string) => {
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const results = await searchIssues(query, settings);
            setSearchResults(results);
        } catch (e) {
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [settings]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        
        if (searchQuery.length >= 2) {
            debounceRef.current = setTimeout(() => handleSearch(searchQuery), 300);
        } else {
            setSearchResults([]);
        }

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [searchQuery, handleSearch]);

    const handleSelectIssue = (issue: JiraIssue) => {
        setSelectedIssue(issue);
        setSearchQuery(issue.key);
        setSearchResults([]);
        setShowSuggestions(false);
    };

    const handleSelectSuggestion = (suggestion: WorklogSuggestion) => {
        setSelectedIssue({ key: suggestion.issueKey, summary: suggestion.summary });
        setSearchQuery(suggestion.issueKey);
        setComment(suggestion.lastComment);
        setHours(suggestion.avgHours.toFixed(1));
        setShowSuggestions(false);
        setSearchResults([]);
    };

    // AI ile yorum önerisi al
    const handleGetAIComment = async () => {
        if (!selectedIssue || !settings.groqApiKey) return;
        
        setIsAiCommentLoading(true);
        setAiSuggestedComment(null);
        
        try {
            const historySuggestion = suggestions.find(s => s.issueKey === selectedIssue.key);
            const issueDescription = selectedIssue.description || '';
            
            const historyContext = historySuggestion 
                ? `Son girilen yorum: "${historySuggestion.lastComment}"`
                : '';
            
            const prompt = `Sen deneyimli bir yazılım danışmanısın. Jira worklog için profesyonel ve gerçekçi bir açıklama yaz.

TALEP BAŞLIĞI: ${selectedIssue.summary}
${issueDescription ? `TALEP AÇIKLAMASI: ${issueDescription}` : ''}
${historyContext}

ÖNEMLİ KURALLAR:
1. 80-150 karakter arası, tek cümle veya iki kısa cümle
2. Yapılan işin özünü yaz - ne yapıldı, nasıl çözüldü
3. Gerçekçi ol - "sistem optimizasyonu sağlandı", "müşteri memnuniyeti arttı" gibi boş laflar YAZMA
4. Somut eylemler kullan: "incelendi", "düzeltildi", "eklendi", "güncellendi", "test edildi"
5. Başlıktaki anahtar kelimeleri kullan ama aynen kopyalama
6. Türkçe yaz, profesyonel ama doğal bir dil kullan
7. Tırnak işareti, başlık, madde işareti KULLANMA
8. "işlemi yapıldı", "çalışması gerçekleştirildi" gibi gereksiz uzatmalar YAPMA

SADECE worklog açıklamasını yaz, başka hiçbir şey yazma:`;

            const response = await callGroq(prompt, settings, 150);
            const cleaned = response.trim().replace(/^["'"'""'']+|["'"'""'']+$/g, '');
            setAiSuggestedComment(cleaned);
        } catch (e) {
            console.error('AI comment error:', e);
            setError('AI yorum önerisi alınamadı');
        } finally {
            setIsAiCommentLoading(false);
        }
    };

    // AI ile süre önerisi al
    const handleGetAITime = async () => {
        if (!selectedIssue || !settings.groqApiKey) return;
        
        setIsAiTimeLoading(true);
        setAiSuggestedHours(null);
        
        try {
            const historySuggestion = suggestions.find(s => s.issueKey === selectedIssue.key);
            
            if (historySuggestion && historySuggestion.frequency >= 2) {
                // Geçmiş veri varsa direkt kullan, AI'a gerek yok
                setAiSuggestedHours(historySuggestion.avgHours);
            } else {
                // Geçmiş yoksa AI'dan tahmin al
                const prompt = `Aşağıdaki Jira talebi için tahmini çalışma süresi ver.

TALEP BAŞLIĞI: ${selectedIssue.summary}
${selectedIssue.description ? `AÇIKLAMA: ${selectedIssue.description}` : ''}

KURALLAR:
1. Sadece sayı döndür (örn: 2.5)
2. Minimum 0.5, maksimum 8 saat arası
3. Basit işler (düzeltme, güncelleme): 0.5-2 saat
4. Orta işler (geliştirme, analiz): 2-4 saat
5. Karmaşık işler (entegrasyon, yeni özellik): 4-8 saat

SADECE sayı yaz:`;

                const response = await callGroq(prompt, settings, 20);
                const hours = parseFloat(response.trim());
                if (!isNaN(hours) && hours >= 0.25 && hours <= 24) {
                    setAiSuggestedHours(hours);
                } else {
                    setAiSuggestedHours(2); // Varsayılan
                }
            }
        } catch (e) {
            console.error('AI time error:', e);
            setError('AI süre önerisi alınamadı');
        } finally {
            setIsAiTimeLoading(false);
        }
    };

    // AI yorum önerisini uygula
    const handleApplyAIComment = () => {
        if (aiSuggestedComment) {
            setComment(aiSuggestedComment);
            setAiSuggestedComment(null);
        }
    };

    // AI süre önerisini uygula
    const handleApplyAITime = () => {
        if (aiSuggestedHours) {
            setHours(aiSuggestedHours.toFixed(1));
            setAiSuggestedHours(null);
        }
    };

    const handleApplyEstimation = () => {
        if (timeEstimation) {
            setHours(timeEstimation.estimate.toFixed(1));
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setError('');

        if (!selectedIssue) {
            setError('Lütfen bir issue seçin');
            return;
        }

        const hoursNum = parseFloat(hours);
        if (isNaN(hoursNum) || hoursNum <= 0) {
            setError('Geçerli bir saat değeri girin');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSubmit(selectedIssue.key, hoursNum, comment);
            onClose();
        } catch (e: any) {
            setError(e.message || 'Worklog eklenirken hata oluştu');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Listen for global save trigger (Ctrl+S)
    useEffect(() => {
        if (!isOpen) return;
        const handleSaveTrigger = () => handleSubmit();
        window.addEventListener('trigger-save', handleSaveTrigger);
        return () => window.removeEventListener('trigger-save', handleSaveTrigger);
    }, [isOpen, selectedIssue, hours, comment, onSubmit]);

    if (!isOpen) return null;

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="absolute inset-0 backdrop-blur-xl" style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%)' }} />
            
            <div 
                className="relative w-full max-w-lg animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <div 
                    className="overflow-hidden"
                    style={{ 
                        background: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(40px) saturate(200%)',
                        WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                        borderRadius: '24px',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
                    }}
                >
                    {/* Gradient accent at top */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: '24px',
                        right: '24px',
                        height: '3px',
                        background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-ai-400), var(--color-success))',
                        borderRadius: '0 0 4px 4px'
                    }} />
                    
                    {/* Header */}
                    <div className="px-6 py-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="absolute inset-0 rounded-xl blur-lg opacity-40" style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-ai-500))' }} />
                                    <div className="relative w-11 h-11 rounded-xl flex items-center justify-center" 
                                         style={{ 
                                             background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)',
                                             boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)'
                                         }}>
                                        <Plus size={22} className="text-white" />
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-on-surface) 0%, var(--color-primary-600) 100%)' }}>
                                        Worklog Ekle
                                    </h2>
                                    <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-on-surface-variant)' }}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                        {formatDate(selectedDate)}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={onClose} 
                                className="w-9 h-9 flex items-center justify-center rounded-full transition-all hover:scale-110"
                                style={{ 
                                    background: 'linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.08) 100%)',
                                    border: '1px solid rgba(0,0,0,0.06)'
                                }}
                            >
                                <X size={18} style={{ color: 'var(--color-on-surface-variant)' }} />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        
                        {/* Issue Search */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" 
                                   style={{ color: 'var(--color-on-surface-variant)' }}>
                                Issue Seç
                            </label>
                            
                            <div className="relative">
                                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" 
                                        style={{ color: 'var(--color-on-surface-variant)' }} />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setSelectedIssue(null);
                                        if (e.target.value.length === 0) setShowSuggestions(true);
                                    }}
                                    placeholder="Issue key veya özet ara..."
                                    className="input-filled w-full pl-10 pr-10"
                                />
                                {isSearching && (
                                    <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" 
                                             style={{ color: 'var(--color-primary-600)' }} />
                                )}
                            </div>

                            {/* Selected Issue Display */}
                            {selectedIssue && (
                                <div className="flex items-center gap-2 p-3 rounded-xl" 
                                     style={{ backgroundColor: 'var(--color-primary-container)' }}>
                                    <span className="text-xs font-bold px-2 py-0.5 rounded" 
                                          style={{ backgroundColor: 'var(--color-primary-600)', color: 'white' }}>
                                        {selectedIssue.key}
                                    </span>
                                    <span className="text-sm flex-1 truncate" style={{ color: 'var(--color-on-surface)' }}>
                                        {selectedIssue.summary}
                                    </span>
                                </div>
                            )}

                            {/* Search Results Dropdown */}
                            {searchResults.length > 0 && !selectedIssue && (
                                <div className="absolute left-0 right-0 z-10 mt-1 rounded-xl overflow-hidden border"
                                     style={{ 
                                         backgroundColor: 'var(--color-surface)', 
                                         borderColor: 'var(--color-outline-variant)',
                                         boxShadow: 'var(--elevation-3)'
                                     }}>
                                    {searchResults.map(issue => (
                                        <button
                                            key={issue.key}
                                            type="button"
                                            onClick={() => handleSelectIssue(issue)}
                                            className="w-full px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-start gap-3 border-b last:border-b-0"
                                            style={{ borderColor: 'var(--color-outline-variant)' }}
                                        >
                                            <span className="text-xs font-bold px-2 py-0.5 rounded shrink-0" 
                                                  style={{ backgroundColor: 'var(--color-secondary-container)', color: 'var(--color-on-surface)' }}>
                                                {issue.key}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-on-surface)' }}>
                                                    {issue.summary}
                                                </p>
                                                <p className="text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)' }}>
                                                    {issue.projectName} • {issue.status}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Smart Suggestions */}
                        {showSuggestions && suggestions.length > 0 && !selectedIssue && searchQuery.length < 2 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={14} style={{ color: 'var(--color-primary-600)' }} />
                                    <label className="text-xs font-semibold uppercase tracking-wider" 
                                           style={{ color: 'var(--color-on-surface-variant)' }}>
                                        Akıllı Öneriler
                                    </label>
                                </div>
                                <div className="space-y-2 max-h-36 overflow-y-auto">
                                    {suggestions.slice(0, 5).map((suggestion, index) => (
                                        <button
                                            key={`${suggestion.issueKey}-${index}`}
                                            type="button"
                                            onClick={() => handleSelectSuggestion(suggestion)}
                                            className="w-full p-3 rounded-xl text-left transition-all hover:scale-[1.01] border"
                                            style={{ 
                                                backgroundColor: 'var(--color-surface-variant)', 
                                                borderColor: 'var(--color-outline-variant)' 
                                            }}
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-xs font-bold px-2 py-0.5 rounded" 
                                                      style={{ backgroundColor: 'var(--color-tertiary-container)', color: 'var(--color-on-surface)' }}>
                                                    {suggestion.issueKey}
                                                </span>
                                                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                                                    <Zap size={12} /> {suggestion.frequency}x kullanıldı
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium truncate" style={{ color: 'var(--color-on-surface)' }}>
                                                {suggestion.summary}
                                            </p>
                                            <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-on-surface-variant)' }}>
                                                Son: "{suggestion.lastComment}" • ~{suggestion.avgHours.toFixed(1)}h
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* AI Butonları - Issue seçildiğinde göster */}
                        {selectedIssue && settings.groqApiKey && (
                            <div className="space-y-3">
                                {/* İki buton yan yana */}
                                <div className="grid grid-cols-2 gap-2">
                                    {/* AI Yorum Öner Butonu */}
                                    <button
                                        type="button"
                                        onClick={handleGetAIComment}
                                        disabled={isAiCommentLoading}
                                        className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border transition-all hover:scale-[1.01]"
                                        style={{ 
                                            borderColor: 'var(--color-primary-300)',
                                            backgroundColor: 'var(--color-primary-container)',
                                            color: 'var(--color-primary-700)'
                                        }}
                                    >
                                        {isAiCommentLoading ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <Wand2 size={16} />
                                        )}
                                        <span className="text-sm font-medium">AI Yorum Öner</span>
                                    </button>

                                    {/* AI Süre Öner Butonu */}
                                    <button
                                        type="button"
                                        onClick={handleGetAITime}
                                        disabled={isAiTimeLoading}
                                        className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border transition-all hover:scale-[1.01]"
                                        style={{ 
                                            borderColor: 'var(--color-secondary-300)',
                                            backgroundColor: 'var(--color-secondary-container)',
                                            color: 'var(--color-secondary-700)'
                                        }}
                                    >
                                        {isAiTimeLoading ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <Clock size={16} />
                                        )}
                                        <span className="text-sm font-medium">AI Süre Öner</span>
                                    </button>
                                </div>

                                {/* AI Yorum Önerisi Sonucu */}
                                {aiSuggestedComment && (
                                    <div 
                                        className="p-3 rounded-xl border cursor-pointer hover:scale-[1.01] transition-all"
                                        onClick={handleApplyAIComment}
                                        style={{ 
                                            backgroundColor: 'rgba(34, 197, 94, 0.08)',
                                            borderColor: 'rgba(34, 197, 94, 0.3)'
                                        }}
                                    >
                                        <div className="flex items-start gap-2">
                                            <Sparkles size={16} style={{ color: 'var(--color-success)', marginTop: 2, flexShrink: 0 }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                                                    {aiSuggestedComment}
                                                </p>
                                                <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                                                    Tıklayarak yoruma uygula
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* AI Süre Önerisi Sonucu */}
                                {aiSuggestedHours && (
                                    <div 
                                        className="p-3 rounded-xl border cursor-pointer hover:scale-[1.01] transition-all flex items-center justify-between"
                                        onClick={handleApplyAITime}
                                        style={{ 
                                            backgroundColor: 'rgba(234, 179, 8, 0.08)',
                                            borderColor: 'rgba(234, 179, 8, 0.3)'
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <TrendingUp size={16} style={{ color: 'var(--color-warning)' }} />
                                            <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                                                Önerilen süre
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span 
                                                className="text-lg font-bold"
                                                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-warning)' }}
                                            >
                                                {aiSuggestedHours.toFixed(1)}h
                                            </span>
                                            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                                tıkla uygula
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Time Estimation - Geçmiş veriye dayalı */}
                        {timeEstimation && selectedIssue && !aiSuggestedHours && (
                            <div 
                                className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:scale-[1.01] transition-all"
                                onClick={handleApplyEstimation}
                                style={{ 
                                    backgroundColor: timeEstimation.confidence === 'high' 
                                        ? 'var(--color-success-container, rgba(34, 197, 94, 0.1))' 
                                        : timeEstimation.confidence === 'medium'
                                        ? 'var(--color-warning-container, rgba(234, 179, 8, 0.1))'
                                        : 'var(--color-surface-variant)',
                                    borderColor: timeEstimation.confidence === 'high'
                                        ? 'rgba(34, 197, 94, 0.3)'
                                        : timeEstimation.confidence === 'medium'
                                        ? 'rgba(234, 179, 8, 0.3)'
                                        : 'var(--color-outline-variant)'
                                }}
                            >
                                <TrendingUp size={18} style={{ 
                                    color: timeEstimation.confidence === 'high' 
                                        ? 'var(--color-success)' 
                                        : timeEstimation.confidence === 'medium'
                                        ? 'var(--color-warning)'
                                        : 'var(--color-on-surface-variant)' 
                                }} />
                                <div className="flex-1">
                                    <p className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
                                        {timeEstimation.message}
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                        Tıklayarak {timeEstimation.estimate.toFixed(1)}h uygulayın
                                    </p>
                                </div>
                                <span 
                                    className="text-lg font-bold"
                                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary-600)' }}
                                >
                                    {timeEstimation.estimate.toFixed(1)}h
                                </span>
                            </div>
                        )}

                        {/* Time & Comment */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider" 
                                       style={{ color: 'var(--color-on-surface-variant)' }}>
                                    Süre (saat)
                                </label>
                                <div className="relative">
                                    <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" 
                                           style={{ color: 'var(--color-on-surface-variant)' }} />
                                    <input
                                        type="number"
                                        step="0.25"
                                        min="0.25"
                                        max="24"
                                        value={hours}
                                        onChange={(e) => setHours(e.target.value)}
                                        className="input-filled w-full pl-9 text-center font-semibold"
                                        style={{ fontFamily: 'var(--font-mono)' }}
                                    />
                                </div>
                            </div>
                            
                            <div className="col-span-2 space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider" 
                                       style={{ color: 'var(--color-on-surface-variant)' }}>
                                    Yorum
                                </label>
                                <div className="relative">
                                    <MessageSquare size={16} className="absolute left-3 top-3" 
                                                   style={{ color: 'var(--color-on-surface-variant)' }} />
                                    <textarea
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder="Yapılan iş..."
                                        rows={2}
                                        className="input-filled w-full pl-9 resize-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="p-3 rounded-xl text-sm" 
                                 style={{ backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' }}>
                                {error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button type="button" onClick={onClose} className="btn-text">
                                İptal
                            </button>
                            <button 
                                type="submit" 
                                className="btn-filled ripple"
                                disabled={!selectedIssue || isSubmitting}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" /> Ekleniyor...
                                    </>
                                ) : (
                                    <>
                                        <Plus size={18} /> Worklog Ekle
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
