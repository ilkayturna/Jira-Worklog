import React, { useState, useRef, useEffect, memo } from 'react';
import { AppSettings, JiraIssue } from '../types';
import { fetchIssueDetails } from '../services/api';
import { Zap, Target, User, Clock, Tag, Layers } from 'lucide-react';

interface IssueHoverCardProps {
    issueKey: string;
    jiraBaseUrl: string;
    settings: AppSettings;
    children: React.ReactNode;
}

// Format seconds to readable time
const formatTime = (seconds: number | undefined): string => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`;
    }
    return `${minutes}m`;
};

// Status color mapping
const getStatusColor = (status?: string): { bg: string; text: string } => {
    const s = status?.toLowerCase() || '';
    if (s.includes('done') || s.includes('completed') || s.includes('closed')) {
        return { bg: 'var(--color-success-light)', text: 'var(--color-success)' };
    }
    if (s.includes('progress') || s.includes('review')) {
        return { bg: 'var(--color-primary-100)', text: 'var(--color-primary-600)' };
    }
    if (s.includes('test')) {
        return { bg: 'var(--color-ai-100)', text: 'var(--color-ai-600)' };
    }
    return { bg: 'var(--color-neutral-100)', text: 'var(--color-neutral-600)' };
};

export const IssueHoverCard = memo<IssueHoverCardProps>(({ issueKey, jiraBaseUrl, settings, children }) => {
    const [details, setDetails] = useState<JiraIssue | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout>();

    const handleMouseEnter = (e: React.MouseEvent) => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
            // Position card to the right of trigger, or below if not enough space
            const spaceRight = window.innerWidth - rect.right;
            const spaceBelow = window.innerHeight - rect.bottom;
            
            if (spaceRight > 340) {
                setPosition({ x: rect.right + 8, y: rect.top });
            } else if (spaceBelow > 300) {
                setPosition({ x: rect.left, y: rect.bottom + 8 });
            } else {
                setPosition({ x: rect.left, y: Math.max(8, rect.top - 300) });
            }
        }
        
        timeoutRef.current = setTimeout(() => {
            setIsVisible(true);
            if (!details) {
                loadDetails();
            }
        }, 400);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsVisible(false);
    };

    const loadDetails = async () => {
        setIsLoading(true);
        try {
            const data = await fetchIssueDetails(issueKey, settings);
            if (data) {
                setDetails(data);
            }
        } catch (error) {
            console.error("Failed to load issue details", error);
        } finally {
            setIsLoading(false);
        }
    };

    const statusColor = getStatusColor(details?.status);

    return (
        <div 
            className="relative inline-block" 
            ref={triggerRef} 
            onMouseEnter={handleMouseEnter} 
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {isVisible && (
                <div 
                    className="fixed z-50 w-80 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
                    style={{ 
                        top: position.y, 
                        left: position.x,
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-outline-variant)',
                        backdropFilter: 'blur(20px)',
                        maxHeight: '400px'
                    }}
                    role="tooltip"
                    aria-label={`${issueKey} detayları`}
                >
                    {/* Gradient header */}
                    <div 
                        className="px-4 py-3"
                        style={{
                            background: 'linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-ai-50) 100%)',
                            borderBottom: '1px solid var(--color-outline-variant)'
                        }}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <span 
                                className="text-xs font-bold px-2 py-0.5 rounded-md"
                                style={{ 
                                    background: 'var(--color-primary-500)',
                                    color: 'white'
                                }}
                            >
                                {issueKey}
                            </span>
                            {details?.status && (
                                <span 
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                                    style={{ background: statusColor.bg, color: statusColor.text }}
                                >
                                    {details.status}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-4 overflow-y-auto" style={{ maxHeight: '320px' }}>
                        {isLoading ? (
                            <div className="flex flex-col gap-3 animate-pulse">
                                <div className="h-5 w-full bg-gray-200 dark:bg-gray-700 rounded" />
                                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                                <div className="h-20 w-full bg-gray-200 dark:bg-gray-700 rounded mt-2" />
                            </div>
                        ) : details ? (
                            <div className="flex flex-col gap-3">
                                {/* Summary */}
                                <h4 
                                    className="font-semibold text-sm leading-snug"
                                    style={{ color: 'var(--color-on-surface)' }}
                                >
                                    {details.summary}
                                </h4>

                                {/* Sprint & Epic Info */}
                                {(details.sprint || details.epic || details.parent) && (
                                    <div className="flex flex-wrap gap-2">
                                        {details.sprint && (
                                            <div 
                                                className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg"
                                                style={{ 
                                                    background: details.sprint.state === 'active' 
                                                        ? 'var(--color-success-light)' 
                                                        : 'var(--color-neutral-100)',
                                                    color: details.sprint.state === 'active'
                                                        ? 'var(--color-success)'
                                                        : 'var(--color-neutral-600)'
                                                }}
                                            >
                                                <Zap size={10} />
                                                <span className="font-medium">{details.sprint.name}</span>
                                            </div>
                                        )}
                                        {details.epic && (
                                            <div 
                                                className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg"
                                                style={{ 
                                                    background: 'var(--color-ai-100)',
                                                    color: 'var(--color-ai-600)'
                                                }}
                                            >
                                                <Target size={10} />
                                                <span className="font-medium">
                                                    {details.epic.name || details.epic.key}
                                                </span>
                                            </div>
                                        )}
                                        {details.parent && !details.epic && (
                                            <div 
                                                className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg"
                                                style={{ 
                                                    background: 'var(--color-primary-100)',
                                                    color: 'var(--color-primary-600)'
                                                }}
                                            >
                                                <Layers size={10} />
                                                <span className="font-medium">{details.parent.key}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Description */}
                                {details.description && (
                                    <p 
                                        className="text-xs line-clamp-4 leading-relaxed"
                                        style={{ color: 'var(--color-on-surface-variant)' }}
                                    >
                                        {details.description}
                                    </p>
                                )}

                                {/* Labels */}
                                {details.labels && details.labels.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {details.labels.slice(0, 4).map(label => (
                                            <span 
                                                key={label}
                                                className="text-[9px] px-1.5 py-0.5 rounded"
                                                style={{ 
                                                    background: 'var(--color-neutral-100)',
                                                    color: 'var(--color-neutral-600)'
                                                }}
                                            >
                                                <Tag size={8} className="inline mr-0.5" />
                                                {label}
                                            </span>
                                        ))}
                                        {details.labels.length > 4 && (
                                            <span className="text-[9px] text-gray-400">
                                                +{details.labels.length - 4} more
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Time Tracking */}
                                {(details.timeSpent || details.originalEstimate) && (
                                    <div 
                                        className="flex items-center gap-3 text-[10px] pt-2 border-t"
                                        style={{ 
                                            borderColor: 'var(--color-outline-variant)',
                                            color: 'var(--color-on-surface-variant)'
                                        }}
                                    >
                                        <div className="flex items-center gap-1">
                                            <Clock size={10} />
                                            <span>Harcanan: {formatTime(details.timeSpent)}</span>
                                        </div>
                                        {details.originalEstimate && (
                                            <div className="flex items-center gap-1">
                                                <span>Tahmin: {formatTime(details.originalEstimate)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Subtasks */}
                                {details.subtasks && details.subtasks.length > 0 && (
                                    <div className="pt-2 border-t" style={{ borderColor: 'var(--color-outline-variant)' }}>
                                        <p className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--color-on-surface-variant)' }}>
                                            Alt Görevler ({details.subtasks.length})
                                        </p>
                                        <div className="flex flex-col gap-1">
                                            {details.subtasks.slice(0, 3).map(st => (
                                                <div 
                                                    key={st.key}
                                                    className="flex items-center justify-between text-[10px] px-2 py-1 rounded"
                                                    style={{ background: 'var(--color-surface-container)' }}
                                                >
                                                    <span className="truncate flex-1" style={{ color: 'var(--color-on-surface)' }}>
                                                        {st.summary}
                                                    </span>
                                                    <span 
                                                        className="ml-2 shrink-0 px-1 rounded text-[9px]"
                                                        style={{ 
                                                            background: getStatusColor(st.status).bg,
                                                            color: getStatusColor(st.status).text
                                                        }}
                                                    >
                                                        {st.status}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Footer */}
                                <div 
                                    className="flex justify-between items-center pt-2 border-t text-[10px]"
                                    style={{ 
                                        borderColor: 'var(--color-outline-variant)',
                                        color: 'var(--color-on-surface-variant)'
                                    }}
                                >
                                    <div className="flex items-center gap-1">
                                        {details.assignee && (
                                            <>
                                                <User size={10} />
                                                <span>{details.assignee}</span>
                                            </>
                                        )}
                                    </div>
                                    <a 
                                        href={`${jiraBaseUrl}/browse/${issueKey}`} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="font-medium hover:underline"
                                        style={{ color: 'var(--color-primary-500)' }}
                                    >
                                        Jira'da Aç →
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-center py-4" style={{ color: 'var(--color-error)' }}>
                                Detaylar yüklenemedi.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

IssueHoverCard.displayName = 'IssueHoverCard';
