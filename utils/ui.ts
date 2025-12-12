export const triggerHaptic = (pattern: number | number[] = 10) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

export const normalizeJiraBaseUrl = (url: string): string => {
    const trimmed = (url ?? '').trim();
    if (!trimmed) return '';

    // Remove trailing slash for consistent concatenation
    let normalized = trimmed.replace(/\/+$/, '');

    // Add https if no protocol specified
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }

    try {
        // Validate format; if invalid, fall back to original (better than breaking UI)
        new URL(normalized);
        return normalized;
    } catch {
        return trimmed;
    }
};
