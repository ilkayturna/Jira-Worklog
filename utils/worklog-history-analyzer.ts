// ===================================================================
// WORKLOG HISTORY ANALYZER
// Purpose: Analyze past worklogs for AI context and learning
// Features: Similar work detection, pattern analysis, cached results
// ===================================================================

import React from 'react';
import { Worklog, WorklogSuggestion } from '../types';

// In-memory cache for analyzed patterns
interface AnalysisCache {
  timestamp: number;
  patterns: Map<string, WorklogPattern>;
  issueStats: Map<string, IssueStats>;
}

interface WorklogPattern {
  issueKey: string;
  summary: string;
  comments: string[];
  hours: number[];
  avgHours: number;
  minHours: number;
  maxHours: number;
  frequency: number;
  keywords: string[];
  lastUsed: string;
}

interface IssueStats {
  issueKey: string;
  totalHours: number;
  entryCount: number;
  avgHoursPerEntry: number;
  comments: string[];
}

// Cache instance (5 minute TTL)
let analysisCache: AnalysisCache | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// ===================================================================
// MAIN ANALYZER FUNCTIONS
// ===================================================================

/**
 * Extract keywords from worklog comment for similarity matching
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  
  // Turkish and English stop words
  const stopWords = new Set([
    'bir', 'bu', 'şu', 've', 'veya', 'ile', 'için', 'de', 'da', 'den', 'dan',
    'ki', 'ama', 'fakat', 'ancak', 'çünkü', 'eğer', 'daha', 'en', 'çok', 'az',
    'the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'to', 'of', 'in', 'on',
    'olarak', 'sonra', 'önce', 'kadar', 'gibi', 'üzere', 'dolayı', 'tarafından',
    'edildi', 'yapıldı', 'gerçekleştirildi', 'tamamlandı', 'işlemi', 'işlem'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^\wçğıöşü\s]/gi, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Calculate similarity between two keyword sets (Jaccard similarity)
 */
