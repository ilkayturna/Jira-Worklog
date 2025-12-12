// ===================================================================
// AI CLIENT: Frontend wrapper for Vercel AI API
// Purpose: Clean interface for calling AI APIs through Vercel proxy
// Features: Retry logic, timeout, error handling
// ===================================================================

import { AppSettings } from '../types';

interface AICallOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeout?: number;
  retries?: number;
}

interface AIResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ===================================================================
// MAIN AI CALL FUNCTION
// ===================================================================
export async function callAI(
  options: AICallOptions,
  settings: AppSettings
): Promise<string> {
  const {
    prompt,
    maxTokens = 1000,
    temperature = 0.3,
    model,
    timeout = 30000,
    retries = 2
  } = options;

  // Validation
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('❌ Prompt cannot be empty');
  }

  // Determine provider (Groq by default, can be extended)
  const provider = 'groq'; // Can be made configurable

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          maxTokens,
          temperature,
          model: model || settings.groqModel || 'llama-3.3-70b-versatile',
          provider
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data: AIResponse = await response.json();

      if (!data.text) {
        throw new Error('Empty response from AI');
      }

      console.log(`✅ AI Call Success (${data.usage?.totalTokens || 0} tokens)`);
      return data.text;

    } catch (error: any) {
      lastError = error;

      if (error.name === 'AbortError') {
        throw new Error('⏱️ AI request timeout');
      }

      // Don't retry on certain errors
      if (error.message.includes('401') || error.message.includes('403')) {
        throw new Error('🔐 API key invalid');
      }

      console.warn(`🔄 Retry ${attempt + 1}/${retries} - ${error.message}`);

      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error('AI request failed after all retries');
}

// ===================================================================
// SPECIALIZED AI FUNCTIONS
// ===================================================================

/**
 * Improve worklog text with AI (Single Item)
 * Uses the same logic as batch version for consistency
 */
export async function improveText(
  text: string,
  summary: string,
  settings: AppSettings
): Promise<string> {
  const prompt = `Sen profesyonel bir worklog asistanısın. Verilen kısa worklog notunu, bağlama uygun şekilde geliştir.

BAĞLAM (Issue Özeti): ${summary}

KURALLAR:
- Metni 2-3 cümleye genişlet (150-250 karakter arası).
- Doğal, profesyonel Türkçe kullan.
- "Gerçekleştirildi", "sağlandı", "tamamlandı" gibi klişelerden KAÇIN.
- Orijinal metinde olmayan teknik terim veya detay EKLEME.
- Tırnak işareti, emoji, madde işareti KULLANMA.
- Sadece düz metin döndür, başka bir şey yazma.

ORİJİNAL NOT:
${text}

GELİŞTİRİLMİŞ NOT:`;

  const response = await callAI({
    prompt,
    maxTokens: 500,
    temperature: 0.3
  }, settings);

  // Clean up response - remove any quotes, prefixes, etc.
  return response
    .replace(/^["']|["']$/g, '') // Remove surrounding quotes
    .replace(/^(Geliştirilmiş Not:|İyileştirilmiş:)\s*/i, '') // Remove prefixes
    .trim();
}

/**
 * Fix spelling in text (Single Item)
 * Uses the same logic as batch version for consistency
 */
export async function fixSpelling(
  text: string,
  settings: AppSettings
): Promise<string> {
  const prompt = `Sen bir yazım denetleyicisisin. Verilen metindeki yazım ve noktalama hatalarını düzelt.

KURALLAR:
- SADECE yazım ve noktalama hatalarını düzelt.
- Cümle yapısını veya kelimeleri DEĞİŞTİRME (yanlış yazılmış kelimeler hariç).
- Anlamı AYNEN koru.
- Sadece düzeltilmiş metni döndür, başka bir şey yazma.

ORİJİNAL METİN:
${text}

DÜZELTİLMİŞ METİN:`;

  const response = await callAI({
    prompt,
    maxTokens: Math.max(text.length * 2, 500),
    temperature: 0.1
  }, settings);

  // Clean up response - remove any quotes, prefixes, etc.
  return response
    .replace(/^["']|["']$/g, '') // Remove surrounding quotes
    .replace(/^(Düzeltilmiş Metin:|Düzeltilmiş:)\s*/i, '') // Remove prefixes
    .trim();
}

/**
 * Batch improve texts
 */
export async function batchImproveTexts(
  items: Array<{ id: string; summary: string; text: string }>,
  settings: AppSettings
): Promise<Array<{ id: string; text: string }>> {
  const prompt = `Sen profesyonel bir worklog asistanısın. Aşağıdaki worklog notlarını geliştir.

KURALLAR:
- Her notu 2-3 cümleye genişlet (150-250 karakter).
- Bağlam için verilen 'summary' alanını kullan.
- Doğal, profesyonel Türkçe kullan.
- "Gerçekleştirildi", "sağlandı", "tamamlandı" gibi klişelerden KAÇIN.
- Orijinal metinde olmayan teknik terim EKLEME.
- SADECE JSON array döndür, başka bir şey yazma.

GİRİŞ JSON:
${JSON.stringify(items)}

ÇIKIŞ JSON FORMATI:
[
  {"id": "...", "text": "Geliştirilmiş metin..."},
  ...
]`;

  const response = await callAI({
    prompt,
    maxTokens: Math.max(2000, items.length * 200),
    temperature: 0.1
  }, settings);

  // Parse JSON response
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error('JSON Parse Error:', error);
    throw new Error('❌ AI yanıt format hatası');
  }
}

/**
 * Batch fix spelling
 */
export async function batchFixSpelling(
  items: Array<{ id: string; text: string }>,
  settings: AppSettings
): Promise<Array<{ id: string; text: string }>> {
  const prompt = `Sen bir yazım denetleyicisisin. Aşağıdaki metinlerdeki yazım ve noktalama hatalarını düzelt.

KURALLAR:
- SADECE yazım ve noktalama hatalarını düzelt.
- Cümle yapısını veya kelimeleri DEĞİŞTİRME (yanlış yazılmış kelimeler hariç).
- Anlamı AYNEN koru.
- SADECE JSON array döndür, başka bir şey yazma.

GİRİŞ JSON:
${JSON.stringify(items)}

ÇIKIŞ JSON FORMATI:
[
  {"id": "...", "text": "Düzeltilmiş metin..."},
  ...
]`;

  const response = await callAI({
    prompt,
    maxTokens: Math.max(2000, items.length * 150),
    temperature: 0.1
  }, settings);

  // Parse JSON response
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    console.error('JSON Parse Error:', error);
    throw new Error('❌ AI yanıt format hatası');
  }
}
