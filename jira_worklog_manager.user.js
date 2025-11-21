// ==UserScript==
// @name         Jira Worklog Manager Pro (React Edition)
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  A modern, standalone React application to manage Jira worklogs with AI-powered improvements.
// @match        https://*.atlassian.net/*
// @grant        none
// @run-at       document-body
// @require      https://unpkg.com/react@18/umd/react.production.min.js
// @require      https://unpkg.com/react-dom@18/umd/react-dom.production.min.js
// @require      https://unpkg.com/@babel/standalone/babel.min.js
// ==/UserScript==

(function() {
    'use strict';

    // 1. Inject Tailwind CSS
    const tailwindScript = document.createElement('script');
    tailwindScript.src = "https://cdn.tailwindcss.com";
    tailwindScript.onload = () => {
        // Configure Tailwind
        window.tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        slate: { 850: '#151f2e', 900: '#0f172a' },
                        jira: { blue: '#0052CC', darkBlue: '#172B4D' }
                    },
                    animation: { 'spin-slow': 'spin 3s linear infinite' }
                }
            }
        };
        mountApplication();
    };
    document.head.appendChild(tailwindScript);

    // 2. Define the Application Code (Wrapped in Babel for JSX support)
    function mountApplication() {
        const appContainer = document.createElement('div');
        appContainer.id = 'jira-worklog-root';
        // Ensure it sits on top of Jira
        appContainer.style.position = 'fixed';
        appContainer.style.inset = '0';
        appContainer.style.zIndex = '99999';
        appContainer.style.overflow = 'auto';
        appContainer.style.backgroundColor = 'rgba(0,0,0,0.5)'; // Initial backdrop
        appContainer.style.display = 'none'; // Hidden by default
        document.body.appendChild(appContainer);

        // Create a toggle button in Jira UI
        const toggleBtn = document.createElement('button');
        toggleBtn.innerText = 'Worklogs';
        toggleBtn.style.position = 'fixed';
        toggleBtn.style.bottom = '20px';
        toggleBtn.style.right = '20px';
        toggleBtn.style.zIndex = '100000';
        toggleBtn.style.padding = '10px 20px';
        toggleBtn.style.backgroundColor = '#0052CC';
        toggleBtn.style.color = 'white';
        toggleBtn.style.border = 'none';
        toggleBtn.style.borderRadius = '5px';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.fontWeight = 'bold';
        toggleBtn.onclick = () => {
             const root = document.getElementById('jira-worklog-root');
             if(root.style.display === 'none') {
                 root.style.display = 'block';
             } else {
                 root.style.display = 'none';
             }
        };
        document.body.appendChild(toggleBtn);

        const script = document.createElement('script');
        script.type = 'text/babel';
        script.textContent = `
            // --- CONSTANTS & UTILS ---
            const { useState, useEffect, useMemo, useRef } = React;
            const APP_NAME = 'WorklogPro';
            const DEFAULT_SYSTEM_PROMPT = "Sen, kıdemli bir SAP Business One (SAP B1) danışmanısın. Görevin, teknik ve kısa tutulmuş 'worklog' notlarını alıp, bu notları müşterinin anlayabileceği, yapılan işin kapsamını ve değerini gösteren, profesyonel ve detaylı bir metne dönüştürmektir.";

            const LoadingState = {
                IDLE: 'IDLE',
                LOADING: 'LOADING',
                ERROR: 'ERROR',
                SUCCESS: 'SUCCESS'
            };

            // --- ICON COMPONENTS (Replaces Lucide dependency) ---
            const IconBase = ({ children, size = 24, className = "" }) => (
                <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
            );
            const XIcon = (p) => <IconBase {...p}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></IconBase>;
            const Save = (p) => <IconBase {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></IconBase>;
            const RefreshCw = (p) => <IconBase {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></IconBase>;
            const Globe = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></IconBase>;
            const Clock = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></IconBase>;
            const Edit2 = (p) => <IconBase {...p}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></IconBase>;
            const Wand2 = (p) => <IconBase {...p}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><circle cx="11" cy="11" r="1"/></IconBase>;
            const SpellCheck = (p) => <IconBase {...p}><path d="m6 16 6-12 6 12"/><path d="M8 12h8"/><path d="M16 20V4"/><path d="m12 16 4 4"/></IconBase>;
            const Check = (p) => <IconBase {...p}><polyline points="20 6 9 17 4 12"/></IconBase>;
            const Settings = (p) => <IconBase {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></IconBase>;
            const Moon = (p) => <IconBase {...p}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></IconBase>;
            const Sun = (p) => <IconBase {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></IconBase>;
            const CalendarIcon = (p) => <IconBase {...p}><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></IconBase>;
            const CheckCircle2 = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></IconBase>;
            const AlertCircle = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></IconBase>;
            const Info = (p) => <IconBase {...p}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></IconBase>;
            const ChevronLeft = (p) => <IconBase {...p}><path d="m15 18-6-6 6-6"/></IconBase>;
            const ChevronRight = (p) => <IconBase {...p}><path d="m9 18 6-6-6-6"/></IconBase>;
            const Copy = (p) => <IconBase {...p}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></IconBase>;
            const Sparkles = (p) => <IconBase {...p}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 5H1"/></IconBase>;

            // --- UTILS/ADF.TS ---

            function extractTextFromADF(node, result = []) {
                if (!node) return '';
                if (typeof node === 'string') {
                    result.push(node);
                } else if (node && typeof node === 'object') {
                    if (node.text) result.push(String(node.text));
                    if (Array.isArray(node.content)) {
                        node.content.forEach((item) => extractTextFromADF(item, result));
                    }
                    if (node.type === 'hardBreak' || node.type === 'paragraph') {
                        result.push(' ');
                    }
                }
                return result.join('').trim();
            }

            function parseJiraComment(comment) {
                if (!comment) return '';
                if (typeof comment === 'string') return comment.trim();
                try {
                    if (comment.type === 'doc' || Array.isArray(comment.content)) {
                        return extractTextFromADF(comment);
                    }
                    if (comment.text) return String(comment.text).trim();
                    return JSON.stringify(comment);
                } catch (e) {
                    return String(comment);
                }
            }

            function plainTextToADF(text) {
                if (!text || typeof text !== 'string') return null;
                const trimmed = text.trim();
                if (!trimmed) return null;
                const paragraphs = trimmed.split(/\\n\\n+/).filter(p => p.trim().length > 0);
                if (paragraphs.length === 0) paragraphs.push(trimmed);
                const content = paragraphs.map(para => {
                    const lines = para.split('\\n').filter(l => l.trim().length > 0);
                    const paraContent = [];
                    lines.forEach((line, idx) => {
                        if (line.trim().length > 0) {
                            paraContent.push({ type: 'text', text: line.trim() });
                        }
                        if (idx < lines.length - 1) {
                            paraContent.push({ type: 'hardBreak' });
                        }
                    });
                    return {
                        type: 'paragraph',
                        content: paraContent.length > 0 ? paraContent : [{ type: 'text', text: para.trim() }]
                    };
                });
                return { type: 'doc', version: 1, content };
            }

            function secondsToHours(seconds) {
                const minutes = Math.round(seconds / 60);
                const hours = minutes / 60;
                return Math.round(hours * 100) / 100;
            }

            function parseSmartTimeInput(input) {
                if (!input) return null;
                const str = input.trim().toLowerCase();
                const hm = /^(\\d+(?:\\.\\d+)?)\\s*h\\s*(?:(\\d+(?:\\.\\d+)?)\\s*m)?$/.exec(str);
                if (hm) {
                    const hours = parseFloat(hm[1]);
                    const minutes = hm[2] ? parseFloat(hm[2]) : 0;
                    return hours + minutes / 60;
                }
                const m = /^(\\d+(?:\\.\\d+)?)\\s*m$/.exec(str);
                if (m) return parseFloat(m[1]) / 60;
                const colon = /^(\\d+):(\\d{2})$/.exec(str);
                if (colon) return parseInt(colon[1]) + parseInt(colon[2]) / 60;
                const decimal = /^(\\d+(?:\\.\\d+)?)$/.exec(str);
                if (decimal) return parseFloat(decimal[1]);
                return null;
            }

            // --- SERVICES/API.TS ---

            const getAuthHeader = (email, token) => 'Basic ' + btoa(email + ':' + token);

            const normalizeUrl = (url) => {
                let normalized = url.trim().replace(/\\/$/, '');
                if (normalized && !normalized.startsWith('http')) {
                    normalized = 'https://' + normalized;
                }
                return normalized;
            }

            const buildUrl = (jiraUrl, endpoint, proxy) => {
                const normalizedJira = normalizeUrl(jiraUrl);
                const fullUrl = normalizedJira + endpoint;
                if (proxy) return proxy + fullUrl;
                return fullUrl;
            };

            const fetchWorklogs = async (date, settings) => {
                if (!settings.jiraUrl || !settings.jiraEmail || !settings.jiraToken) {
                    throw new Error("Missing Jira Credentials: Check Settings");
                }
                const jql = 'worklogDate = "' + date + '" AND worklogAuthor = currentUser()';
                const requestUrl = buildUrl(settings.jiraUrl, '/rest/api/3/search?jql=' + encodeURIComponent(jql) + '&fields=worklog,key,summary&maxResults=100', settings.corsProxy);
                let response;
                try {
                    response = await fetch(requestUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    });
                } catch (error) {
                    if (error instanceof TypeError) throw new Error("Network Request Failed. Ensure you have configured a CORS Proxy in settings (e.g., https://corsproxy.io/?).");
                    throw error;
                }
                if (!response.ok) {
                    let errText = '';
                    try { errText = await response.text(); } catch(e) {}
                    throw new Error("Jira API Error (" + response.status + "): " + (errText || response.statusText));
                }
                const data = await response.json();
                const allWorklogs = [];
                const promises = data.issues.map(async (issue) => {
                    try {
                        const wlRequestUrl = buildUrl(settings.jiraUrl, '/rest/api/3/issue/' + issue.key + '/worklog', settings.corsProxy);
                        const wlResponse = await fetch(wlRequestUrl, {
                            headers: {
                                'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
                                'Accept': 'application/json',
                                'X-Requested-With': 'XMLHttpRequest'
                            }
                        });
                        if (!wlResponse.ok) return;
                        const wlData = await wlResponse.json();
                        wlData.worklogs.forEach((wl) => {
                            const wlStartedDate = wl.started.split('T')[0];
                            if (wlStartedDate === date) {
                                allWorklogs.push({
                                    id: wl.id,
                                    issueKey: issue.key,
                                    summary: issue.fields?.summary || '',
                                    seconds: wl.timeSpentSeconds,
                                    hours: secondsToHours(wl.timeSpentSeconds),
                                    comment: parseJiraComment(wl.comment),
                                    started: wl.started,
                                    author: wl.author?.displayName,
                                    originalADF: wl.comment
                                });
                            }
                        });
                    } catch (e) { console.error(e); }
                });
                await Promise.all(promises);
                return allWorklogs;
            };

            const updateWorklog = async (wl, settings, newComment, newSeconds) => {
                const body = {
                    started: wl.started,
                    timeSpentSeconds: newSeconds !== undefined ? newSeconds : wl.seconds
                };
                if (newComment !== undefined) {
                    const adf = plainTextToADF(newComment);
                    if (adf) body.comment = adf;
                } else if (wl.originalADF) {
                    body.comment = wl.originalADF;
                }
                const requestUrl = buildUrl(settings.jiraUrl, '/rest/api/3/issue/' + wl.issueKey + '/worklog/' + wl.id, settings.corsProxy);
                const response = await fetch(requestUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify(body)
                });
                if (!response.ok) throw new Error("Failed to update worklog (" + response.status + ")");
            };

            const createWorklog = async (issueKey, dateStr, seconds, comment, settings) => {
                const started = dateStr + "T09:00:00.000+0000";
                const body = {
                    timeSpentSeconds: seconds,
                    started: started,
                    comment: plainTextToADF(comment)
                };
                const requestUrl = buildUrl(settings.jiraUrl, '/rest/api/3/issue/' + issueKey + '/worklog', settings.corsProxy);
                const response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': getAuthHeader(settings.jiraEmail, settings.jiraToken),
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify(body)
                });
                if(!response.ok) throw new Error("Failed to create worklog");
            };

            const callGroq = async (prompt, settings, maxTokens = 300) => {
                if (!settings.groqApiKey) throw new Error("Groq API Key missing");
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + settings.groqApiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: settings.groqModel || 'llama-3.3-70b-versatile',
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: maxTokens,
                        temperature: 0.3
                    })
                });
                if (!response.ok) throw new Error("Groq API failed");
                const json = await response.json();
                return json.choices?.[0]?.message?.content || '';
            };

            // --- COMPONENTS ---

            const Modal = ({ isOpen, onClose, title, children, className = '' }) => {
                const modalRef = useRef(null);
                useEffect(() => {
                    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
                    if (isOpen) {
                        document.addEventListener('keydown', handleEsc);
                        document.body.style.overflow = 'hidden';
                    }
                    return () => {
                        document.removeEventListener('keydown', handleEsc);
                        document.body.style.overflow = 'unset';
                    };
                }, [isOpen, onClose]);
                if (!isOpen) return null;
                return (
                    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div ref={modalRef} className={"bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col " + className} onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 rounded-t-xl shrink-0">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
                                <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"><XIcon size={20} /></button>
                            </div>
                            <div className="p-6 overflow-y-auto">{children}</div>
                        </div>
                    </div>
                );
            };

            const SettingsModal = ({ isOpen, onClose, settings, onSave }) => {
                const [formData, setFormData] = useState(settings);
                const handleChange = (e) => {
                    const { name, value, type, checked } = e.target;
                    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
                };
                return (
                    <Modal isOpen={isOpen} onClose={onClose} title="Settings & API Configuration">
                        <div className="space-y-6">
                            <section className="space-y-4 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm font-bold text-jira-blue uppercase tracking-wider border-b pb-2">Jira Connection</h3>
                                <div className="grid gap-4">
                                    <div><label className="text-xs font-medium text-slate-500">Jira URL</label><input name="jiraUrl" value={formData.jiraUrl} onChange={handleChange} placeholder="https://company.atlassian.net" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-md text-sm"/></div>
                                    <div><label className="text-xs font-medium text-slate-500">Email</label><input name="jiraEmail" value={formData.jiraEmail} onChange={handleChange} placeholder="you@company.com" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-md text-sm"/></div>
                                    <div><label className="text-xs font-medium text-slate-500">Token</label><input name="jiraToken" type="password" value={formData.jiraToken} onChange={handleChange} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-md text-sm"/></div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1"><Globe size={12}/><label className="text-xs font-medium text-slate-500">CORS Proxy</label></div>
                                        <input name="corsProxy" value={formData.corsProxy} onChange={handleChange} placeholder="e.g. https://corsproxy.io/?" className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-md text-sm"/>
                                        <p className="text-[10px] text-slate-400 mt-1">Required for direct API access.</p>
                                    </div>
                                </div>
                            </section>
                            <section className="space-y-4 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm font-bold text-purple-500 uppercase tracking-wider border-b pb-2">AI (Groq)</h3>
                                <div className="grid gap-4">
                                    <div><label className="text-xs font-medium text-slate-500">API Key</label><input name="groqApiKey" type="password" value={formData.groqApiKey} onChange={handleChange} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-md text-sm"/></div>
                                    <div><label className="text-xs font-medium text-slate-500">System Prompt</label><textarea name="aiSystemPrompt" value={formData.aiSystemPrompt} onChange={handleChange} rows={3} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-md text-xs font-mono"/></div>
                                </div>
                            </section>
                            <section className="space-y-4 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-wider border-b pb-2">Preferences</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-medium text-slate-500">Daily Target (h)</label><input name="targetDailyHours" type="number" step="0.25" value={formData.targetDailyHours} onChange={handleChange} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-md text-sm"/></div>
                                    <div><label className="text-xs font-medium text-slate-500">Min Worklog (h)</label><input name="minHoursPerWorklog" type="number" step="0.25" value={formData.minHoursPerWorklog} onChange={handleChange} className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-md text-sm"/></div>
                                </div>
                            </section>
                            <div className="flex justify-end gap-3 pt-4">
                                <button onClick={onClose} className="px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">Cancel</button>
                                <button onClick={() => onSave(formData)} className="px-4 py-2 rounded-lg bg-jira-blue text-white font-medium text-sm flex items-center gap-2"><Save size={16}/> Save</button>
                            </div>
                        </div>
                    </Modal>
                );
            };

            const WorklogRow = ({ wl, onUpdate, onImprove, onSpellCheck }) => {
                const [isEditing, setIsEditing] = useState(false);
                const [editComment, setEditComment] = useState(wl.comment);
                const [isProcessing, setIsProcessing] = useState(false);
                const [timeStr, setTimeStr] = useState(wl.hours.toFixed(2));
                const [isTimeEditing, setIsTimeEditing] = useState(false);
                useEffect(() => { if (!isEditing) setEditComment(wl.comment); }, [wl.comment, isEditing]);
                useEffect(() => { if (!isTimeEditing) setTimeStr(wl.hours.toFixed(2)); }, [wl.hours, isTimeEditing]);

                const handleSave = async () => {
                    setIsProcessing(true);
                    await onUpdate(wl.id, editComment);
                    setIsProcessing(false);
                    setIsEditing(false);
                };
                const handleTimeSave = async () => {
                    const parsed = parseSmartTimeInput(timeStr);
                    if (parsed && parsed !== wl.hours) {
                        setIsProcessing(true);
                        await onUpdate(wl.id, undefined, Math.round(parsed * 3600));
                        setIsProcessing(false);
                    } else setTimeStr(wl.hours.toFixed(2));
                    setIsTimeEditing(false);
                };
                const getHourColor = (h) => h >= 5.5 ? 'bg-red-500' : h >= 3.5 ? 'bg-amber-500' : h >= 1.5 ? 'bg-emerald-500' : 'bg-blue-500';

                return (
                    <div className={"group relative bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-all " + (isProcessing ? 'opacity-70 pointer-events-none' : '')}>
                        {isProcessing && <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/50 dark:bg-slate-900/50 rounded-lg"><div className="w-5 h-5 border-2 border-jira-blue border-t-transparent rounded-full animate-spin"></div></div>}
                        <div className="flex justify-between items-start mb-3 gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-jira-blue text-sm">{wl.issueKey}</span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 truncate max-w-[200px]">{wl.summary}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {isTimeEditing ? (
                                    <input value={timeStr} onChange={(e) => setTimeStr(e.target.value)} onBlur={handleTimeSave} onKeyDown={(e) => e.key === 'Enter' && handleTimeSave()} autoFocus className="w-16 px-1 py-0.5 text-center text-sm font-mono font-bold bg-slate-100 dark:bg-slate-900 border border-jira-blue rounded"/>
                                ) : (
                                    <button onClick={() => setIsTimeEditing(true)} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                        <div className={"w-2.5 h-2.5 rounded-full " + getHourColor(wl.hours)}></div>
                                        <span className="font-mono font-bold text-sm text-slate-700 dark:text-slate-300">{wl.hours.toFixed(2)}h</span>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="relative">
                            {isEditing ? (
                                <div className="space-y-2">
                                    <textarea value={editComment} onChange={(e) => setEditComment(e.target.value)} className="w-full min-h-[80px] p-3 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md"/>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setIsEditing(false)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100"><XIcon size={16}/></button>
                                        <button onClick={handleSave} className="p-1.5 rounded text-emerald-500 hover:bg-emerald-50"><Check size={16}/></button>
                                    </div>
                                </div>
                            ) : (
                                <div onClick={() => setIsEditing(true)} className="p-3 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-transparent hover:border-slate-200 cursor-pointer whitespace-pre-wrap leading-relaxed">
                                    {wl.comment || <span className="italic text-slate-400">No comment...</span>}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={async () => { setIsProcessing(true); await onImprove(wl.id); setIsProcessing(false); }} disabled={!wl.comment} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 bg-purple-50 rounded hover:bg-purple-100"><Wand2 size={12}/> AI</button>
                            <button onClick={async () => { setIsProcessing(true); await onSpellCheck(wl.id); setIsProcessing(false); }} disabled={!wl.comment} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100"><SpellCheck size={12}/> Spell</button>
                        </div>
                    </div>
                );
            };

            // --- MAIN APP COMPONENT ---

            const App = () => {
                const [settings, setSettings] = useState({
                    jiraUrl: localStorage.getItem(APP_NAME + '_jiraUrl') || '',
                    jiraEmail: localStorage.getItem(APP_NAME + '_jiraEmail') || '',
                    jiraToken: localStorage.getItem(APP_NAME + '_jiraToken') || '',
                    corsProxy: localStorage.getItem(APP_NAME + '_corsProxy') || '',
                    groqApiKey: localStorage.getItem(APP_NAME + '_groqApiKey') || '',
                    groqModel: localStorage.getItem(APP_NAME + '_groqModel') || 'llama-3.3-70b-versatile',
                    targetDailyHours: parseFloat(localStorage.getItem(APP_NAME + '_targetDailyHours') || '8'),
                    minHoursPerWorklog: parseFloat(localStorage.getItem(APP_NAME + '_minHours') || '0.25'),
                    aiSystemPrompt: localStorage.getItem(APP_NAME + '_aiPrompt') || DEFAULT_SYSTEM_PROMPT,
                    isDarkTheme: localStorage.getItem(APP_NAME + '_theme') !== 'light',
                });
                const [isSettingsOpen, setIsSettingsOpen] = useState(false);
                const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
                const [worklogs, setWorklogs] = useState([]);
                const [loadingState, setLoadingState] = useState(LoadingState.IDLE);
                const [notifications, setNotifications] = useState([]);

                const totalHours = useMemo(() => worklogs.reduce((acc, wl) => acc + wl.hours, 0), [worklogs]);
                const progress = Math.min((totalHours / settings.targetDailyHours) * 100, 100);
                const isTargetMet = totalHours >= settings.targetDailyHours;

                useEffect(() => {
                     const root = document.getElementById('jira-worklog-root');
                     if(root) root.className = settings.isDarkTheme ? 'dark' : '';
                }, [settings.isDarkTheme]);

                useEffect(() => {
                    if(settings.jiraUrl && settings.jiraToken && settings.jiraEmail) loadData();
                }, [selectedDate]);

                const notify = (title, message, type = 'info') => {
                    const id = Date.now().toString();
                    setNotifications(prev => [...prev, { id, title, message, type }]);
                    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
                };

                const saveSettings = (newSettings) => {
                    setSettings(newSettings);
                    Object.entries(newSettings).forEach(([key, value]) => localStorage.setItem(APP_NAME + '_' + key, String(value)));
                    setIsSettingsOpen(false);
                    notify('Settings Saved', 'Configuration updated.', 'success');
                    if (newSettings.jiraUrl && newSettings.jiraEmail && newSettings.jiraToken) loadData(newSettings);
                };

                const loadData = async (currentSettings = settings) => {
                    if (!currentSettings.jiraUrl || !currentSettings.jiraEmail || !currentSettings.jiraToken) return;
                    setLoadingState(LoadingState.LOADING);
                    try {
                        const data = await fetchWorklogs(selectedDate, currentSettings);
                        setWorklogs(data);
                        setLoadingState(LoadingState.SUCCESS);
                    } catch (e) {
                        setLoadingState(LoadingState.ERROR);
                        notify('Error', e.message, 'error');
                        if(e.message.includes('Credentials') || e.message.includes('Network')) setIsSettingsOpen(true);
                    }
                };

                const handleUpdateWorklog = async (id, comment, seconds) => {
                    const wl = worklogs.find(w => w.id === id);
                    if (!wl) return;
                    try {
                        await updateWorklog(wl, settings, comment, seconds);
                        setWorklogs(prev => prev.map(w => {
                            if(w.id !== id) return w;
                            return { ...w, comment: comment !== undefined ? comment : w.comment, seconds: seconds !== undefined ? seconds : w.seconds, hours: seconds !== undefined ? secondsToHours(seconds) : w.hours };
                        }));
                        notify('Updated', 'Worklog updated.', 'success');
                    } catch (e) { notify('Failed', e.message, 'error'); }
                };

                const handleAIAction = async (id, mode) => {
                    const wl = worklogs.find(w => w.id === id);
                    if(!wl || !wl.comment) return;
                    if (!settings.groqApiKey) { notify('AI Error', 'Groq Key missing', 'error'); setIsSettingsOpen(true); return; }
                    try {
                        let prompt = mode === 'IMPROVE' ? ("CONTEXT: Issue Summary: " + wl.summary + ". TASK: " + settings.aiSystemPrompt + " INPUT: " + wl.comment + " OUTPUT: Improved text only.") : ("TASK: Fix spelling. INPUT: " + wl.comment + " OUTPUT: Fixed text only.");
                        const improved = await callGroq(prompt, settings);
                        if (improved && improved.trim() !== wl.comment) await handleUpdateWorklog(id, improved.trim());
                        else notify('AI Info', 'No changes suggested.', 'info');
                    } catch (e) { notify('AI Failed', e.message, 'error'); }
                };

                const handleDistribute = async () => {
                    if (loadingState === LoadingState.LOADING) return;
                    const currentTotal = worklogs.reduce((sum, wl) => sum + wl.hours, 0);
                    const target = settings.targetDailyHours;
                    const diff = target - currentTotal;
                    if (Math.abs(diff) < 0.05) { notify('Target Met', 'Hours distributed.', 'success'); return; }
                    notify('Distributing', 'Calculating...', 'info');
                    const distributable = [...worklogs];
                    if(distributable.length === 0) return;
                    const diffSeconds = Math.round(diff * 3600);
                    const secondsPerLog = Math.floor(diffSeconds / distributable.length);
                    try {
                        const promises = distributable.map(async (wl, index) => {
                            const extra = index === 0 ? (diffSeconds % distributable.length) : 0;
                            const newSeconds = Math.max(Math.round(settings.minHoursPerWorklog * 3600), wl.seconds + secondsPerLog + extra);
                            if (newSeconds !== wl.seconds) await updateWorklog(wl, settings, undefined, newSeconds);
                        });
                        await Promise.all(promises);
                        await loadData();
                        notify('Distributed', 'Time distributed.', 'success');
                    } catch (e) { notify('Error', e.message, 'error'); }
                };

                const copyPreviousDay = async () => {
                    const date = new Date(selectedDate);
                    date.setDate(date.getDate() - 1);
                    if (date.getDay() === 0) date.setDate(date.getDate() - 2);
                    const prevDateStr = date.toISOString().split('T')[0];
                    notify('Copying', 'Fetching ' + prevDateStr + '...', 'info');
                    try {
                        const prevLogs = await fetchWorklogs(prevDateStr, settings);
                        if (prevLogs.length === 0) { notify('No Logs', 'No worklogs found yesterday.', 'warning'); return; }
                        const promises = prevLogs.map(wl => createWorklog(wl.issueKey, selectedDate, wl.seconds, wl.comment, settings));
                        await Promise.all(promises);
                        await loadData();
                        notify('Success', 'Copied ' + prevLogs.length + ' worklogs.', 'success');
                    } catch (e) { notify('Copy Failed', e.message, 'error'); }
                };

                const changeDate = (days) => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + days);
                    setSelectedDate(d.toISOString().split('T')[0]);
                };

                return (
                    <div className={"min-h-screen w-full flex flex-col items-center py-8 px-4 font-sans text-slate-900 dark:text-slate-100 " + (settings.isDarkTheme ? 'bg-slate-900' : 'bg-slate-50')}>
                        <div className="w-full max-w-4xl space-y-6">
                            {/* HEADER */}
                            <header className="flex items-center justify-between bg-white dark:bg-slate-850 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="bg-jira-blue p-2 rounded-lg"><CalendarIcon className="text-white" size={24} /></div>
                                    <div><h1 className="text-xl font-bold tracking-tight">Worklog Manager Pro</h1><p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Jira Edition</p></div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setSettings(s => ({...s, isDarkTheme: !s.isDarkTheme}))} className="p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">{settings.isDarkTheme ? <Sun size={20}/> : <Moon size={20}/>}</button>
                                    <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><Settings size={20} /></button>
                                    <button onClick={() => document.getElementById('jira-worklog-root').style.display = 'none'} className="p-2.5 text-red-500 hover:bg-red-100 rounded-lg"><XIcon size={20}/></button>
                                </div>
                            </header>
                            {/* DASHBOARD */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-1 space-y-6">
                                    <div className="bg-white dark:bg-slate-850 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Active Date</label>
                                        <div className="flex items-center gap-2 mb-4">
                                            <button onClick={() => changeDate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><ChevronLeft size={18}/></button>
                                            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-center font-mono text-sm font-bold"/>
                                            <button onClick={() => changeDate(1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><ChevronRight size={18}/></button>
                                        </div>
                                    </div>
                                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-xl shadow-lg text-white relative overflow-hidden">
                                        <div className="relative z-10">
                                            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Daily Progress</span>
                                            <div className="flex items-baseline gap-1 mt-2 mb-4"><span className="text-4xl font-extrabold tracking-tighter">{totalHours.toFixed(2)}</span><span className="text-slate-400 font-medium">/ {settings.targetDailyHours}h</span></div>
                                            <div className="w-full bg-slate-700/50 h-3 rounded-full overflow-hidden backdrop-blur-sm"><div className={"h-full transition-all duration-1000 ease-out " + (isTargetMet ? 'bg-emerald-500' : 'bg-blue-500')} style={{ width: progress + '%' }}></div></div>
                                            <p className="mt-3 text-xs text-slate-300 flex items-center gap-2">{isTargetMet ? <CheckCircle2 size={14} className="text-emerald-400"/> : <Info size={14} />}{isTargetMet ? 'Target reached!' : (settings.targetDailyHours - totalHours).toFixed(2) + 'h remaining'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
                                        <button onClick={() => loadData()} className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium transition-colors"><RefreshCw size={16} className={loadingState === LoadingState.LOADING ? 'animate-spin' : ''}/> Refresh Data</button>
                                        <button onClick={handleDistribute} className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 text-sm font-medium transition-colors text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50"><Sparkles size={16}/> Smart Distribute</button>
                                        <button onClick={copyPreviousDay} className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-sm font-medium transition-colors"><Copy size={16}/> Copy Yesterday</button>
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-1">
                                        {loadingState === LoadingState.LOADING ? <div className="space-y-4 p-4">{[1,2,3].map(i=><div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>)}</div> :
                                         worklogs.length === 0 ? <div className="text-center py-12"><div className="bg-slate-200 dark:bg-slate-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"><Clock className="text-slate-400"/></div><h3 className="font-medium dark:text-slate-200">No worklogs found</h3></div> :
                                         <div className="space-y-4">{worklogs.map(wl => <WorklogRow key={wl.id} wl={wl} onUpdate={handleUpdateWorklog} onImprove={(id) => handleAIAction(id, 'IMPROVE')} onSpellCheck={(id) => handleAIAction(id, 'SPELL')}/>)}</div>
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onSave={saveSettings}/>
                        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100001] pointer-events-none">
                            {notifications.map(n => (
                                <div key={n.id} className={"pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-2xl border backdrop-blur-md animate-in slide-in-from-right max-w-sm " + (n.type === 'success' ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800' : n.type === 'error' ? 'bg-red-50/90 border-red-200 text-red-800' : 'bg-slate-50/90 border-slate-200')}>
                                    <div><h4 className="text-sm font-bold">{n.title}</h4><p className="text-xs opacity-90">{n.message}</p></div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            };

            const rootElement = document.getElementById('jira-worklog-root');
            if (rootElement) {
                const root = ReactDOM.createRoot(rootElement);
                root.render(<App />);
            }
        `;
        document.body.appendChild(script);
    }
})();
