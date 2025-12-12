import React, { useEffect, useState, useCallback } from 'react';
import { JiraIssue, AppSettings } from '../types';
import { fetchAssignedIssues, fetchIssueTransitions, transitionIssue } from '../services/api';
import { GripVertical, RefreshCw, AlertCircle, X, ChevronDown, Check, Loader2 } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import { normalizeJiraBaseUrl } from '../utils/ui';

interface Transition {
    id: string;
    name: string;
    to: { name: string };
}

interface AssignedIssuesDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onDragStart: (issue: JiraIssue) => void;
}

export const AssignedIssuesDrawer: React.FC<AssignedIssuesDrawerProps> = ({ isOpen, onClose, settings, onDragStart }) => {
    const [issues, setIssues] = useState<JiraIssue[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const isMobile = useIsMobile();

    const jiraBaseUrl = normalizeJiraBaseUrl(settings.jiraUrl);
    
    // Status change state
    const [statusMenuOpen, setStatusMenuOpen] = useState<string | null>(null);
    const [transitions, setTransitions] = useState<Transition[]>([]);
    const [loadingTransitions, setLoadingTransitions] = useState(false);
    const [changingStatus, setChangingStatus] = useState<string | null>(null);

    const loadIssues = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await fetchAssignedIssues(settings);
            setIssues(data);
        } catch (err) {
            setError("Issue'lar yüklenemedi.");
        } finally {
            setIsLoading(false);
        }
    }, [settings]);

    useEffect(() => {
        if (isOpen) {
            loadIssues();
        }
    }, [isOpen, loadIssues]);
    
    // Close status menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setStatusMenuOpen(null);
        if (statusMenuOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [statusMenuOpen]);

    const handleStatusClick = async (e: React.MouseEvent, issueKey: string) => {
        e.stopPropagation();
        
        if (statusMenuOpen === issueKey) {
            setStatusMenuOpen(null);
            return;
        }
        
        setStatusMenuOpen(issueKey);
        setLoadingTransitions(true);
        
        try {
            const trans = await fetchIssueTransitions(issueKey, settings);
            setTransitions(trans);
        } catch (err) {
            console.error('Transitions fetch error:', err);
            setTransitions([]);
        } finally {
            setLoadingTransitions(false);
        }
    };
    
    const handleTransitionSelect = async (e: React.MouseEvent, issueKey: string, transition: Transition) => {
        e.stopPropagation();
        setChangingStatus(issueKey);
        
        try {
            await transitionIssue(issueKey, transition.id, settings);
            // Update local state
            setIssues(prev => prev.map(issue => 
                issue.key === issueKey 
                    ? { ...issue, status: transition.to.name }
                    : issue
            ));
            setStatusMenuOpen(null);
        } catch (err) {
            console.error('Transition error:', err);
            setError(`Statü değiştirilemedi: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`);
        } finally {
            setChangingStatus(null);
        }
    };

    // Drag & Drop handlers for reordering
    const handleDragStart = useCallback((e: React.DragEvent, index: number, issue: JiraIssue) => {
        if (isMobile) {
            e.preventDefault();
            return;
        }
        setDraggedIndex(index);
        e.dataTransfer.setData('text/plain', JSON.stringify(issue));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(issue);
    }, [isMobile, onDragStart]);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedIndex !== null && draggedIndex !== index) {
            setDragOverIndex(index);
        }
    }, [draggedIndex]);

    const handleDragLeave = useCallback(() => {
        setDragOverIndex(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        
        if (draggedIndex !== null && draggedIndex !== dropIndex) {
            const newIssues = [...issues];
            const [draggedItem] = newIssues.splice(draggedIndex, 1);
            newIssues.splice(dropIndex, 0, draggedItem);
            setIssues(newIssues);
        }
        
        setDraggedIndex(null);
        setDragOverIndex(null);
    }, [draggedIndex, issues]);

    const handleDragEnd = useCallback(() => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    }, []);

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div 
                    className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm animate-fade-in"
                    onClick={onClose}
                />
            )}
            
            {/* Drawer */}
            <div 
                className={`fixed inset-y-0 right-0 w-full max-w-md z-40 transform transition-transform duration-300 ease-out glass-drawer ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="px-5 py-4 flex justify-between items-center glass-drawer-header">
                    <div className="flex items-center gap-3">
                        <div 
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ 
                                background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-ai-500) 100%)',
                                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                            }}
                        >
                            <span className="text-white text-lg">📋</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-base bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--color-on-surface) 0%, var(--color-primary-600) 100%)' }}>
                                Bana Atananlar
                            </h3>
                            <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                {issues.length} açık issue
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={loadIssues} 
                            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:scale-105 glass-icon-btn"
                            title="Yenile"
                        >
                            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} style={{ color: 'var(--color-on-surface-variant)' }} />
                        </button>
                        <button 
                            onClick={onClose} 
                            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:scale-105 glass-icon-btn"
                            title="Kapat"
                        >
                            <X size={18} style={{ color: 'var(--color-on-surface-variant)' }} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto h-[calc(100vh-72px)] glass-drawer-content">
                    {error && (
                        <div className="p-3 mb-4 rounded-xl text-sm flex items-center gap-2 error-alert">
                            <AlertCircle size={16} /> {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        {issues.map((issue, index) => (
                            <div 
                                key={issue.key}
                                draggable={!isMobile}
                                onDragStart={(e) => handleDragStart(e, index, issue)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, index)}
                                onDragEnd={handleDragEnd}
                                className={`p-3 rounded-xl cursor-grab active:cursor-grabbing transition-all group glass-card ${
                                    draggedIndex === index ? 'opacity-50 scale-95' : ''
                                } ${dragOverIndex === index ? 'ring-2 ring-primary-500 ring-offset-2 drag-over' : ''}`}
                            >
                                <div className="flex items-start gap-2">
                                    <GripVertical 
                                        size={16} 
                                        className="mt-1 opacity-30 group-hover:opacity-70 transition-opacity cursor-grab" 
                                        style={{ color: 'var(--color-on-surface-variant)' }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span
                                                className="text-xs font-bold px-2 py-0.5 rounded-md"
                                                style={{
                                                    background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)',
                                                    color: 'white'
                                                }}
                                            >
                                                {issue.key}
                                            </span>
                                            <span className="text-[10px] truncate" style={{ color: 'var(--color-on-surface-variant)' }}>
                                                {issue.projectName}
                                            </span>
                                        </div>
                                        {jiraBaseUrl ? (
                                            <a
                                                href={`${jiraBaseUrl}/browse/${issue.key}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ color: 'var(--color-on-surface)' }}
                                                title={issue.summary}
                                            >
                                                <p className="text-sm font-medium leading-snug line-clamp-2 mb-2">
                                                    {issue.summary}
                                                </p>
                                            </a>
                                        ) : (
                                            <p className="text-sm font-medium leading-snug line-clamp-2 mb-2" style={{ color: 'var(--color-on-surface)' }}>
                                                {issue.summary}
                                            </p>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <div className="relative">
                                                <button 
                                                    onClick={(e) => handleStatusClick(e, issue.key)}
                                                    disabled={changingStatus === issue.key}
                                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 cursor-pointer hover:ring-2 hover:ring-primary-300 transition-all disabled:opacity-50"
                                                    style={{
                                                        background: issue.status === 'In Progress' 
                                                            ? 'rgba(59, 130, 246, 0.15)' 
                                                            : issue.status === 'Done' 
                                                            ? 'rgba(16, 185, 129, 0.15)' 
                                                            : 'rgba(0,0,0,0.06)',
                                                        color: issue.status === 'In Progress' 
                                                            ? 'var(--color-primary-600)' 
                                                            : issue.status === 'Done' 
                                                            ? 'var(--color-success)' 
                                                            : 'var(--color-on-surface-variant)'
                                                    }}
                                                >
                                                    {changingStatus === issue.key ? (
                                                        <Loader2 size={10} className="animate-spin" />
                                                    ) : (
                                                        <>
                                                            {issue.status}
                                                            <ChevronDown size={10} />
                                                        </>
                                                    )}
                                                </button>
                                                
                                                {/* Transitions Dropdown */}
                                                {statusMenuOpen === issue.key && (
                                                    <div 
                                                        className="absolute left-0 top-full mt-1 z-50 min-w-[160px] py-1 rounded-lg shadow-xl border"
                                                        style={{
                                                            background: 'var(--color-surface)',
                                                            borderColor: 'var(--color-outline-variant)'
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {loadingTransitions ? (
                                                            <div className="px-3 py-2 flex items-center gap-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                                                <Loader2 size={12} className="animate-spin" />
                                                                Yükleniyor...
                                                            </div>
                                                        ) : transitions.length === 0 ? (
                                                            <div className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                                                Kullanılabilir geçiş yok
                                                            </div>
                                                        ) : (
                                                            transitions.map((transition) => (
                                                                <button
                                                                    key={transition.id}
                                                                    onClick={(e) => handleTransitionSelect(e, issue.key, transition)}
                                                                    className="w-full px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2 transition-colors"
                                                                    style={{ color: 'var(--color-on-surface)' }}
                                                                >
                                                                    <span className="flex-1">{transition.name}</span>
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)' }}>
                                                                        → {transition.to.name}
                                                                    </span>
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Link intentionally only on issue name (summary) */}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {isLoading && (
                            <div className="flex items-center justify-center py-8">
                                <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--color-primary-500)' }} />
                            </div>
                        )}
                        
                        {!isLoading && issues.length === 0 && !error && (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center glass-empty-state">
                                    <span className="text-3xl">🎉</span>
                                </div>
                                <p className="font-medium" style={{ color: 'var(--color-on-surface)' }}>
                                    Harika! Boş liste
                                </p>
                                <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                                    Size atanan açık issue yok
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
