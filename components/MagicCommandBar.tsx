import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowRight, Clock, Hash, Sparkles, Command, Mic, MicOff } from 'lucide-react';
import { AppSettings, JiraIssue } from '../types';
import { searchIssues, callGroq } from '../services/api';

interface MagicCommandBarProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (issueKey: string, hours: number, comment: string) => Promise<void>;
    settings: AppSettings;
}

interface AIAnalysisResult {
    issueKey: string | null;
    issueSummary: string | null;
    hours: number;
    comment: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
}

export const MagicCommandBar: React.FC<MagicCommandBarProps> = ({
    isOpen,
    onClose,
    onSubmit,
    settings
}) => {
    const [input, setInput] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [loadingStep, setLoadingStep] = useState<string>('');
    const [result, setResult] = useState<AIAnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isListening, setIsListening] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
        if (!isOpen) {
            setInput('');
            setResult(null);
            setError(null);
            stopListening();
        }
    }, [isOpen]);

    // Voice Recognition Setup
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'tr-TR';

            recognitionRef.current.onresult = (event: any) => {
                const transcript = Array.from(event.results)
                    .map((result: any) => result[0])
                    .map((result: any) => result.transcript)
                    .join('');
                setInput(transcript);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error('Speech recognition error', event.error);
                setIsListening(false);
            };
        }
    }, []);

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    const startListening = () => {
        if (recognitionRef.current) {
            try {
                recognitionRef.current.start();
                setIsListening(true);
                setInput(''); // Clear input when starting new recording
            } catch (e) {
                console.error(e);
            }
        } else {
            alert("Tarayıcınız sesli komutu desteklemiyor.");
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    };

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (result) {
                // If result is ready, submit
                if (result.issueKey) {
                    await onSubmit(result.issueKey, result.hours, result.comment);
                    onClose();
                }
            } else if (input.trim()) {
                // If input exists but no result, analyze
                await analyzeInput();
            }
        }
    };

    const analyzeInput = async () => {
        if (!input.trim() || !settings.groqApiKey) return;
        
        setIsAnalyzing(true);
        setLoadingStep('Jira taranıyor...');
        setError(null);

        try {
            // 1. Search for relevant issues in Jira first to give context to AI
            // Extract potential keywords (simple split for now, AI will do better but we need data first)
            const keywords = input.split(' ').filter(w => w.length > 3).slice(0, 3).join(' ');
            let relevantIssues: JiraIssue[] = [];
            
            try {
                // Search with broad keywords
                relevantIssues = await searchIssues(keywords || input, settings);
            } catch (err) {
                console.warn('Jira search failed, proceeding without context', err);
            }

            setLoadingStep('Yapay zeka analiz ediyor...');

            // 2. Ask AI to analyze intent, match issue, estimate time, and format comment
            const prompt = `
Sen akıllı bir Jira Worklog asistanısın. Kullanıcının girdiği doğal dildeki ifadeyi analiz et.

KULLANICI GİRDİSİ: "${input}"

MEVCUT JIRA KAYITLARI (Bulunanlar):
${relevantIssues.map(i => `- [${i.key}] ${i.summary} (Proje: ${i.projectName})\n  Detay: ${i.description ? i.description.substring(0, 300).replace(/\n/g, ' ') : 'Yok'}`).join('\n')}

GÖREVLER:
1. EN UYGUN ISSUE'YU SEÇ:
   - Kullanıcı girdisiyle en alakalı issue'yu bul.
   - Eğer başlıkta veya DETAYDA (açıklamada) ipucu varsa onu kullan.
   - Eğer birden fazla benzer varsa (örn: AGC-250 ve AGC-427), ID'si daha büyük olanı (daha güncel) tercih et.
   - Hiçbir issue eşleşmiyorsa null dön.

2. SÜRE TAHMİN ET:
   - Yapılan işin tanımına göre mantıklı bir süre (saat cinsinden) belirle.
   - Kullanıcı süre belirttiyse (örn: "2 saat", "yarım gün") onu kullan.
   - Belirtilmediyse işin zorluğuna göre tahmin et (Basit: 0.5-1, Orta: 1-3, Zor: 3+).

3. YORUMU DÜZENLE:
   - Kullanıcının ifadesini profesyonel bir Jira worklog açıklamasına dönüştür.
   - Issue'nun detayından (açıklamasından) bağlam alarak yorumu zenginleştir.
   - Yazım hatalarını düzelt, kurumsal bir dil kullan.

ÇIKTI FORMATI (Sadece JSON):
{
  "issueKey": "AGC-427" veya null,
  "issueSummary": "Bulunan issue başlığı" veya null,
  "hours": 1.5,
  "comment": "Profesyonelce düzenlenmiş açıklama",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Neden bu issue'yu seçtiğinin kısa açıklaması"
}
`;

            const response = await callGroq(prompt, settings, 800, 0.1); // Low temp for precision
            
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error('JSON yanıtı alınamadı');
                const analysis = JSON.parse(jsonMatch[0]);
                setResult(analysis);
            } catch (parseErr) {
                throw new Error('AI yanıtı işlenemedi.');
            }

        } catch (err: any) {
            setError(err.message || 'Analiz sırasında bir hata oluştu.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh] px-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative w-full max-w-2xl flex flex-col gap-2 animate-scale-in">
                {/* Main Input Bar - Liquid Glass Style */}
                <div className="relative overflow-hidden rounded-2xl p-[1px]" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%)' }}>
                    <div className="absolute inset-0 bg-white/40 dark:bg-black/40 backdrop-blur-xl" />
                    
                    {/* Glowing Border Effect */}
                    <div className="absolute inset-0 rounded-2xl opacity-50" 
                         style={{ 
                             background: 'linear-gradient(90deg, #007AFF, #5856D6, #FF2D55, #007AFF)', 
                             backgroundSize: '300% 100%',
                             animation: 'shimmer 4s linear infinite',
                             mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                             maskComposite: 'exclude',
                             WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                             WebkitMaskComposite: 'xor',
                             padding: '2px'
                         }} 
                    />

                    <div className="relative flex items-center p-4 gap-4 bg-white/80 dark:bg-black/80 rounded-2xl">
                        {isAnalyzing ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-6 h-6 text-primary-500 animate-spin shrink-0" />
                                <span className="text-xs text-primary-600 animate-pulse font-medium whitespace-nowrap">
                                    {loadingStep}
                                </span>
                            </div>
                        ) : (
                            <Sparkles className="w-6 h-6 text-primary-500 shrink-0 animate-pulse" />
                        )}
                        
                        {!isAnalyzing && (
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={isListening ? "Dinliyorum..." : "Ne yaptığını anlat? (Örn: Login sayfasını düzelttim)"}
                                className="flex-1 bg-transparent border-none outline-none text-lg placeholder:text-gray-400 text-gray-800 dark:text-white"
                                autoComplete="off"
                            />
                        )}
                        
                        <button 
                            onClick={toggleListening}
                            className={`p-2 rounded-full transition-all duration-300 ${isListening ? 'bg-red-500 text-white scale-110 animate-pulse' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'}`}
                            title="Sesli Komut"
                        >
                            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>

                        <div className="hidden md:flex items-center gap-2 text-xs text-gray-400 font-mono border border-gray-200 dark:border-gray-700 rounded px-2 py-1">
                            <span>ESC</span>
                        </div>
                    </div>
                </div>

                {/* Results Panel */}
                {error && (
                    <div className="surface-card p-4 text-red-500 text-sm animate-fade-in">
                        {error}
                    </div>
                )}

                {result && (
                    <div className="surface-card p-0 overflow-hidden animate-fade-in divide-y divide-gray-100 dark:divide-gray-800">
                        {/* Issue Selection */}
                        <div className="p-4 flex items-start gap-3 bg-primary-50/50 dark:bg-primary-900/20">
                            <div className="p-2 bg-primary-100 dark:bg-primary-800 rounded-lg text-primary-600 dark:text-primary-300">
                                <Hash size={20} />
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                                        Hedef Issue
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        result.confidence === 'high' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                        {result.confidence === 'high' ? 'Güvenli Eşleşme' : 'Tahmini Eşleşme'}
                                    </span>
                                </div>
                                {result.issueKey ? (
                                    <div>
                                        <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                            {result.issueKey} 
                                            <span className="font-normal text-gray-500">- {result.issueSummary}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{result.reasoning}</p>
                                    </div>
                                ) : (
                                    <div className="text-red-500 font-medium">Uygun bir issue bulunamadı. Lütfen manuel seçin.</div>
                                )}
                            </div>
                        </div>

                        {/* Time & Comment Preview */}
                        <div className="p-4 flex gap-4">
                            <div className="flex-1 space-y-1">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Worklog Açıklaması</span>
                                <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
                                    {result.comment}
                                </p>
                            </div>
                            <div className="w-px bg-gray-200 dark:bg-gray-700" />
                            <div className="w-24 flex flex-col items-center justify-center text-center">
                                <Clock size={20} className="text-gray-400 mb-1" />
                                <span className="text-xl font-bold text-gray-900 dark:text-white">{result.hours}h</span>
                                <span className="text-xs text-gray-500">Süre</span>
                            </div>
                        </div>

                        {/* Action Bar */}
                        <div className="p-3 bg-gray-50 dark:bg-gray-900/50 flex justify-end items-center gap-3">
                            <span className="text-xs text-gray-400">Onaylamak için Enter'a bas</span>
                            <button 
                                onClick={() => result.issueKey && onSubmit(result.issueKey, result.hours, result.comment)}
                                disabled={!result.issueKey}
                                className="btn-filled flex items-center gap-2"
                            >
                                Onayla ve Ekle <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
