
// ==UserScript==
// @name         Jira Worklog Yöneticisi Pro (Full Türkçe)
// @namespace    http://tampermonkey.net/
// @version      10.2
// @description  Jira workloglarını yönetmek, AI ile iyileştirmek, süreleri akıllı dağıtmak ve geçmişi yönetmek için kapsamlı araç.
// @author       İlkay Turna
// @match        https://*.atlassian.net/*
// @grant        none
// @run-at       document-body
// @require      https://unpkg.com/react@18/umd/react.production.min.js
// @require      https://unpkg.com/react-dom@18/umd/react-dom.production.min.js
// @require      https://unpkg.com/@babel/standalone/babel.min.js
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. KÜTÜPHANELER VE STİLLER ---

    // Tailwind CSS Yükle
    const tailwindScript = document.createElement('script');
    tailwindScript.src = "https://cdn.tailwindcss.com";
    tailwindScript.onload = () => {
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
        injectStyles();
        mountApplication();
    };
    document.head.appendChild(tailwindScript);

    function injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            #jira-worklog-root { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
            #jira-worklog-root ::-webkit-scrollbar { width: 8px; height: 8px; }
            #jira-worklog-root ::-webkit-scrollbar-track { background: transparent; }
            #jira-worklog-root ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            #jira-worklog-root.dark ::-webkit-scrollbar-thumb { background: #475569; }
            #jira-worklog-root ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            .animate-in { animation: fadeIn 0.25s ease-out forwards; }
            .slide-in { animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
            @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        `;
        document.head.appendChild(style);
    }

    // --- 2. REACT UYGULAMASI ---

    function mountApplication() {
        // Kök Element
        const rootDiv = document.createElement('div');
        rootDiv.id = 'jira-worklog-root';
        rootDiv.style.position = 'fixed';
        rootDiv.style.inset = '0';
        rootDiv.style.zIndex = '99999';
        rootDiv.style.display = 'none'; // Başlangıçta gizli
        rootDiv.style.backgroundColor = 'rgba(0,0,0,0.5)';
        rootDiv.style.backdropFilter = 'blur(3px)';
        rootDiv.style.overflowY = 'auto';
        document.body.appendChild(rootDiv);

        // Başlatıcı Buton
        const toggleBtn = document.createElement('button');
        toggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/></svg> Worklogs`;
        Object.assign(toggleBtn.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '100000',
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', backgroundColor: '#0052CC', color: 'white',
            border: 'none', borderRadius: '50px', cursor: 'pointer',
            fontWeight: '600', boxShadow: '0 4px 15px rgba(0,82,204,0.4)',
            transition: 'all 0.2s ease'
        });
        toggleBtn.onclick = () => {
            const el = document.getElementById('jira-worklog-root');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        };
        toggleBtn.onmouseenter = () => toggleBtn.style.transform = 'scale(1.05)';
        toggleBtn.onmouseleave = () => toggleBtn.style.transform = 'scale(1)';
        document.body.appendChild(toggleBtn);

        // React Kod Bloğu
        const script = document.createElement('script');
        script.type = 'text/babel';
        script.textContent = `
            const { useState, useEffect, useMemo, useRef } = React;

            // --- SABİTLER ---
            const APP_NAME = 'WorklogManagerPro';
            const DEFAULT_SYSTEM_PROMPT = "Sen, kıdemli bir SAP Business One (SAP B1) danışmanısın. Görevin, teknik ve kısa tutulmuş 'worklog' notlarını alıp, bu notları müşterinin anlayabileceği, yapılan işin kapsamını ve değerini gösteren, profesyonel ve detaylı bir metne dönüştürmektir. Çıktı Türkçe olmalıdır.";
            const LoadingState = { IDLE: 'IDLE', LOADING: 'YÜKLENİYOR', ERROR: 'HATA', SUCCESS: 'BAŞARILI' };

            // --- IKONLAR (Lucide) ---
            const Icon = ({ children, size=18, className="" }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>;
            const XIcon = (p) => <Icon {...p}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></Icon>;
            const Save = (p) => <Icon {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></Icon>;
            const Refresh = (p) => <Icon {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></Icon>;
            const SettingsIcon = (p) => <Icon {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0 .73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></Icon>;
            const Wand = (p) => <Icon {...p}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><circle cx="11" cy="11" r="1"/></Icon>;
            const Spell = (p) => <Icon {...p}><path d="m6 16 6-12 6 12"/><path d="M8 12h8"/><path d="M16 20V4"/><path d="m12 16 4 4"/></Icon>;
            const Undo = (p) => <Icon {...p}><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></Icon>;
            const Clock = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Icon>;
            const CheckCircle = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></Icon>;
            const AlertCircle = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></Icon>;
            const Moon = (p) => <Icon {...p}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></Icon>;
            const Sun = (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></Icon>;
            const Copy = (p) => <Icon {...p}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></Icon>;
            const ChevronLeft = (p) => <Icon {...p}><path d="m15 18-6-6 6-6"/></Icon>;
            const ChevronRight = (p) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>;
            const Check = (p) => <Icon {...p}><polyline points="20 6 9 17 4 12"/></Icon>;
            const Sparkles = (p) => <Icon {...p}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M9 5H1"/></Icon>;

            // --- YARDIMCI FONKSİYONLAR ---
            const extractText = (node, res=[]) => {
                if(!node) return '';
                if(typeof node==='string') res.push(node);
                else if(typeof node==='object') {
                    if(node.text) res.push(String(node.text));
                    if(Array.isArray(node.content)) node.content.forEach(c=>extractText(c,res));
                    if(node.type==='paragraph' || node.type==='hardBreak') res.push(' ');
                }
                return res.join('').trim();
            };
            const parseComment = (c) => {
                if(!c) return '';
                if(typeof c==='string') return c.trim();
                try {
                    if(c.type==='doc' || Array.isArray(c.content)) return extractText(c);
                    if(c.text) return String(c.text).trim();
                    return JSON.stringify(c);
                } catch(e){ return String(c); }
            };
            const textToADF = (text) => {
                if(!text || typeof text !== 'string') return null;
                const trimmed = text.trim();
                if(!trimmed) return null;
                const paras = trimmed.split(/\\n\\n+/).filter(p=>p.trim().length>0);
                if(paras.length===0) paras.push(trimmed);
                const content = paras.map(p => ({
                    type: 'paragraph',
                    content: p.split('\\n').flatMap((l,i,arr) => {
                        const res = [];
                        if(l.trim()) res.push({type:'text', text:l.trim()});
                        if(i < arr.length-1) res.push({type:'hardBreak'});
                        return res;
                    }).filter(Boolean)
                }));
                return { type: 'doc', version: 1, content };
            };
            const secToHours = (s) => Math.round((s/3600)*100)/100;
            const parseTime = (input) => {
                if(!input) return null;
                const s = input.trim().toLowerCase();
                const hm = /^(\\d+(?:\\.\\d+)?)\\s*h\\s*(?:(\\d+(?:\\.\\d+)?)\\s*m)?$/.exec(s);
                if(hm) return parseFloat(hm[1]) + (hm[2]?parseFloat(hm[2]):0)/60;
                const m = /^(\\d+(?:\\.\\d+)?)\\s*m$/.exec(s);
                if(m) return parseFloat(m[1])/60;
                const col = /^(\\d+):(\\d{2})$/.exec(s);
                if(col) return parseInt(col[1]) + parseInt(col[2])/60;
                const dec = /^(\\d+(?:\\.\\d+)?)$/.exec(s);
                if(dec) return parseFloat(dec[1]);
                return null;
            };

            // --- API KATMANI ---
            const getAuth = (email, token) => 'Basic ' + btoa(email + ':' + token);
            const getBaseUrl = (saved) => {
                if (!saved && window.location.hostname.includes('atlassian.net')) return window.location.origin;
                return saved || '';
            };
            const buildUrl = (base, end) => {
                let b = base.trim().replace(/\\/$/, '');
                if(b && !b.startsWith('http')) b = 'https://' + b;
                return b + end;
            };

            const fetchWorklogs = async (date, set) => {
                const jql = 'worklogDate = "' + date + '" AND worklogAuthor = currentUser()';
                
                // POST metodu ile arama (v3 API) - 410 Gone hatasını çözer
                const url = buildUrl(set.jiraUrl, '/rest/api/3/search');
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 
                        'Authorization': getAuth(set.jiraEmail, set.jiraToken), 
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        jql: jql,
                        fields: ['worklog', 'key', 'summary'],
                        maxResults: 100
                    })
                });
                
                if(!res.ok) {
                    let err = res.statusText;
                    try { err = JSON.stringify(await res.json()); } catch(e){}
                    throw new Error("API Hatası (" + res.status + "): " + err);
                }
                const data = await res.json();
                const results = [];

                await Promise.all(data.issues.map(async (issue) => {
                    try {
                        const wlUrl = buildUrl(set.jiraUrl, '/rest/api/3/issue/' + issue.key + '/worklog');
                        const wlRes = await fetch(wlUrl, { headers: { 'Authorization': getAuth(set.jiraEmail, set.jiraToken), 'Accept': 'application/json' }});
                        if(!wlRes.ok) return;
                        const wlData = await wlRes.json();
                        wlData.worklogs.forEach(wl => {
                            const isMe = wl.author?.emailAddress === set.jiraEmail || wl.author?.accountId;
                            if(wl.started.startsWith(date) && isMe) {
                                results.push({
                                    id: wl.id, issueKey: issue.key, summary: issue.fields.summary,
                                    seconds: wl.timeSpentSeconds, hours: secToHours(wl.timeSpentSeconds),
                                    comment: parseComment(wl.comment), started: wl.started,
                                    originalADF: wl.comment
                                });
                            }
                        });
                    } catch(e){ console.error(e); }
                }));
                return results;
            };

            const updateWorklog = async (wl, set, c, s) => {
                const body = { started: wl.started, timeSpentSeconds: s ?? wl.seconds };
                if(c !== undefined) {
                    const adf = textToADF(c);
                    if(adf) body.comment = adf;
                } else if(wl.originalADF) body.comment = wl.originalADF;
                
                const url = buildUrl(set.jiraUrl, '/rest/api/3/issue/' + wl.issueKey + '/worklog/' + wl.id);
                const res = await fetch(url, {
                    method: 'PUT',
                    headers: { 'Authorization': getAuth(set.jiraEmail, set.jiraToken), 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if(!res.ok) throw new Error("Güncelleme başarısız (" + res.status + ")");
            };

            const createWorklog = async (key, date, sec, comm, set) => {
                const body = { timeSpentSeconds: sec, started: date + "T09:00:00.000+0000", comment: textToADF(comm) };
                const url = buildUrl(set.jiraUrl, '/rest/api/3/issue/' + key + '/worklog');
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Authorization': getAuth(set.jiraEmail, set.jiraToken), 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if(!res.ok) throw new Error("Oluşturma başarısız (" + res.status + ")");
            };

            const callGroq = async (prompt, set) => {
                if(!set.groqApiKey) throw new Error("Groq API Anahtarı eksik!");
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + set.groqApiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: set.groqModel,
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 400, temperature: 0.3
                    })
                });
                if(!res.ok) throw new Error("Yapay Zeka Hatası");
                const json = await res.json();
                return json.choices?.[0]?.message?.content || '';
            };

            // --- BİLEŞENLER ---

            const Modal = ({ isOpen, onClose, title, children }) => {
                const ref = useRef(null);
                useEffect(() => {
                    const esc = (e) => e.key === 'Escape' && onClose();
                    if(isOpen) document.addEventListener('keydown', esc);
                    return () => document.removeEventListener('keydown', esc);
                }, [isOpen]);
                if(!isOpen) return null;
                return (
                    <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in" onClick={onClose}>
                        <div ref={ref} className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e=>e.stopPropagation()}>
                            <div className="flex justify-between items-center p-4 border-b dark:border-slate-700 bg-slate-100 dark:bg-slate-900 rounded-t-xl">
                                <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">{title}</h2>
                                <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"><XIcon size={20}/></button>
                            </div>
                            <div className="p-6 overflow-y-auto">{children}</div>
                        </div>
                    </div>
                );
            };

            const WorklogRow = ({ wl, onUpdate, onImprove, onSpell, onUndo, canUndo }) => {
                const [editing, setEditing] = useState(false);
                const [comment, setComment] = useState(wl.comment);
                const [busy, setBusy] = useState(false);
                const [time, setTime] = useState(wl.hours.toFixed(2));
                const [timeEditing, setTimeEditing] = useState(false);

                useEffect(() => { if(!editing) setComment(wl.comment); }, [wl.comment, editing]);
                useEffect(() => { if(!timeEditing) setTime(wl.hours.toFixed(2)); }, [wl.hours, timeEditing]);

                const saveComment = async () => {
                    setBusy(true);
                    await onUpdate(wl.id, comment);
                    setBusy(false); setEditing(false);
                };
                const saveTime = async () => {
                    const parsed = parseTime(time);
                    if(parsed && parsed !== wl.hours) {
                        setBusy(true);
                        await onUpdate(wl.id, undefined, Math.round(parsed*3600));
                        setBusy(false);
                    } else setTime(wl.hours.toFixed(2));
                    setTimeEditing(false);
                };
                const color = (h) => h>=5.5?'bg-red-500':h>=3.5?'bg-amber-500':h>=1.5?'bg-emerald-500':'bg-blue-500';

                return (
                    <div className={"group relative bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-all " + (busy?'opacity-60 pointer-events-none':'')}>
                        {busy && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 rounded-lg"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>}
                        <div className="flex justify-between items-start mb-3 gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">{wl.issueKey}</span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 truncate max-w-[200px]">{wl.summary}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {timeEditing ? (
                                    <input value={time} onChange={e=>setTime(e.target.value)} onBlur={saveTime} onKeyDown={e=>e.key==='Enter'&&saveTime()} autoFocus className="w-16 px-1 py-0.5 text-center text-sm font-mono font-bold bg-slate-100 dark:bg-slate-900 border border-blue-500 rounded"/>
                                ) : (
                                    <button onClick={()=>setTimeEditing(true)} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                        <div className={"w-2.5 h-2.5 rounded-full "+color(wl.hours)}></div>
                                        <span className="font-mono font-bold text-sm text-slate-700 dark:text-slate-300">{wl.hours.toFixed(2)}h</span>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="relative">
                            {editing ? (
                                <div className="space-y-2">
                                    <textarea value={comment} onChange={e=>setComment(e.target.value)} className="w-full min-h-[80px] p-3 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500"/>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={()=>setEditing(false)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><XIcon size={16}/></button>
                                        <button onClick={saveComment} className="p-1.5 rounded text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"><Check size={16}/></button>
                                    </div>
                                </div>
                            ) : (
                                <div onClick={()=>setEditing(true)} className="p-3 text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer whitespace-pre-wrap leading-relaxed">
                                    {wl.comment || <span className="italic text-slate-400">Açıklama yok...</span>}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canUndo && <button onClick={()=>onUndo(wl.id)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200"><Undo size={12}/> Geri Al</button>}
                            <button onClick={async()=>{setBusy(true);await onImprove(wl.id);setBusy(false)}} disabled={!wl.comment} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 bg-purple-50 dark:bg-purple-900/20 rounded hover:bg-purple-100 disabled:opacity-50"><Wand size={12}/> AI Geliştir</button>
                            <button onClick={async()=>{setBusy(true);await onSpell(wl.id);setBusy(false)}} disabled={!wl.comment} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100 disabled:opacity-50"><Spell size={12}/> İmla</button>
                        </div>
                    </div>
                );
            };

            const SettingsModal = ({ isOpen, onClose, settings, onSave }) => {
                const [form, setForm] = useState(settings);
                const change = (e) => {
                    const {name, value, type, checked} = e.target;
                    setForm(p => ({...p, [name]: type==='checkbox'?checked:value}));
                };
                return (
                    <Modal isOpen={isOpen} onClose={onClose} title="Ayarlar">
                        <div className="space-y-6">
                            <section className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-4">
                                <h3 className="text-sm font-bold text-blue-600 border-b pb-2">Jira Bağlantısı</h3>
                                <div className="grid gap-4">
                                    <div><label className="text-xs font-medium text-slate-500">URL</label><input name="jiraUrl" value={form.jiraUrl} onChange={change} className="w-full p-2 border rounded text-sm bg-white dark:bg-slate-800 dark:border-slate-600"/></div>
                                    <div><label className="text-xs font-medium text-slate-500">E-posta</label><input name="jiraEmail" value={form.jiraEmail} onChange={change} className="w-full p-2 border rounded text-sm bg-white dark:bg-slate-800 dark:border-slate-600"/></div>
                                    <div><label className="text-xs font-medium text-slate-500">API Token</label><input name="jiraToken" type="password" value={form.jiraToken} onChange={change} className="w-full p-2 border rounded text-sm bg-white dark:bg-slate-800 dark:border-slate-600"/></div>
                                </div>
                            </section>
                            <section className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-4">
                                <h3 className="text-sm font-bold text-purple-600 border-b pb-2">Yapay Zeka (Groq)</h3>
                                <div><label className="text-xs font-medium text-slate-500">API Anahtarı</label><input name="groqApiKey" type="password" value={form.groqApiKey} onChange={change} className="w-full p-2 border rounded text-sm bg-white dark:bg-slate-800 dark:border-slate-600"/></div>
                                <div><label className="text-xs font-medium text-slate-500">Prompt</label><textarea name="aiSystemPrompt" value={form.aiSystemPrompt} onChange={change} rows={3} className="w-full p-2 border rounded text-xs font-mono bg-white dark:bg-slate-800 dark:border-slate-600"/></div>
                            </section>
                            <section className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-4">
                                <h3 className="text-sm font-bold text-emerald-600 border-b pb-2">Tercihler</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-medium text-slate-500">Hedef (Saat)</label><input name="targetDailyHours" type="number" step="0.25" value={form.targetDailyHours} onChange={change} className="w-full p-2 border rounded text-sm bg-white dark:bg-slate-800 dark:border-slate-600"/></div>
                                    <div><label className="text-xs font-medium text-slate-500">Min Kayıt</label><input name="minHoursPerWorklog" type="number" step="0.25" value={form.minHoursPerWorklog} onChange={change} className="w-full p-2 border rounded text-sm bg-white dark:bg-slate-800 dark:border-slate-600"/></div>
                                </div>
                            </section>
                            <div className="flex justify-end gap-2">
                                <button onClick={onClose} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm">İptal</button>
                                <button onClick={()=>onSave(form)} className="px-4 py-2 rounded bg-blue-600 text-white text-sm flex items-center gap-2"><Save size={16}/> Kaydet</button>
                            </div>
                        </div>
                    </Modal>
                );
            };

            // --- ANA UYGULAMA ---

            const App = () => {
                const [settings, setSettings] = useState({
                    jiraUrl: getBaseUrl(localStorage.getItem(APP_NAME+'_jiraUrl')),
                    jiraEmail: localStorage.getItem(APP_NAME+'_jiraEmail')||'',
                    jiraToken: localStorage.getItem(APP_NAME+'_jiraToken')||'',
                    groqApiKey: localStorage.getItem(APP_NAME+'_groqApiKey')||'',
                    groqModel: localStorage.getItem(APP_NAME+'_groqModel')||'llama-3.3-70b-versatile',
                    targetDailyHours: parseFloat(localStorage.getItem(APP_NAME+'_target')||'8'),
                    minHoursPerWorklog: parseFloat(localStorage.getItem(APP_NAME+'_min')||'0.25'),
                    aiSystemPrompt: localStorage.getItem(APP_NAME+'_prompt')||DEFAULT_SYSTEM_PROMPT,
                    isDarkTheme: localStorage.getItem(APP_NAME+'_theme')!=='light'
                });
                const [showSettings, setShowSettings] = useState(false);
                const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
                const [worklogs, setWorklogs] = useState([]);
                const [loading, setLoading] = useState(LoadingState.IDLE);
                const [notifications, setNotifications] = useState([]);
                const [history, setHistory] = useState({});

                const totalHours = useMemo(()=>worklogs.reduce((s,w)=>s+w.hours,0),[worklogs]);
                const isMet = totalHours >= settings.targetDailyHours;
                const progress = Math.min((totalHours/settings.targetDailyHours)*100, 100);

                useEffect(() => {
                    document.getElementById('jira-worklog-root').className = settings.isDarkTheme ? 'dark' : '';
                }, [settings.isDarkTheme]);

                useEffect(() => {
                    if(settings.jiraUrl && settings.jiraToken && settings.jiraEmail) loadData();
                }, [date]);

                const notify = (t,m,type='info') => {
                    const id=Date.now();
                    setNotifications(p=>[...p,{id,t,m,type}]);
                    setTimeout(()=>setNotifications(p=>p.filter(n=>n.id!==id)),5000);
                };

                const loadData = async (curSet=settings) => {
                    if(!curSet.jiraUrl || !curSet.jiraEmail || !curSet.jiraToken) return;
                    setLoading(LoadingState.LOADING);
                    try {
                        const data = await fetchWorklogs(date, curSet);
                        setWorklogs(data);
                        setLoading(LoadingState.SUCCESS);
                    } catch(e) {
                        console.error(e);
                        setLoading(LoadingState.ERROR);
                        notify('Veri Yüklenemedi', e.message, 'error');
                        if(e.message.includes('Eksik')) setShowSettings(true);
                    }
                };

                const saveSettings = (newSet) => {
                    setSettings(newSet);
                    localStorage.setItem(APP_NAME+'_jiraUrl', newSet.jiraUrl);
                    localStorage.setItem(APP_NAME+'_jiraEmail', newSet.jiraEmail);
                    localStorage.setItem(APP_NAME+'_jiraToken', newSet.jiraToken);
                    localStorage.setItem(APP_NAME+'_groqApiKey', newSet.groqApiKey);
                    localStorage.setItem(APP_NAME+'_target', newSet.targetDailyHours);
                    localStorage.setItem(APP_NAME+'_min', newSet.minHoursPerWorklog);
                    localStorage.setItem(APP_NAME+'_prompt', newSet.aiSystemPrompt);
                    localStorage.setItem(APP_NAME+'_theme', newSet.isDarkTheme?'dark':'light');
                    setShowSettings(false);
                    notify('Ayarlar Kaydedildi', 'Yapılandırma güncellendi.', 'success');
                    loadData(newSet);
                };

                const addHistory = (wl) => {
                    setHistory(p => ({...p, [wl.id]: [...(p[wl.id]||[]), {comment:wl.comment, seconds:wl.seconds}]}));
                };

                const handleUndo = async (id) => {
                    const wl = worklogs.find(w=>w.id===id);
                    const prev = history[id]?.pop();
                    if(!wl || !prev) return;
                    try {
                        await updateWorklog(wl, settings, prev.comment, prev.seconds);
                        setWorklogs(p=>p.map(w=>w.id===id ? {...w, comment:prev.comment, seconds:prev.seconds, hours:secToHours(prev.seconds)} : w));
                        setHistory({...history}); // trigger re-render
                        notify('Geri Alındı', 'Değişiklik geri alındı.', 'success');
                    } catch(e) { notify('Hata', e.message, 'error'); }
                };

                const handleUpdate = async (id, comm, sec) => {
                    const wl = worklogs.find(w=>w.id===id);
                    if(!wl) return;
                    addHistory(wl);
                    try {
                        await updateWorklog(wl, settings, comm, sec);
                        setWorklogs(p=>p.map(w=>{
                            if(w.id!==id) return w;
                            return {...w, comment:comm!==undefined?comm:w.comment, seconds:sec!==undefined?sec:w.seconds, hours:sec!==undefined?secToHours(sec):w.hours};
                        }));
                        notify('Güncellendi', 'Kayıt başarıyla güncellendi.', 'success');
                    } catch(e) { notify('Hata', e.message, 'error'); loadData(); }
                };

                const handleAI = async (id, mode) => {
                    const wl = worklogs.find(w=>w.id===id);
                    if(!wl || !wl.comment) return;
                    if(!settings.groqApiKey) { notify('Hata', 'Groq API anahtarı eksik.', 'error'); setShowSettings(true); return; }
                    try {
                        notify('AI Çalışıyor', 'İşleniyor...', 'info');
                        const prompt = mode==='IMPROVE' 
                            ? "BAĞLAM: Konu: "+wl.summary+". GÖREV: "+settings.aiSystemPrompt+" GİRDİ: "+wl.comment
                            : "GÖREV: Sadece imla hatalarını düzelt. GİRDİ: "+wl.comment;
                        const res = await callGroq(prompt, settings);
                        if(res && res.trim()!==wl.comment) {
                            await handleUpdate(id, res.trim());
                        } else {
                            notify('Bilgi', 'Önemli bir değişiklik önerilmedi.', 'info');
                        }
                    } catch(e) { notify('Hata', e.message, 'error'); }
                };

                const handleDistribute = async () => {
                    if(loading===LoadingState.LOADING) return;
                    const diff = settings.targetDailyHours - totalHours;
                    if(Math.abs(diff)<0.05) { notify('Tamam', 'Hedef zaten tutturuldu.', 'success'); return; }
                    
                    const distList = [...worklogs];
                    if(distList.length===0) return;
                    
                    notify('Hesaplanıyor', 'Süreler akıllıca dağıtılıyor...', 'info');
                    const diffSec = Math.round(diff*3600);
                    const totalW = distList.reduce((s,w)=>s+(w.seconds||1),0);
                    let rem = diffSec;

                    try {
                        const promises = distList.map(async (wl, i) => {
                            let share = 0;
                            if(i===distList.length-1) share = rem;
                            else {
                                const w = (wl.seconds||1)/totalW;
                                share = Math.round(diffSec*w);
                                rem -= share;
                            }
                            const newS = Math.max(Math.round(settings.minHoursPerWorklog*3600), wl.seconds+share);
                            if(newS!==wl.seconds) {
                                addHistory(wl);
                                await updateWorklog(wl, settings, undefined, newS);
                            }
                        });
                        await Promise.all(promises);
                        await loadData();
                        notify('Dağıtıldı', 'Süreler orantılı olarak dağıtıldı.', 'success');
                    } catch(e) { notify('Hata', e.message, 'error'); }
                };

                const copyPrev = async () => {
                    const d = new Date(date);
                    d.setDate(d.getDate()-1);
                    if(d.getDay()===0) d.setDate(d.getDate()-2);
                    const prevD = d.toISOString().split('T')[0];
                    
                    notify('Kopyalanıyor', prevD + ' tarihinden veriler alınıyor...', 'info');
                    try {
                        const logs = await fetchWorklogs(prevD, settings);
                        if(logs.length===0) { notify('Boş', 'Önceki iş gününde kayıt yok.', 'warning'); return; }
                        await Promise.all(logs.map(wl => createWorklog(wl.issueKey, date, wl.seconds, wl.comment, settings)));
                        await loadData();
                        notify('Başarılı', logs.length+' kayıt kopyalandı.', 'success');
                    } catch(e) { notify('Hata', e.message, 'error'); }
                };

                const changeDate = (d) => {
                    const dt = new Date(date);
                    dt.setDate(dt.getDate()+d);
                    setDate(dt.toISOString().split('T')[0]);
                };

                return (
                    <div className={"min-h-screen w-full flex flex-col items-center py-8 px-4 font-sans text-slate-900 dark:text-slate-100 " + (settings.isDarkTheme ? 'bg-slate-900' : 'bg-slate-50')}>
                        <div className="w-full max-w-4xl space-y-6">
                            <header className="flex justify-between items-center bg-white dark:bg-slate-850 p-5 rounded-2xl shadow border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-600 p-2 rounded-lg text-white"><CalendarIcon size={24}/></div>
                                    <div><h1 className="text-xl font-bold">Worklog Yöneticisi Pro</h1><p className="text-xs text-slate-500">Jira Entegrasyonu v10.0</p></div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={()=>setSettings(s=>({...s,isDarkTheme:!s.isDarkTheme}))} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">{settings.isDarkTheme?<Sun/>:<Moon/>}</button>
                                    <button onClick={()=>setShowSettings(true)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><SettingsIcon/></button>
                                    <button onClick={()=>document.getElementById('jira-worklog-root').style.display='none'} className="p-2 rounded-lg hover:bg-red-100 text-red-500"><XIcon/></button>
                                </div>
                            </header>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-1 space-y-6">
                                    <div className="bg-white dark:bg-slate-850 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                        <label className="text-xs font-bold text-slate-400 uppercase mb-3 block">Tarih</label>
                                        <div className="flex items-center gap-2">
                                            <button onClick={()=>changeDate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><ChevronLeft/></button>
                                            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-center font-mono font-bold"/>
                                            <button onClick={()=>changeDate(1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><ChevronRight/></button>
                                        </div>
                                    </div>
                                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-xl shadow-lg text-white relative overflow-hidden">
                                        <div className="relative z-10">
                                            <span className="text-slate-400 text-xs font-bold uppercase">İlerleme</span>
                                            <div className="flex items-baseline gap-1 mt-2 mb-4"><span className="text-4xl font-extrabold">{totalHours.toFixed(2)}</span><span className="text-slate-400 font-medium">/ {settings.targetDailyHours}s</span></div>
                                            <div className="w-full bg-slate-700/50 h-3 rounded-full overflow-hidden"><div className={"h-full transition-all duration-1000 "+(isMet?'bg-emerald-500':'bg-blue-500')} style={{width:progress+'%'}}></div></div>
                                            <p className="mt-3 text-xs text-slate-300 flex items-center gap-2">{isMet?<CheckCircle className="text-emerald-400" size={14}/>:<Icon size={14}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></Icon>}{isMet?'Hedef Tamam!':(settings.targetDailyHours-totalHours).toFixed(2)+'s kaldı'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
                                        <button onClick={()=>loadData()} className="w-full flex justify-center gap-2 p-2.5 rounded bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium text-sm border border-slate-200 dark:border-slate-700"><RefreshCw size={16} className={loading===LoadingState.LOADING?'animate-spin':''}/> Yenile</button>
                                        <button onClick={handleDistribute} className="w-full flex justify-center gap-2 p-2.5 rounded bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-medium text-sm border border-indigo-100 dark:border-indigo-900/50"><Sparkles size={16}/> Akıllı Dağıt</button>
                                        <button onClick={copyPrev} className="w-full flex justify-center gap-2 p-2.5 rounded bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 font-medium text-sm border border-slate-200 dark:border-slate-700"><Copy size={16}/> Dünden Kopyala</button>
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-1 min-h-[400px]">
                                        {loading===LoadingState.LOADING ? <div className="p-4 space-y-4">{[1,2,3].map(i=><div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"/>)}</div> :
                                         worklogs.length===0 ? <div className="text-center py-20 opacity-60"><div className="bg-slate-200 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Clock size={32}/></div><h3>Kayıt Bulunamadı</h3></div> :
                                         <div className="space-y-4">{worklogs.map(wl => <WorklogRow key={wl.id} wl={wl} onUpdate={handleUpdate} onImprove={(id)=>handleAI(id,'IMPROVE')} onSpell={(id)=>handleAI(id,'SPELL')} onUndo={handleUndo} canUndo={history[wl.id] && history[wl.id].length>0}/>)}</div>
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                        <SettingsModal isOpen={showSettings} onClose={()=>setShowSettings(false)} settings={settings} onSave={saveSettings}/>
                        <div className="fixed bottom-20 right-6 flex flex-col gap-2 z-[100002] pointer-events-none">
                            {notifications.map(n => (
                                <div key={n.id} className={"pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-2xl border backdrop-blur-md animate-in slide-in max-w-sm " + (n.type==='success'?'bg-emerald-50/90 border-emerald-200 text-emerald-800':n.type==='error'?'bg-red-50/90 border-red-200 text-red-800':n.type==='warning'?'bg-amber-50/90 border-amber-200 text-amber-800':'bg-white/90 border-slate-200')}>
                                    <div><h4 className="text-sm font-bold">{n.t}</h4><p className="text-xs opacity-90">{n.m}</p></div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            };

            const rootEl = document.getElementById('jira-worklog-root');
            if(rootEl) ReactDOM.createRoot(rootEl).render(<App/>);
        `;
        document.body.appendChild(script);
    }
})();
