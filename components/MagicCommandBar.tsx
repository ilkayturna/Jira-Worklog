import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ArrowRight, Clock, Hash, Sparkles, Mic, MicOff, Play, Wand2, X, Volume2, CheckCircle2, AlertCircle } from 'lucide-react';
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
    const abortControllerRef = useRef<AbortController | null>(null);

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
            // Abort any pending requests
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
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
        
        // Cancel any previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        
        setIsAnalyzing(true);
        setLoadingStep('Jira taranıyor...');
        setError(null);

        try {
            // 1. Akıllı anahtar kelime çıkarımı
            // Kullanıcı "logos crystal reports yaptım" derse -> "crystal reports" ve "logos" aranmalı
            const inputLower = input.toLowerCase();
            
            // Saat bilgisini çıkar
            const hourMatch = input.match(/(\d+(?:[.,]\d+)?)\s*(?:saat|sa|h|hour)/i);
            const extractedHours = hourMatch ? parseFloat(hourMatch[1].replace(',', '.')) : null;
            
            // Özel anahtar kelimeleri çıkar (ürün/modül isimleri, teknolojiler)
            const specialKeywords = [
                'crystal', 'report', 'reports', 'rapor',
                'logo', 'logos', 'netsis', 'tiger', 'go', 'erp',
                'entegrasyon', 'integration', 'api',
                'satınalma', 'satış', 'stok', 'muhasebe', 'finans',
                'fatura', 'irsaliye', 'sipariş', 'order',
                'kullanıcı', 'user', 'yetki', 'permission',
                'parametre', 'parameter', 'ayar', 'setting',
                'hata', 'bug', 'fix', 'düzeltme', 'sorun', 'problem'
            ];
            
            const foundKeywords: string[] = [];
            specialKeywords.forEach(kw => {
                if (inputLower.includes(kw)) foundKeywords.push(kw);
            });
            
            // Genel kelimeleri de ekle (3+ karakter)
            const generalWords = input
                .replace(/[^\wğüşıöçĞÜŞİÖÇ\s]/gi, '')
                .split(/\s+/)
                .filter(w => w.length > 3 && !['yaptım', 'ettim', 'için', 'olan', 'saat', 'gün', 'çalıştım'].includes(w.toLowerCase()));
            
            const searchQueries = [...new Set([...foundKeywords, ...generalWords])].slice(0, 5);
            
            console.log('🔍 Arama kelimeleri:', searchQueries);

            // 2. Paralel arama - her kelime için ayrı arama yap
            let allIssues: JiraIssue[] = [];
            
            setLoadingStep('Issue\'lar aranıyor...');
            
            for (const query of searchQueries) {
                try {
                    const issues = await searchIssues(query, settings);
                    allIssues.push(...issues);
                } catch (err) {
                    console.warn(`Arama başarısız (${query}):`, err);
                }
            }
            
            // Duplicate'leri kaldır (key bazında)
            const uniqueIssues = Array.from(new Map(allIssues.map(i => [i.key, i])).values());
            
            // Issue numarasına göre sırala (büyük = yeni)
            uniqueIssues.sort((a, b) => {
                const numA = parseInt(a.key.split('-')[1] || '0');
                const numB = parseInt(b.key.split('-')[1] || '0');
                return numB - numA; // Büyükten küçüğe (yeniden eskiye)
            });
            
            console.log('📋 Bulunan issue sayısı:', uniqueIssues.length);

            // 3. Genel destek issue'larını da al (fallback için)
            const supportKeywords = ['destek', 'genel', 'talep', 'canlı geçiş', 'kullanıcı destek'];
            let supportIssues: JiraIssue[] = [];
            
            if (uniqueIssues.length === 0) {
                setLoadingStep('Genel destek issue\'ları aranıyor...');
                for (const kw of supportKeywords) {
                    try {
                        const issues = await searchIssues(kw, settings);
                        supportIssues.push(...issues);
                    } catch (err) {
                        // Ignore
                    }
                }
                supportIssues = Array.from(new Map(supportIssues.map(i => [i.key, i])).values());
            }

            setLoadingStep('Yapay zeka analiz ediyor...');

            // 4. AI ile en uygun issue'yu seç
            const allFoundIssues = uniqueIssues.length > 0 ? uniqueIssues : supportIssues;
            
            const prompt = `
Sen akıllı bir Jira Worklog asistanısın. Kullanıcının girdiği doğal dildeki ifadeyi analiz et ve EN UYGUN issue'ya eşleştir.

KULLANICI GİRDİSİ: "${input}"
${extractedHours ? `KULLANICININ BELİRTTİĞİ SÜRE: ${extractedHours} saat` : ''}

BULUNAN JIRA ISSUE'LARI (Yeniden eskiye sıralı):
${allFoundIssues.slice(0, 15).map((i, idx) => 
    `${idx + 1}. [${i.key}] ${i.summary}
   Proje: ${i.projectName || 'Bilinmiyor'} | Durum: ${i.status || 'Bilinmiyor'}
   Açıklama: ${i.description ? i.description.substring(0, 200).replace(/\n/g, ' ') : 'Yok'}`
).join('\n\n')}

${uniqueIssues.length === 0 ? `
⚠️ DİKKAT: Kullanıcının anlattığı işle doğrudan ilgili issue bulunamadı.
Yukarıdaki listede GENEL DESTEK issue'ları var. Bunlardan birini seç:
- "Destek Talepleri", "Genel Destek", "Kullanıcı Destek" gibi issue'ları tercih et.
- Canlı geçiş öncesi/sonrası destek, kullanıcı destek işlemleri gibi genel kategorileri düşün.
` : ''}

GÖREVLER:

1. EN UYGUN ISSUE'YU SEÇ:
   - Kullanıcının anlattığı işle EN ALAKALI issue'yu bul.
   - ÖNCELİK SIRASI:
     a) Başlık veya açıklamada anahtar kelimeler geçiyorsa (örn: "crystal reports" -> Crystal Reports içeren issue)
     b) Aynı konuda birden fazla issue varsa, ID NUMARASI BÜYÜK OLANI seç (daha güncel)
     c) Hiç eşleşme yoksa, GENEL DESTEK issue'larından birini seç
   - KESİNLİKLE null dönme, mutlaka bir issue seç!

2. SÜRE BELİRLE:
   ${extractedHours ? `- Kullanıcı ${extractedHours} saat belirtmiş, BUNU KULLAN.` : `
   - Kullanıcı süre belirtmediyse, işin türüne göre tahmin et:
     * Basit kontrol/inceleme: 0.5-1 saat
     * Orta düzey iş: 1-2 saat  
     * Karmaşık iş: 2-4 saat`}

3. YORUMU PROFESYONELCE DÜZENLE:
   - Kullanıcının ifadesini kurumsal ve teknik bir worklog açıklamasına dönüştür.
   - Issue'nun konusuyla uyumlu olsun.
   - "yaptım", "ettim" gibi günlük ifadeler yerine "gerçekleştirildi", "tamamlandı" kullan.

ÇIKTI (SADECE JSON, başka hiçbir şey yazma):
{
  "issueKey": "XXX-123",
  "issueSummary": "Issue başlığı",
  "hours": ${extractedHours || 1},
  "comment": "Profesyonelce düzenlenmiş açıklama",
  "confidence": "high" | "medium" | "low",
  "reasoning": "Neden bu issue'yu seçtiğinin kısa açıklaması"
}
`;

            const response = await callGroq(prompt, settings, 1000, 0.1);
            
            try {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error('JSON yanıtı alınamadı');
                const analysis = JSON.parse(jsonMatch[0]);
                
                // Validate that we have an issue
                if (!analysis.issueKey && allFoundIssues.length > 0) {
                    // AI null döndüyse, ilk issue'yu kullan
                    analysis.issueKey = allFoundIssues[0].key;
                    analysis.issueSummary = allFoundIssues[0].summary;
                    analysis.confidence = 'low';
                    analysis.reasoning = 'AI eşleştirme yapamadı, en güncel issue seçildi.';
                }
                
                setResult(analysis);
            } catch (parseErr) {
                console.error('Parse error:', parseErr, response);
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
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 animate-fade-in">
            {/* Backdrop with gradient blur */}
            <div 
                className="absolute inset-0" 
                style={{ 
                    background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%)',
                    backdropFilter: 'blur(12px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(12px) saturate(150%)'
                }} 
                onClick={onClose} 
            />
            
            <div className="relative w-full max-w-2xl flex flex-col gap-4 animate-scale-in">
                {/* Hero Title */}
                <div className="text-center mb-2">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card relative">
                        <Wand2 size={16} style={{ color: 'var(--color-ai-500)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
                            AI Worklog Asistanı
                        </span>
                    </div>
                </div>

                {/* Main Input Card - Premium Design */}
                <div className="glass-modal overflow-hidden rounded-3xl">
                    {/* Gradient accent line */}
                    <div 
                        className="h-1 w-full"
                        style={{ 
                            background: isListening 
                                ? 'linear-gradient(90deg, #EF4444, #F97316, #EF4444)'
                                : 'linear-gradient(90deg, var(--color-primary-500), var(--color-ai-500), var(--color-primary-500))',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 2s linear infinite'
                        }}
                    />

                    {/* Input Area */}
                    <div className="p-6">
                        {/* Status indicator when listening */}
                        {isListening && (
                            <div className="flex items-center justify-center gap-3 mb-4 py-3 rounded-2xl" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                                <div className="flex items-center gap-1">
                                    {[1,2,3,4,5].map(i => (
                                        <div 
                                            key={i} 
                                            className="w-1 bg-red-500 rounded-full animate-pulse"
                                            style={{ 
                                                height: `${12 + Math.random() * 16}px`,
                                                animationDelay: `${i * 0.1}s`
                                            }}
                                        />
                                    ))}
                                </div>
                                <span className="text-sm font-medium text-red-600">Dinliyorum... Konuşmayı bitirince durdurun</span>
                            </div>
                        )}

                        {/* Analyzing state */}
                        {isAnalyzing && (
                            <div className="flex items-center justify-center gap-3 mb-4 py-4 rounded-2xl" style={{ background: 'var(--color-ai-50)' }}>
                                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-ai-500)' }} />
                                <span className="text-sm font-medium" style={{ color: 'var(--color-ai-600)' }}>
                                    {loadingStep}
                                </span>
                            </div>
                        )}

                        {/* Input row */}
                        {!isAnalyzing && (
                            <div className="flex items-center gap-3">
                                {/* AI Icon */}
                                <div 
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                                    style={{ 
                                        background: 'linear-gradient(135deg, var(--color-ai-500) 0%, var(--color-primary-500) 100%)',
                                        boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)'
                                    }}
                                >
                                    <Sparkles size={22} className="text-white" />
                                </div>

                                {/* Text Input */}
                                <div className="flex-1 relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ne üzerinde çalıştığını anlat..."
                                        className="w-full bg-transparent border-none outline-none text-lg font-medium placeholder-opacity-50"
                                        style={{ color: 'var(--color-on-surface)' }}
                                        autoComplete="off"
                                    />
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                                        Örn: "Logos Kimya satınalma ekranında 2 saat çalıştım"
                                    </p>
                                </div>

                                {/* Mic Button */}
                                <button 
                                    onClick={toggleListening}
                                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${isListening ? 'animate-pulse' : 'hover:scale-105'}`}
                                    style={{
                                        background: isListening 
                                            ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                                            : 'var(--color-surface-container)',
                                        color: isListening ? 'white' : 'var(--color-on-surface-variant)',
                                        boxShadow: isListening ? '0 4px 20px rgba(239, 68, 68, 0.4)' : 'none'
                                    }}
                                    title={isListening ? "Kaydı Durdur" : "Sesli Komut"}
                                >
                                    {isListening ? <MicOff size={22} /> : <Mic size={22} />}
                                </button>

                                {/* Process Button */}
                                <button 
                                    onClick={analyzeInput}
                                    disabled={!input.trim() || isAnalyzing}
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                                    style={{
                                        background: input.trim() 
                                            ? 'linear-gradient(135deg, var(--color-ai-500) 0%, var(--color-ai-600) 100%)'
                                            : 'var(--color-surface-container)',
                                        color: input.trim() ? 'white' : 'var(--color-on-surface-variant)',
                                        boxShadow: input.trim() ? '0 4px 16px rgba(139, 92, 246, 0.3)' : 'none'
                                    }}
                                    title="İşleme Al"
                                >
                                    <Play size={20} fill="currentColor" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Keyboard Shortcuts */}
                    <div className="px-6 py-3 flex items-center justify-between glass-modal-header">
                        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-2 py-1 rounded-lg glass-icon-btn font-mono">Enter</kbd>
                                <span>İşleme al</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-2 py-1 rounded-lg glass-icon-btn font-mono">ESC</kbd>
                                <span>Kapat</span>
                            </span>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2 rounded-xl transition-all hover:scale-105 glass-icon-btn"
                        >
                            <X size={18} style={{ color: 'var(--color-on-surface-variant)' }} />
                        </button>
                    </div>
                </div>

                {/* Error Panel */}
                {error && (
                    <div className="glass-card p-4 rounded-2xl flex items-start gap-3 animate-fade-in error-alert">
                        <AlertCircle size={20} className="shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium text-sm">İşlem başarısız</p>
                            <p className="text-sm opacity-80">{error}</p>
                        </div>
                    </div>
                )}

                {/* Results Panel - Premium Design */}
                {result && (
                    <div className="glass-modal overflow-hidden rounded-2xl animate-fade-in">
                        {/* Success Header */}
                        <div 
                            className="p-4 flex items-center gap-3"
                            style={{ 
                                background: result.issueKey 
                                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)'
                                    : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%)'
                            }}
                        >
                            {result.issueKey ? (
                                <CheckCircle2 size={24} style={{ color: 'var(--color-success)' }} />
                            ) : (
                                <AlertCircle size={24} style={{ color: 'var(--color-error)' }} />
                            )}
                            <div className="flex-1">
                                <h3 className="font-bold" style={{ color: result.issueKey ? 'var(--color-success)' : 'var(--color-error)' }}>
                                    {result.issueKey ? 'Issue Bulundu!' : 'Issue Bulunamadı'}
                                </h3>
                                <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                                    {result.reasoning}
                                </p>
                            </div>
                            <span 
                                className="text-xs px-3 py-1 rounded-full font-medium"
                                style={{
                                    background: result.confidence === 'high' 
                                        ? 'rgba(16, 185, 129, 0.2)' 
                                        : result.confidence === 'medium'
                                        ? 'rgba(245, 158, 11, 0.2)'
                                        : 'rgba(239, 68, 68, 0.2)',
                                    color: result.confidence === 'high' 
                                        ? 'var(--color-success)' 
                                        : result.confidence === 'medium'
                                        ? 'var(--color-warning)'
                                        : 'var(--color-error)'
                                }}
                            >
                                {result.confidence === 'high' ? '✓ Yüksek Güven' : result.confidence === 'medium' ? '~ Orta Güven' : '! Düşük Güven'}
                            </span>
                        </div>

                        {/* Issue & Time Info */}
                        {result.issueKey && (
                            <div className="p-4 grid grid-cols-[1fr,auto] gap-4" style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                                {/* Issue Info */}
                                <div className="flex items-start gap-3">
                                    <div 
                                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{ 
                                            background: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%)',
                                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                                        }}
                                    >
                                        <Hash size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <span 
                                            className="text-xs font-bold px-2 py-0.5 rounded-md"
                                            style={{ 
                                                background: 'var(--color-primary-100)',
                                                color: 'var(--color-primary-600)'
                                            }}
                                        >
                                            {result.issueKey}
                                        </span>
                                        <p className="font-medium mt-1" style={{ color: 'var(--color-on-surface)' }}>
                                            {result.issueSummary}
                                        </p>
                                    </div>
                                </div>

                                {/* Time */}
                                <div 
                                    className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center text-center"
                                    style={{ 
                                        background: 'var(--color-surface-container)',
                                        border: '2px solid var(--color-outline-variant)'
                                    }}
                                >
                                    <Clock size={18} style={{ color: 'var(--color-on-surface-variant)' }} />
                                    <span className="text-2xl font-bold mt-1" style={{ color: 'var(--color-on-surface)' }}>
                                        {result.hours}
                                    </span>
                                    <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>saat</span>
                                </div>
                            </div>
                        )}

                        {/* Comment Preview */}
                        <div className="p-4" style={{ background: 'var(--color-surface-container)' }}>
                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-on-surface-variant)' }}>
                                Worklog Açıklaması
                            </span>
                            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-on-surface)' }}>
                                {result.comment}
                            </p>
                        </div>

                        {/* Action Bar */}
                        <div className="p-4 flex items-center justify-between glass-modal-header">
                            <button 
                                onClick={() => setResult(null)}
                                className="px-4 py-2.5 rounded-xl font-medium transition-all hover:scale-105 glass-icon-btn"
                            >
                                Düzenle
                            </button>
                            <button 
                                onClick={async () => {
                                    if (result.issueKey) {
                                        await onSubmit(result.issueKey, result.hours, result.comment);
                                        onClose();
                                    }
                                }}
                                disabled={!result.issueKey}
                                className="px-6 py-2.5 rounded-xl font-medium transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 flex items-center gap-2"
                                style={{
                                    background: 'linear-gradient(135deg, var(--color-success) 0%, #059669 100%)',
                                    color: 'white',
                                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)'
                                }}
                            >
                                <CheckCircle2 size={18} />
                                Onayla ve Ekle
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};
