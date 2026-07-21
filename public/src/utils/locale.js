const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

export function getUserLocale() {
    if (typeof navigator === 'undefined') {
        return 'en-NZ';
    }

    const locale = Array.isArray(navigator.languages) && navigator.languages[0]
        ? navigator.languages[0]
        : navigator.language;
    return locale || 'en-NZ';
}

export function usesImperialUnits(locale = getUserLocale()) {
    let region = 'NZ';

    if (locale && typeof locale === 'string') {
        try {
            const parsed = new Intl.Locale(locale);
            region = (parsed.region || '').toUpperCase();
        } catch {
            const normalized = locale.replace('_', '-');
            const parts = normalized.split('-');
            region = (parts[1] || '').toUpperCase();
        }
    }

    return IMPERIAL_REGIONS.has(region);
}
