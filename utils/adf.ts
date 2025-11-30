// Helper to parse Jira's Atlassian Document Format (ADF)
export function extractTextFromADF(node: any, result: string[] = []): string {
  if (!node) return '';
  if (typeof node === 'string') {
    result.push(node);
  } else if (node && typeof node === 'object') {
    if (node.text) result.push(String(node.text));
    if (Array.isArray(node.content)) {
      node.content.forEach((item: any) => extractTextFromADF(item, result));
    }
    if (node.type === 'hardBreak' || node.type === 'paragraph') {
      result.push(' ');
    }
  }
  return result.join('').trim();
}

export function parseJiraComment(comment: any): string {
  if (!comment) return '';
  if (typeof comment === 'string') return comment.trim();
  try {
    if (comment.type === 'doc' || Array.isArray(comment.content)) {
      return extractTextFromADF(comment);
    }
    if (comment.text) return String(comment.text).trim();
    return JSON.stringify(comment);
  } catch (e) {
    return String(comment);
  }
}

export function plainTextToADF(text: string) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const paragraphs = trimmed.split(/\n\n+/).filter(p => p.trim().length > 0);
  if (paragraphs.length === 0) paragraphs.push(trimmed);

  const content = paragraphs.map(para => {
    const lines = para.split('\n').filter(l => l.trim().length > 0);
    const paraContent: any[] = [];

    lines.forEach((line, idx) => {
      if (line.trim().length > 0) {
        paraContent.push({ type: 'text', text: line.trim() });
      }
      if (idx < lines.length - 1) {
        paraContent.push({ type: 'hardBreak' });
      }
    });

    return {
      type: 'paragraph',
      content: paraContent.length > 0 ? paraContent : [{ type: 'text', text: para.trim() }]
    };
  });

  return { type: 'doc', version: 1, content };
}

export function secondsToHours(seconds: number): number {
  // Saniyeyi saate çevir, 2 ondalık basamak hassasiyetinde (floor ile aşağı yuvarla)
  const hours = seconds / 3600;
  return Math.floor(hours * 100) / 100;
}

// Display için formatlama - tam sayı gösterir veya ondalık
export function formatHours(hours: number): string {
  // Tam sayıysa .0 gösterme, değilse 2 ondalık
  if (hours === Math.floor(hours)) {
    return hours.toString();
  }
  return hours.toFixed(2);
}

export function parseSmartTimeInput(input: string): number | null {
  if (!input) return null;
  const str = input.trim().toLowerCase();

  // 1h 30m
  const hm = /^(\d+(?:\.\d+)?)\s*h\s*(?:(\d+(?:\.\d+)?)\s*m)?$/.exec(str);
  if (hm) {
    const hours = parseFloat(hm[1]);
    const minutes = hm[2] ? parseFloat(hm[2]) : 0;
    return hours + minutes / 60;
  }
  // 90m
  const m = /^(\d+(?:\.\d+)?)\s*m$/.exec(str);
  if (m) {
    return parseFloat(m[1]) / 60;
  }
  // 1:30
  const colon = /^(\d+):(\d{2})$/.exec(str);
  if (colon) {
    const hours = parseInt(colon[1]);
    const minutes = parseInt(colon[2]);
    return hours + minutes / 60;
  }
  // 1.5
  const decimal = /^(\d+(?:\.\d+)?)$/.exec(str);
  if (decimal) {
    return parseFloat(decimal[1]);
  }
  return null;
}