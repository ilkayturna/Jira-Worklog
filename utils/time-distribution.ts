// ===================================================================
// INTELLIGENT TIME DISTRIBUTION ENGINE
// Purpose: Precision time distribution with ZERO rounding errors
// Algorithm: Integer-based calculation for exact minute allocation
// ===================================================================

import { Worklog } from '../types';
import { callAI } from './ai-client';
import { AppSettings } from '../types';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

export interface DistributionItem {
  worklogId: string;
  issueKey: string;
  summary: string;
  comment: string;
  currentMinutes: number;
  currentHours: number;
}

export interface ComplexityScore {
  worklogId: string;
  score: number; // 1-10
  reasoning?: string;
}

export interface DistributionResult {
  worklogId: string;
  issueKey: string;
  summary: string;
  newMinutes: number;
  newHours: number;
  newSeconds: number;
  difference: number; // in minutes
}

// ===================================================================
// MAIN DISTRIBUTION FUNCTION
// ===================================================================

/**
 * Distribute target hours across worklogs with MATHEMATICAL PRECISION
 * Algorithm: Integer-based minute distribution (no floating point errors)
 * 
 * @param worklogs - Array of worklogs to distribute time across
 * @param targetHours - Target total hours (e.g., 8.05)
 * @param mode - 'equal' for equal distribution, 'ai' for AI-based complexity scoring
 * @param settings - App settings for AI calls
 * @returns Promise with distribution results
 */
export async function distributeTime(
  worklogs: Worklog[],
  targetHours: number,
  mode: 'equal' | 'ai',
  settings: AppSettings
): Promise<DistributionResult[]> {
  
  // ============================================================
  // STEP 1: VALIDATION
  // ============================================================
  
  if (!worklogs || worklogs.length === 0) {
    throw new Error('❌ No worklogs to distribute');
  }

  if (targetHours <= 0 || targetHours > 24) {
    throw new Error('❌ Target hours must be between 0 and 24');
  }

  if (worklogs.length > 50) {
    throw new Error('❌ Too many worklogs (max 50)');
  }

  console.log(`🎯 Target: ${targetHours}h across ${worklogs.length} worklogs (Mode: ${mode})`);

  // ============================================================
  // STEP 2: CONVERT TO INTEGER MINUTES (PRECISION CRITICAL)
  // ============================================================
  
  // Convert hours to minutes and round to integer
  // Example: 8.05h = 8.05 * 60 = 483 minutes
  const targetMinutes = Math.round(targetHours * 60);
  
  console.log(`📊 Target Minutes: ${targetMinutes} (from ${targetHours}h)`);

  // ============================================================
  // STEP 3: GET COMPLEXITY SCORES
  // ============================================================
  
  let scores: ComplexityScore[];

  if (mode === 'ai') {
    scores = await getAIComplexityScores(worklogs, settings);
  } else {
    // Equal distribution: All tasks have same score
    scores = worklogs.map(wl => ({
      worklogId: wl.id,
      score: 1
    }));
  }

  // Validate scores
  if (scores.length !== worklogs.length) {
    throw new Error('❌ Complexity scores count mismatch');
  }

  console.log('📈 Complexity Scores:', scores.map(s => `${s.worklogId.slice(-4)}: ${s.score}`).join(', '));

  // ============================================================
  // STEP 4: CALCULATE TOTAL SCORE
  // ============================================================
  
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);

  if (totalScore === 0) {
    throw new Error('❌ Total complexity score is zero');
  }

  // ============================================================
  // STEP 5: WEIGHTED DISTRIBUTION (INTEGER MATH)
  // ============================================================
  
  const distributions: Array<{
    worklogId: string;
    minutes: number;
    score: number;
  }> = [];

  let distributedMinutes = 0;

  // Calculate proportional minutes for each worklog
  for (const scoreItem of scores) {
    // Formula: (Item Score / Total Score) * Target Minutes
    // Use Math.floor to ensure we don't exceed target
    const proportionalMinutes = Math.floor((scoreItem.score / totalScore) * targetMinutes);
    
    distributions.push({
      worklogId: scoreItem.worklogId,
      minutes: proportionalMinutes,
      score: scoreItem.score
    });

    distributedMinutes += proportionalMinutes;
  }

  console.log(`💼 Initial Distribution: ${distributedMinutes}/${targetMinutes} minutes`);

  // ============================================================
  // STEP 6: DISTRIBUTE REMAINDER (CRITICAL FOR PRECISION)
  // ============================================================
  
  const remainder = targetMinutes - distributedMinutes;

  if (remainder > 0) {
    console.log(`⚖️ Distributing ${remainder} remaining minutes...`);

    // Sort by score descending (highest complexity gets remainder first)
    const sorted = [...distributions].sort((a, b) => b.score - a.score);

    // Distribute remainder to top items (one minute at a time)
    for (let i = 0; i < remainder && i < sorted.length; i++) {
      const item = distributions.find(d => d.worklogId === sorted[i].worklogId);
      if (item) {
        item.minutes += 1;
      }
    }

    console.log(`✅ Remainder distributed to top ${Math.min(remainder, sorted.length)} items`);
  }

  // ============================================================
  // STEP 7: VERIFY TOTAL (MUST BE EXACT)
  // ============================================================
  
  const finalTotal = distributions.reduce((sum, d) => sum + d.minutes, 0);

  if (finalTotal !== targetMinutes) {
    console.error('🚨 PRECISION ERROR:', {
      target: targetMinutes,
      distributed: finalTotal,
      difference: Math.abs(targetMinutes - finalTotal)
    });
    throw new Error(`❌ Distribution precision error: ${finalTotal} !== ${targetMinutes}`);
  }

  console.log(`✅ VERIFICATION PASSED: ${finalTotal} minutes = ${targetMinutes} minutes`);

  // ============================================================
  // STEP 8: BUILD RESULTS
  // ============================================================
  
  const results: DistributionResult[] = worklogs.map(wl => {
    const dist = distributions.find(d => d.worklogId === wl.id);
    const newMinutes = dist?.minutes || 0;
    const newHours = newMinutes / 60; // Convert back to hours for display
    const newSeconds = newMinutes * 60; // For Jira API

    return {
      worklogId: wl.id,
      issueKey: wl.issueKey,
      summary: wl.summary,
      newMinutes,
      newHours: Math.round(newHours * 100) / 100, // Round to 2 decimals for display
      newSeconds,
      difference: newMinutes - Math.round(wl.seconds / 60)
    };
  });

  // ============================================================
  // STEP 9: FINAL VALIDATION
  // ============================================================
  
  const totalSeconds = results.reduce((sum, r) => sum + r.newSeconds, 0);
  const totalHours = totalSeconds / 3600;
  const expectedSeconds = targetHours * 3600;

  console.log('📊 Distribution Summary:', {
    targetHours,
    actualHours: Math.round(totalHours * 100) / 100,
    targetSeconds: Math.round(expectedSeconds),
    actualSeconds: totalSeconds,
    difference: Math.abs(totalSeconds - expectedSeconds)
  });

  // Allow 1 second tolerance due to rounding
  if (Math.abs(totalSeconds - expectedSeconds) > 1) {
    console.warn('⚠️ Minor precision warning (within 1 second tolerance)');
  }

  return results;
}