function calculateSimilarity(keywords1: string[], keywords2: string[]): number {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;
  
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Analyze cached worklogs and build patterns
 */
export function analyzeWorklogHistory(
  cacheRef: React.MutableRefObject<Map<string, { worklogs: Worklog[], timestamp: number }> | null>
): Map<string, WorklogPattern> {
  // Check if cache is valid
  if (analysisCache && Date.now() - analysisCache.timestamp < CACHE_TTL) {
    return analysisCache.patterns;
  }
  
  const patterns = new Map<string, WorklogPattern>();
  
  if (!cacheRef.current) return patterns;
  
  // Iterate through all cached worklogs
  cacheRef.current.forEach((cached) => {
    cached.worklogs.forEach(wl => {
      if (!wl.issueKey || !wl.comment) return;
      
      const existing = patterns.get(wl.issueKey);
      const keywords = extractKeywords(wl.comment);
      
      if (existing) {
        existing.comments.push(wl.comment);
        existing.hours.push(wl.hours);
        existing.frequency++;
        existing.keywords = [...new Set([...existing.keywords, ...keywords])];
        existing.avgHours = existing.hours.reduce((a, b) => a + b, 0) / existing.hours.length;
        existing.minHours = Math.min(...existing.hours);
        existing.maxHours = Math.max(...existing.hours);
        if (wl.started > existing.lastUsed) {
          existing.lastUsed = wl.started;
        }
      } else {
        patterns.set(wl.issueKey, {
          issueKey: wl.issueKey,
          summary: wl.summary,
          comments: [wl.comment],
          hours: [wl.hours],
          avgHours: wl.hours,
          minHours: wl.hours,
          maxHours: wl.hours,
          frequency: 1,
          keywords,
          lastUsed: wl.started
        });
      }
    });
  });
  
  // Update cache
  analysisCache = {
    timestamp: Date.now(),
    patterns,
    issueStats: new Map()
  };
  
  return patterns;
}

/**
 * Find similar worklogs based on issue key or comment similarity
 */
export function findSimilarWorklogs(
  targetWorklog: Worklog,
  patterns: Map<string, WorklogPattern>,
  limit: number = 5
): WorklogPattern[] {
  const targetKeywords = extractKeywords(targetWorklog.comment);
  const targetSummaryKeywords = extractKeywords(targetWorklog.summary);
  const allTargetKeywords = [...new Set([...targetKeywords, ...targetSummaryKeywords])];
  
  const similarities: Array<{ pattern: WorklogPattern; score: number }> = [];
  
  patterns.forEach(pattern => {
    // Skip if same issue key (we want to find similar DIFFERENT issues)
    // But still include same issue key with lower priority
    let score = 0;
    
    // Same issue key gets a base boost
    if (pattern.issueKey === targetWorklog.issueKey) {
      score += 0.3;
    }
    
    // Keyword similarity from summary
    const summaryKeywords = extractKeywords(pattern.summary);
    score += calculateSimilarity(targetSummaryKeywords, summaryKeywords) * 0.4;
    
    // Keyword similarity from comments
    score += calculateSimilarity(allTargetKeywords, pattern.keywords) * 0.3;
    
    if (score > 0.1) {
      similarities.push({ pattern, score });
    }
  });
  
  // Sort by score descending
  similarities.sort((a, b) => b.score - a.score);
  
  return similarities.slice(0, limit).map(s => s.pattern);
}

/**
 * Get historical context for AI prompts
 * Returns formatted string with similar past worklogs
 */
export function getHistoricalContext(
  targetWorklog: Worklog,
  cacheRef: React.MutableRefObject<Map<string, { worklogs: Worklog[], timestamp: number }> | null>,
  maxExamples: number = 5
): string {
  const patterns = analyzeWorklogHistory(cacheRef);
  const similar = findSimilarWorklogs(targetWorklog, patterns, maxExamples);
  
  if (similar.length === 0) {
    return '';
  }
  
  // Extract ONLY writing style patterns, not content
  const styleExamples = similar.map(p => {
    // Get a few diverse comment examples to show writing style
    const uniqueStyles = p.comments
      .filter(c => c.length > 15 && c.length < 200)
      .slice(0, 2)
      .map(c => `"${c}"`);
    
    return uniqueStyles.length > 0 ? uniqueStyles.join(', ') : null;
  }).filter(Boolean);
  
  if (styleExamples.length === 0) {
    return '';
  }
  
  return `\n\nYAZIM TARZI ÖRNEKLERİ (Bu dil ve üslubu kullan, içeriği DEĞİL):
${styleExamples.slice(0, 4).join('\n')}

NOT: Yukarıdaki örnekler SADECE yazım tarzını göstermek içindir. İçeriklerini kopyalama, sadece benzer profesyonel dili kullan.`;
}

/**
 * Get work complexity estimate based on historical data
 */
export function estimateWorkComplexity(
  worklog: Worklog,
  cacheRef: React.MutableRefObject<Map<string, { worklogs: Worklog[], timestamp: number }> | null>
): { 
  estimatedHours: number; 
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  similar: WorklogPattern[];
} {
  const patterns = analyzeWorklogHistory(cacheRef);
  const similar = findSimilarWorklogs(worklog, patterns, 3);
  
  if (similar.length === 0) {
    return {
      estimatedHours: 1.0,
      confidence: 'low',
      reasoning: 'Geçmiş veri bulunamadı',
      similar: []
    };
  }
  
  // Calculate weighted average based on similarity
  const totalFrequency = similar.reduce((sum, p) => sum + p.frequency, 0);
  const weightedHours = similar.reduce((sum, p) => 
    sum + (p.avgHours * p.frequency / totalFrequency), 0
  );
  
  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (totalFrequency >= 5) confidence = 'high';
  else if (totalFrequency >= 2) confidence = 'medium';
  
  // Check if exact issue key exists
  const exactMatch = patterns.get(worklog.issueKey);
  if (exactMatch && exactMatch.frequency >= 3) {
    return {
      estimatedHours: exactMatch.avgHours,
      confidence: 'high',
      reasoning: `Bu issue için ${exactMatch.frequency} geçmiş kayıt bulundu. Ortalama: ${exactMatch.avgHours.toFixed(2)}h`,
      similar: [exactMatch, ...similar.filter(s => s.issueKey !== worklog.issueKey)]
    };
  }
  
  const reasoning = similar.length > 0
    ? `${similar.length} benzer iş analiz edildi (toplam ${totalFrequency} kayıt)`
    : 'Tahmine dayalı';
  
  return {
    estimatedHours: Math.round(weightedHours * 100) / 100,
    confidence,
    reasoning,
    similar
  };
}

/**
 * Generate AI-ready context string for batch processing
 * Only provides writing style examples, NOT content to copy
 */
export function generateBatchContext(
  worklogs: Worklog[],
  cacheRef: React.MutableRefObject<Map<string, { worklogs: Worklog[], timestamp: number }> | null>
): string {
  const patterns = analyzeWorklogHistory(cacheRef);
  
  // Collect diverse writing style examples (not content)
  const styleExamples: string[] = [];
  
  patterns.forEach(p => {
    if (styleExamples.length >= 6) return;
    
    // Get short, diverse comments that show writing style
    const goodExamples = p.comments
      .filter(c => c.length > 20 && c.length < 150)
      .slice(0, 1);
    
    goodExamples.forEach(c => {
      if (!styleExamples.includes(c)) {
        styleExamples.push(`"${c}"`);
      }
    });
  });
  
  if (styleExamples.length === 0) {
    return '';
  }
  
  return `\n\nYAZIM TARZI ÖRNEKLERİ (Sadece bu üslubu taklit et, içeriği DEĞİL):
${styleExamples.slice(0, 5).join('\n')}

ÖNEMLİ: Bu örnekler sadece profesyonel Türkçe worklog yazım tarzını gösteriyor. İçeriklerini kopyalama, sadece benzer dil ve üslup kullan.`;
}

/**
 * Clear analysis cache (call when worklogs are updated)
 */
export function clearAnalysisCache(): void {
  analysisCache = null;
}
