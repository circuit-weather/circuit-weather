const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

function parseLocale(locale) {
    if (!locale || typeof locale !== 'string') {
        return { language: 'en', region: 'NZ' };
    }

    try {
        const parsed = new Intl.Locale(locale);
        return {
            language: (parsed.language || 'en').toLowerCase(),
            region: (parsed.region || '').toUpperCase(),
        };
    } catch {
        const normalized = locale.replace('_', '-');
        const parts = normalized.split('-');
        return {
            language: (parts[0] || 'en').toLowerCase(),
            region: (parts[1] || '').toUpperCase(),
        };
    }
}

export function getUserLocale() {
    if (typeof navigator === 'undefined') {
        return 'en-NZ';
    }

    const locale = Array.isArray(navigator.languages) && navigator.languages[0]
        ? navigator.languages[0]
        : navigator.language;
    return locale || 'en-NZ';
}

export function getLocaleMeta(locale = getUserLocale()) {
    return parseLocale(locale);
}

export function usesImperialUnits(locale = getUserLocale()) {
    const { region } = getLocaleMeta(locale);
    return IMPERIAL_REGIONS.has(region);
}