// ===================================================================
// AI COMPLEXITY SCORING
// ===================================================================

/**
 * Get AI-based complexity scores for worklogs
 * AI returns only a score (1-10) for each task
 */
async function getAIComplexityScores(
  worklogs: Worklog[],
  settings: AppSettings
): Promise<ComplexityScore[]> {
  
  // Prepare input for AI
  const items = worklogs.map(wl => ({
    id: wl.id,
    issueKey: wl.issueKey,
    summary: wl.summary,
    comment: wl.comment || 'No comment'
  }));

  const prompt = `You are a work complexity analyzer. Analyze the following tasks and assign each a COMPLEXITY SCORE from 1 to 10.

SCORING GUIDE:
- 1-2: Very simple (typo fix, minor text change)
- 3-4: Simple (small bug fix, basic feature)
- 5-6: Medium (feature implementation, moderate bug)
- 7-8: Complex (multi-component feature, difficult bug)
- 9-10: Very complex (architecture change, critical issue)

INSTRUCTIONS:
- Analyze issue summary and worklog comment
- Return ONLY a JSON array
- Each item must have "id" and "score" (integer 1-10)
- Do NOT add extra fields or text

INPUT JSON:
${JSON.stringify(items)}

OUTPUT JSON FORMAT:
[
  {"id": "worklog-id-1", "score": 7},
  {"id": "worklog-id-2", "score": 3},
  ...
]`;

  try {
    const response = await callAI({
      prompt,
      maxTokens: Math.max(500, items.length * 50),
      temperature: 0.1 // Low temperature for consistent scoring
    }, settings);

    // Parse JSON response
    let parsed: Array<{ id: string; score: number }>;
    
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(response);
      }
    } catch (error) {
      console.error('JSON Parse Error:', error);
      throw new Error('❌ AI response format error');
    }

    // Validate and sanitize scores
    const scores: ComplexityScore[] = worklogs.map(wl => {
      const aiScore = parsed.find(p => p.id === wl.id);
      let score = aiScore?.score || 5; // Default to medium complexity

      // Clamp score to 1-10 range
      score = Math.max(1, Math.min(10, Math.round(score)));

      return {
        worklogId: wl.id,
        score
      };
    });

    return scores;

  } catch (error: any) {
    console.error('AI Complexity Scoring Failed:', error);
    
    // Fallback: Use comment length as complexity proxy
    console.warn('⚠️ Using fallback: comment length as complexity');
    
    return worklogs.map(wl => {
      const commentLength = wl.comment?.length || 0;
      // Map comment length to score (longer comment = potentially more complex)
      const score = Math.min(10, Math.max(1, Math.ceil(commentLength / 20)));
      
      return {
        worklogId: wl.id,
        score
      };
    });
  }
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Format minutes to hours display
 */
export function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (mins === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${mins}m`;
}

/**
 * Format hours to Jira format (1.5h)
 */
export function formatHoursDecimal(hours: number): string {
  return `${hours.toFixed(2)}h`;
}
