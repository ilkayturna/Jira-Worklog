// ===================================================================
// CLIENT-SIDE RAG: Snippet Library & Learning System
// Purpose: Store and retrieve high-quality worklog examples
// Storage: localStorage for instant access, no backend needed
// ===================================================================

import { Worklog } from '../types';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

export interface SnippetEntry {
  id: string;
  issueKey: string;
  summary: string;
  originalText: string;
  improvedText: string;
  rating: 'excellent' | 'good' | 'neutral';
  timestamp: number;
  tags: string[];
  useCount: number;
}

export interface SnippetStats {
  totalSnippets: number;
  excellentCount: number;
  avgLength: number;
  mostUsedTags: string[];
}

// ===================================================================
// CONSTANTS
// ===================================================================

const SNIPPET_LIBRARY_KEY = 'jira_worklog_snippet_library';
const MAX_SNIPPETS = 100; // Limit to prevent localStorage overflow
const SIMILARITY_THRESHOLD = 0.3; // For keyword matching

// ===================================================================
// MAIN FUNCTIONS
// ===================================================================

/**
 * Load all snippets from localStorage
 */
export function loadSnippetLibrary(): SnippetEntry[] {
  try {
    const saved = localStorage.getItem(SNIPPET_LIBRARY_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    
    if (!Array.isArray(parsed)) {
      console.warn('Invalid snippet library format, resetting...');
      return [];
    }

    return parsed;
  } catch (error) {
    console.error('❌ Failed to load snippet library:', error);
    return [];
  }
}

/**
 * Save snippets to localStorage
 */
export function saveSnippetLibrary(snippets: SnippetEntry[]): void {
  try {
    // Enforce size limit
    const limited = snippets.slice(0, MAX_SNIPPETS);
    localStorage.setItem(SNIPPET_LIBRARY_KEY, JSON.stringify(limited));
    console.log(`💾 Saved ${limited.length} snippets`);
  } catch (error: any) {
    if (error.name === 'QuotaExceededError') {
      console.error('❌ Storage quota exceeded, pruning old snippets...');
      // Keep only excellent rated snippets
      const pruned = snippets.filter(s => s.rating === 'excellent').slice(0, 50);
      localStorage.setItem(SNIPPET_LIBRARY_KEY, JSON.stringify(pruned));
    } else {
      console.error('❌ Failed to save snippet library:', error);
    }
  }
}

/**
 * Add a new snippet to the library
 */
export function addSnippet(
  worklog: Worklog,
  originalText: string,
  improvedText: string,
  rating: 'excellent' | 'good' | 'neutral' = 'good'
): void {
  const snippets = loadSnippetLibrary();

  // Check for duplicates (same improved text)
  const duplicate = snippets.find(s => 
    s.improvedText.toLowerCase() === improvedText.toLowerCase()
  );

  if (duplicate) {
    console.log('⚠️ Snippet already exists, updating rating...');
    duplicate.rating = rating;
    duplicate.useCount += 1;
    saveSnippetLibrary(snippets);
    return;
  }

  // Extract tags from summary and text
  const tags = extractKeywords(worklog.summary + ' ' + improvedText);

  const newSnippet: SnippetEntry = {
    id: `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    issueKey: worklog.issueKey,
    summary: worklog.summary,
    originalText,
    improvedText,
    rating,
    timestamp: Date.now(),
    tags,
    useCount: 0
  };

  snippets.unshift(newSnippet); // Add to beginning

  // Sort by rating and recency
  const sorted = snippets.sort((a, b) => {
    if (a.rating === 'excellent' && b.rating !== 'excellent') return -1;
    if (a.rating !== 'excellent' && b.rating === 'excellent') return 1;
    return b.timestamp - a.timestamp;
  });

  saveSnippetLibrary(sorted);
  console.log(`✅ Added new snippet: ${newSnippet.id}`);
}

/**
 * Find relevant snippets for a given worklog
 * Uses simple keyword matching (no embeddings needed)
 */
export function findRelevantSnippets(
  worklog: Worklog,
  limit: number = 3
): SnippetEntry[] {
  const snippets = loadSnippetLibrary();

  if (snippets.length === 0) {
    return [];
  }

  // Extract keywords from current worklog
  const queryKeywords = extractKeywords(worklog.summary + ' ' + (worklog.comment || ''));

  // Calculate similarity scores
  const scored = snippets.map(snippet => {
    const score = calculateKeywordSimilarity(queryKeywords, snippet.tags);
    return { snippet, score };
  });

  // Filter and sort
  const relevant = scored
    .filter(item => item.score > SIMILARITY_THRESHOLD)
    .sort((a, b) => {
      // Prioritize excellent ratings
      if (a.snippet.rating === 'excellent' && b.snippet.rating !== 'excellent') return -1;
      if (a.snippet.rating !== 'excellent' && b.snippet.rating === 'excellent') return 1;
      // Then by similarity score
      return b.score - a.score;
    })
    .slice(0, limit)
    .map(item => item.snippet);

  console.log(`🔍 Found ${relevant.length} relevant snippets for ${worklog.issueKey}`);
  return relevant;
}

/**
 * Update snippet rating
 */
export function updateSnippetRating(
  snippetId: string,
  rating: 'excellent' | 'good' | 'neutral'
): void {
  const snippets = loadSnippetLibrary();
  const snippet = snippets.find(s => s.id === snippetId);

  if (snippet) {
    snippet.rating = rating;
    saveSnippetLibrary(snippets);
    console.log(`✅ Updated snippet ${snippetId} rating to ${rating}`);
  }
}

/**
 * Delete a snippet
 */
export function deleteSnippet(snippetId: string): void {
  const snippets = loadSnippetLibrary();
  const filtered = snippets.filter(s => s.id !== snippetId);
  saveSnippetLibrary(filtered);
  console.log(`🗑️ Deleted snippet ${snippetId}`);
}

/**
 * Increment snippet use count
 */
export function incrementSnippetUse(snippetId: string): void {
  const snippets = loadSnippetLibrary();
  const snippet = snippets.find(s => s.id === snippetId);

  if (snippet) {
    snippet.useCount += 1;
    saveSnippetLibrary(snippets);
  }
}

/**
 * Get library statistics
 */
export function getSnippetStats(): SnippetStats {
  const snippets = loadSnippetLibrary();

  if (snippets.length === 0) {
    return {
      totalSnippets: 0,
      excellentCount: 0,
      avgLength: 0,
      mostUsedTags: []
    };
  }

  const excellentCount = snippets.filter(s => s.rating === 'excellent').length;
  const avgLength = Math.round(
    snippets.reduce((sum, s) => sum + s.improvedText.length, 0) / snippets.length
  );

  // Count tag frequency
  const tagCounts: Record<string, number> = {};
  snippets.forEach(s => {
    s.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  const mostUsedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  return {
    totalSnippets: snippets.length,
    excellentCount,
    avgLength,
    mostUsedTags
  };
}

/**
 * Build context for AI prompt from relevant snippets
 */
export function buildSnippetContext(snippets: SnippetEntry[]): string {
  if (snippets.length === 0) {
    return '';
  }

  const examples = snippets.map((s, i) => `
ÖRNEK ${i + 1}:
Issue: ${s.summary}
Önce: ${s.originalText}
Sonra: ${s.improvedText}
  `).join('\n');

  return `
ÖNCEKİ BAŞARILI ÖRNEKLER (Benzer tarz kullan):
${examples}
`;
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Extract keywords from text
 * Simple Turkish-aware tokenization
 */
function extractKeywords(text: string): string[] {
  // Turkish stopwords
  const stopwords = new Set([
    've', 'ile', 'bir', 'bu', 'için', 'da', 'de', 'var', 'olan',
    'olan', 'daha', 'çok', 'gibi', 'ama', 'fakat', 'veya', 'ya', 'ise',
    'ben', 'sen', 'o', 'biz', 'siz', 'onlar', 'mi', 'mu', 'mı', 'mü'
  ]);

  // Tokenize and clean
  const tokens = text
    .toLowerCase()
    .replace(/[^\wçğıöşü\s]/gi, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word));

  // Remove duplicates
  return Array.from(new Set(tokens));
}

/**
 * Calculate keyword similarity (Jaccard Index)
 */
function calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);

  // Intersection
  const intersection = new Set([...set1].filter(x => set2.has(x)));

  // Union
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;

  // Jaccard similarity
  return intersection.size / union.size;
}

/**
 * Clear all snippets (for reset)
 */
export function clearSnippetLibrary(): void {
  localStorage.removeItem(SNIPPET_LIBRARY_KEY);
  console.log('🗑️ Snippet library cleared');
}

/**
 * Export snippets as JSON (for backup)
 */
export function exportSnippets(): string {
  const snippets = loadSnippetLibrary();
  return JSON.stringify(snippets, null, 2);
}

/**
 * Import snippets from JSON
 */
export function importSnippets(json: string): void {
  try {
    const parsed = JSON.parse(json);
    
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid format');
    }

    saveSnippetLibrary(parsed);
    console.log(`✅ Imported ${parsed.length} snippets`);
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw new Error('Invalid snippet JSON');
  }
}
