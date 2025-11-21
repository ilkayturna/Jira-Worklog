import React, { useState, useEffect } from 'react';
import { Worklog, LoadingState } from '../types';
import { Clock, Edit2, Wand2, SpellCheck, Undo2, Check, X } from 'lucide-react';
import { parseSmartTimeInput } from '../utils/adf';

interface Props {
  worklogs: Worklog[];
  loading: LoadingState;
  onUpdate: (id: string, comment?: string, hours?: number) => Promise<void>;
  onImprove: (id: string) => Promise<void>;
  onSpellCheck: (id: string) => Promise<void>;
}

const getHourColor = (hours: number) => {
    if (hours >= 5.5) return 'bg-red-500';
    if (hours >= 3.5) return 'bg-amber-500';
    if (hours >= 1.5) return 'bg-emerald-500';
    return 'bg-blue-500';
};

const WorklogRow: React.FC<{ 
    wl: Worklog; 
    onUpdate: (id: string, comment?: string, hours?: number) => Promise<void>;
    onImprove: (id: string) => Promise<void>;
    onSpellCheck: (id: string) => Promise<void>;
}> = ({ wl, onUpdate, onImprove, onSpellCheck }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editComment, setEditComment] = useState(wl.comment);
    const [isProcessing, setIsProcessing] = useState(false);
    const [timeStr, setTimeStr] = useState(wl.hours.toFixed(2));
    const [isTimeEditing, setIsTimeEditing] = useState(false);

    // Sync external updates
    useEffect(() => {
        if (!isEditing) setEditComment(wl.comment);
    }, [wl.comment, isEditing]);

    useEffect(() => {
        if (!isTimeEditing) setTimeStr(wl.hours.toFixed(2));
    }, [wl.hours, isTimeEditing]);

    const handleSaveComment = async () => {
        setIsProcessing(true);
        await onUpdate(wl.id, editComment);
        setIsProcessing(false);
        setIsEditing(false);
    };

    const handleSaveTime = async () => {
        const parsed = parseSmartTimeInput(timeStr);
        if (parsed && parsed !== wl.hours) {
            setIsProcessing(true);
            await onUpdate(wl.id, undefined, Math.round(parsed * 3600));
            setIsProcessing(false);
        } else {
            setTimeStr(wl.hours.toFixed(2));
        }
        setIsTimeEditing(false);
    };

    const handleImprove = async () => {
        setIsProcessing(true);
        await onImprove(wl.id);
        setIsProcessing(false);
    }

    const handleSpellCheck = async () => {
        setIsProcessing(true);
        await onSpellCheck(wl.id);
        setIsProcessing(false);
    }

    return (
        <div className={`group relative bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-all ${isProcessing ? 'opacity-70 pointer-events-none' : ''}`}>
            {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50 dark:bg-slate-900/50 rounded-lg">
                    <div className="w-5 h-5 border-2 border-jira-blue border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
            
            <div className="flex justify-between items-start mb-3 gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <a 
                            href="#" 
                            className="font-bold text-jira-blue hover:underline text-sm"
                            onClick={(e) => e.preventDefault()} // Prevent default since we don't have real URL in demo
                        >
                            {wl.issueKey}
                        </a>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 truncate max-w-[200px]">
                            {wl.summary}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                     {/* Time Editor */}
                    <div className="flex items-center">
                        {isTimeEditing ? (
                            <input
                                value={timeStr}
                                onChange={(e) => setTimeStr(e.target.value)}
                                onBlur={handleSaveTime}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveTime()}
                                autoFocus
                                className="w-16 px-1 py-0.5 text-center text-sm font-mono font-bold bg-slate-100 dark:bg-slate-900 border border-jira-blue rounded"
                            />
                        ) : (
                            <button 
                                onClick={() => setIsTimeEditing(true)}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <div className={`w-2.5 h-2.5 rounded-full ${getHourColor(wl.hours)}`}></div>
                                <span className="font-mono font-bold text-sm text-slate-700 dark:text-slate-300">{wl.hours.toFixed(2)}h</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Comment Section */}
            <div className="relative">
                {isEditing ? (
                    <div className="space-y-2">
                        <textarea
                            value={editComment}
                            onChange={(e) => setEditComment(e.target.value)}
                            className="w-full min-h-[80px] p-3 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-jira-blue focus:border-transparent"
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsEditing(false)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16}/></button>
                            <button onClick={handleSaveComment} className="p-1.5 rounded text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"><Check size={16}/></button>
                        </div>
                    </div>
                ) : (
                    <div 
                        onClick={() => setIsEditing(true)}
                        className="p-3 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer transition-colors whitespace-pre-wrap leading-relaxed"
                    >
                        {wl.comment || <span className="italic text-slate-400">No comment provided...</span>}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button 
                    onClick={handleImprove}
                    disabled={!wl.comment}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Wand2 size={12} /> AI Improve
                </button>
                <button 
                    onClick={handleSpellCheck}
                    disabled={!wl.comment}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <SpellCheck size={12} /> Spell Fix
                </button>
            </div>
        </div>
    );
};

export const WorklogList: React.FC<Props> = ({ worklogs, loading, onUpdate, onImprove, onSpellCheck }) => {
    if (loading === LoadingState.LOADING) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-32 bg-slate-100 dark:bg-slate-850 rounded-lg animate-pulse border border-slate-200 dark:border-slate-700"></div>
                ))}
            </div>
        );
    }

    if (worklogs.length === 0) {
        return (
            <div className="text-center py-12 bg-slate-100 dark:bg-slate-850/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                <div className="bg-slate-200 dark:bg-slate-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Clock className="text-slate-400" />
                </div>
                <h3 className="text-slate-900 dark:text-slate-100 font-medium">No worklogs found</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Try changing the date or check your Jira connection.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {worklogs.map(wl => (
                <WorklogRow 
                    key={wl.id} 
                    wl={wl} 
                    onUpdate={onUpdate}
                    onImprove={onImprove}
                    onSpellCheck={onSpellCheck}
                />
            ))}
        </div>
    );
};