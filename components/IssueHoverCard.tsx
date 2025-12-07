import React, { useState, useRef, useEffect } from 'react';
import { AppSettings } from '../types';
import { fetchIssueDetails } from '../services/api';

interface IssueHoverCardProps {
    issueKey: string;
    jiraBaseUrl: string;
    settings: AppSettings;
    children: React.ReactNode;
}

export const IssueHoverCard: React.FC<IssueHoverCardProps> = ({ issueKey, jiraBaseUrl, settings, children }) => {
    const [details, setDetails] = useState<{ summary: string; status: string; assignee: string; description: string; projectName: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout>();

    const handleMouseEnter = (e: React.MouseEvent) => {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) {
            setPosition({ x: rect.left, y: rect.bottom + 5 });
        }
        
        timeoutRef.current = setTimeout(() => {
            setIsVisible(true);
            if (!details) {
                loadDetails();
            }
        }, 500); // 500ms delay before showing
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
                setDetails({
                    summary: data.summary,
                    status: data.status || 'Unknown',
                    assignee: data.assignee || 'Unknown',
                    description: data.description,
                    projectName: data.projectName
                });
            }
        } catch (error) {
            console.error("Failed to load issue details", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative inline-block" ref={triggerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            {children}
            {isVisible && (
                <div 
                    className="fixed z-50 w-80 p-4 rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                    style={{ 
                        top: position.y, 
                        left: position.x,
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-outline-variant)',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    {isLoading ? (
                        <div className="flex flex-col gap-2 animate-pulse">
                            <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                            <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
                            <div className="h-16 w-full bg-gray-200 dark:bg-gray-700 rounded mt-2" />
                        </div>
                    ) : details ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                                <h4 className="font-semibold text-sm leading-tight" style={{ color: 'var(--color-on-surface)' }}>
                                    {details.summary}
                                </h4>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100 font-medium shrink-0">
                                    {issueKey}
                                </span>
                            </div>
                            <div className="text-xs line-clamp-4" style={{ color: 'var(--color-on-surface-variant)' }}>
                                {details.description || "Açıklama yok."}
                            </div>
                            <div className="pt-2 mt-1 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-[10px] text-gray-500">
                                <span>{details.projectName}</span>
                                <a 
                                    href={`${jiraBaseUrl}/browse/${issueKey}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="hover:underline text-blue-500"
                                >
                                    Jira'da Aç →
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs text-red-500">Detaylar yüklenemedi.</div>
                    )}
                </div>
            )}
        </div>
    );
};
