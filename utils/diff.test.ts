import { describe, it, expect } from 'vitest';
import { computeWordDiff } from './diff';

describe('computeWordDiff', () => {
  it('should identify unchanged text', () => {
    const result = computeWordDiff('hello world', 'hello world');
    expect(result.beforeParts).toEqual([{ text: 'hello world', type: 'unchanged' }]);
    expect(result.afterParts).toEqual([{ text: 'hello world', type: 'unchanged' }]);
  });

  it('should identify added text', () => {
    const result = computeWordDiff('hello', 'hello world');
    // Note: splitting by (\s+) keeps delimiters. 'hello world' -> ['hello', ' ', 'world']
    expect(result.afterParts).toEqual([
      { text: 'hello', type: 'unchanged' },
      { text: ' world', type: 'added' }
    ]);
  });

  it('should identify removed text', () => {
    const result = computeWordDiff('hello world', 'hello');
    expect(result.beforeParts).toEqual([
      { text: 'hello', type: 'unchanged' },
      { text: ' world', type: 'removed' }
    ]);
  });

  it('should identify mixed changes', () => {
    const result = computeWordDiff('hello world', 'hello there');
    // 'hello world' -> ['hello', ' ', 'world']
    // 'hello there' -> ['hello', ' ', 'there']
    
    const hasRemoved = result.beforeParts.some(p => p.type === 'removed' && p.text.includes('world'));
    const hasAdded = result.afterParts.some(p => p.type === 'added' && p.text.includes('there'));
    
    expect(hasRemoved).toBe(true);
    expect(hasAdded).toBe(true);
  });
});
