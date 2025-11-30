import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Clock, MessageSquare, Plus, Sparkles, History, Loader2, ExternalLink, Zap } from 'lucide-react';
import { AppSettings, JiraIssue, WorklogSuggestion } from '../types';
import { searchIssues } from '../services/api';

interface AddWorklogModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (issueKey: string, hours: number, comment: string) => Promise<void>;
    settings: AppSettings;
    suggestions: WorklogSuggestion[];
    selectedDate: string;
}

export const AddWorklogModal: React.FC<AddWorklogModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    settings,
    suggestions,
    selectedDate
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<JiraIssue[]>([]);
    const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
    const [hours, setHours] = useState('1');
    const [comment, setComment] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(true);
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
            setError('');
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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

    if (!isOpen) return null;

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            
            <div 
                className="relative w-full max-w-lg animate-scale-in"
                onClick={e => e.stopPropagation()}
            >
                <div className="surface-card p-0 overflow-hidden" style={{ boxShadow: 'var(--elevation-4)' }}>
                    
                    {/* Header */}
                    <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--color-outline-variant)' }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" 
                                     style={{ backgroundColor: 'var(--color-primary-container)' }}>
                                    <Plus size={22} style={{ color: 'var(--color-primary-600)' }} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                                        Worklog Ekle
                                    </h2>
                                    <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                        {formatDate(selectedDate)}
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="btn-icon">
                                <X size={20} />
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
