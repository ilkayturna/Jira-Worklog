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
 * Improve worklog text with AI
 */
export async function improveText(
  text: string,
  summary: string,
  settings: AppSettings
): Promise<string> {
  const prompt = `Sen profesyonel bir worklog asistanısın. Verilen kısa notu, bağlama uygun şekilde 2-3 cümlelik profesyonel Türkçe'ye çevir.

BAĞLAM (Issue Özeti): ${summary}

KURAL:
- 150-250 karakter arası, doğal Türkçe
- "Gerçekleştirildi", "sağlandı" gibi klişelerden kaçın
- Metinde olmayan teknik terim ekleme
- Tırnak, emoji, madde işareti kullanma

Orijinal Not: ${text}

Geliştirilmiş Not:`;

  return callAI({
    prompt,
    maxTokens: 1000,
    temperature: 0.3
  }, settings);
}

/**
 * Fix spelling in text
 */
export async function fixSpelling(
  text: string,
  settings: AppSettings
): Promise<string> {
  const prompt = `Sadece yazım ve noktalama hatalarını düzelt. Cümle yapısını veya kelimeleri değiştirme:

${text}`;

  return callAI({
    prompt,
    maxTokens: Math.max(text.length * 2, 800),
    temperature: 0.1 // Low temperature for deterministic results
  }, settings);
}

/**
 * Batch improve texts
 */
export async function batchImproveTexts(
  items: Array<{ id: string; summary: string; text: string }>,
  settings: AppSettings
): Promise<Array<{ id: string; text: string }>> {
  const prompt = `You are a professional worklog assistant. Improve the following worklog comments to be more professional and slightly expanded (150-250 chars).

INSTRUCTIONS:
- Expand each comment to 2-3 sentences.
- Use the provided 'summary' for context.
- Use natural, professional Turkish.
- Avoid clichés like "gerçekleştirildi", "sağlandı".
- Do NOT use technical terms not present in the original text.
- Return ONLY a JSON array.

INPUT JSON:
${JSON.stringify(items)}

OUTPUT JSON FORMAT:
[
  {"id": "...", "text": "Improved text here..."},
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
    throw new Error('❌ AI response format error');
  }
}

/**
 * Batch fix spelling
 */
export async function batchFixSpelling(
  items: Array<{ id: string; text: string }>,
  settings: AppSettings
): Promise<Array<{ id: string; text: string }>> {
  const prompt = `You are a spell checker. Fix spelling and punctuation errors in the following texts.

INSTRUCTIONS:
- Fix ONLY spelling and punctuation.
- Do NOT change sentence structure or words unless they are misspelled.
- Keep the meaning exactly the same.
- Return ONLY a JSON array.

INPUT JSON:
${JSON.stringify(items)}

OUTPUT JSON FORMAT:
[
  {"id": "...", "text": "Fixed text here..."},
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
    throw new Error('❌ AI response format error');
  }
}
