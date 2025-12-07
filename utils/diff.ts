export interface DiffPart {
  text: string;
  type: 'unchanged' | 'added' | 'removed';
}

export const computeWordDiff = (before: string, after: string): { beforeParts: DiffPart[], afterParts: DiffPart[] } => {
  const beforeWords = before.split(/(\s+)/);
  const afterWords = after.split(/(\s+)/);
  
  // Simple LCS-based diff for words
  const m = beforeWords.length;
  const n = afterWords.length;
  
  // Build LCS table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeWords[i - 1] === afterWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find diff
  const beforeParts: DiffPart[] = [];
  const afterParts: DiffPart[] = [];
  
  let i = m, j = n;
  const beforeResult: DiffPart[] = [];
  const afterResult: DiffPart[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeWords[i - 1] === afterWords[j - 1]) {
      beforeResult.unshift({ text: beforeWords[i - 1], type: 'unchanged' });
      afterResult.unshift({ text: afterWords[j - 1], type: 'unchanged' });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      afterResult.unshift({ text: afterWords[j - 1], type: 'added' });
      j--;
    } else if (i > 0) {
      beforeResult.unshift({ text: beforeWords[i - 1], type: 'removed' });
      i--;
    }
  }
  
  // Merge consecutive same-type parts
  const mergeParts = (parts: DiffPart[]): DiffPart[] => {
    const merged: DiffPart[] = [];
    for (const part of parts) {
      if (merged.length > 0 && merged[merged.length - 1].type === part.type) {
        merged[merged.length - 1].text += part.text;
      } else {
        merged.push({ ...part });
      }
    }
    return merged;
  };
  
  return {
    beforeParts: mergeParts(beforeResult),
    afterParts: mergeParts(afterResult)
  };
};
