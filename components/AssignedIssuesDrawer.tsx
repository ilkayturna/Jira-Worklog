import React, { useEffect, useState } from 'react';
import { JiraIssue, AppSettings } from '../types';
import { fetchAssignedIssues } from '../services/api';
import { GripVertical, RefreshCw, AlertCircle } from 'lucide-react';

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

    useEffect(() => {
        if (isOpen) {
            loadIssues();
        }
    }, [isOpen]);

    const loadIssues = async () => {
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
    };

    return (
        <div 
            className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-slate-900 shadow-2xl transform transition-transform duration-300 ease-in-out z-40 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            style={{ borderLeft: '1px solid var(--color-outline-variant)' }}
        >
            <div className="p-4 border-b border-[var(--color-outline-variant)] flex justify-between items-center bg-[var(--color-surface)]">
                <h3 className="font-semibold text-lg" style={{ color: 'var(--color-on-surface)' }}>Bana Atananlar</h3>
                <button onClick={loadIssues} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} style={{ color: 'var(--color-on-surface-variant)' }} />
                </button>
            </div>

            <div className="p-4 overflow-y-auto h-[calc(100vh-60px)] bg-[var(--color-surface-container)]">
                {error && (
                    <div className="p-3 mb-4 rounded-lg bg-red-50 text-red-600 text-sm flex items-center gap-2">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    {issues.map(issue => (
                        <div 
                            key={issue.key}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', JSON.stringify(issue));
                                onDragStart(issue);
                            }}
                            className="p-3 rounded-xl bg-[var(--color-surface)] shadow-sm border border-[var(--color-outline-variant)] cursor-grab active:cursor-grabbing hover:shadow-md transition-all group"
                        >
                            <div className="flex items-start gap-2">
                                <GripVertical size={16} className="mt-1 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{issue.key}</span>
                                        <span className="text-[10px] text-gray-500">{issue.projectName}</span>
                                    </div>
                                    <p className="text-sm font-medium leading-snug line-clamp-2" style={{ color: 'var(--color-on-surface)' }}>
                                        {issue.summary}
                                    </p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                            issue.status === 'In Progress' ? 'bg-blue-100 text-blue-700' : 
                                            issue.status === 'Done' ? 'bg-green-100 text-green-700' : 
                                            'bg-gray-100 text-gray-700'
                                        }`}>
                                            {issue.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {!isLoading && issues.length === 0 && !error && (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            Size atanan açık kayıt bulunamadı.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
