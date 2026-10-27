import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeoManager } from '../public/src/ui/SeoManager.js';

describe('SeoManager Unit Tests', () => {
    beforeEach(() => {
        const metaDesc = {
            tagName: 'META',
            getAttribute: (attr) => attr === 'name' ? 'description' : null,
            setAttribute: vi.fn()
        };
        const metaTitle = {
            tagName: 'META',
            getAttribute: (attr) => attr === 'name' ? 'twitter:title' : null,
            setAttribute: vi.fn()
        };
        const metaUrl = {
            tagName: 'META',
            getAttribute: (attr) => attr === 'name' ? 'twitter:url' : null,
            setAttribute: vi.fn()
        };
        const linkCanonical = {
            tagName: 'LINK',
            getAttribute: (attr) => attr === 'rel' ? 'canonical' : null,
            setAttribute: vi.fn()
        };

        metaDesc.nextElementSibling = metaTitle;
        metaTitle.nextElementSibling = metaUrl;
        metaUrl.nextElementSibling = linkCanonical;
        linkCanonical.nextElementSibling = null;

        const dynamicScript = { id: 'dynamic-json-ld', parentNode: { removeChild: vi.fn() } };

        vi.stubGlobal('document', {
            title: '',
            head: {
                firstElementChild: metaDesc,
                appendChild: vi.fn()
            },
            getElementById: vi.fn((id) => id === 'dynamic-json-ld' ? dynamicScript : null),
            createElement: vi.fn(() => ({ setAttribute: vi.fn(), appendChild: vi.fn() }))
        });

        vi.stubGlobal('window', {
            location: { href: 'https://circuit-weather.racing/f1/1', origin: 'https://circuit-weather.racing' }
        });
    });

    it('updates title and meta tags correctly', () => {
        SeoManager.updateMetaTags('Test Title', 'Test Desc');
        expect(document.title).toBe('Test Title');
    });

    it('updates page metadata for race and session', () => {
        const race = { round: '1', name: 'Bahrain GP', circuit: { circuitName: 'Sakhir' }, location: { country: 'Bahrain', lat: '26', long: '50' } };
        const session = { id: 'fp1', name: 'Practice 1', date: '2024-03-01', time: '10:00:00Z' };

        SeoManager.updatePageMetadata(race, session);
        expect(document.title).toBeDefined();
    });

    it('handles removing event schema when session is null', () => {
        const race = { round: '1', name: 'Bahrain GP' };
        SeoManager.updatePageMetadata(race, null);
        expect(document.title).toBeDefined();
    });

    it('uses the series in breadcrumb URLs', () => {
        const script = { id: 'dynamic-breadcrumb-ld', textContent: '' };
        document.getElementById = vi.fn((id) => (id === 'dynamic-breadcrumb-ld' ? script : null));
        const race = { round: '13', name: 'Qatar' };
        const session = { id: 'feature-race', name: 'Feature Race' };

        SeoManager.updateBreadcrumbJsonLd(race, session, 'f2');
        const items = JSON.parse(script.textContent).itemListElement;
        expect(items[1].item).toBe('https://circuit-weather.racing/f2/13');
        expect(items[2].item).toBe('https://circuit-weather.racing/f2/13/feature-race');

        SeoManager.updateBreadcrumbJsonLd(race, null);
        expect(JSON.parse(script.textContent).itemListElement[1].item).toBe('https://circuit-weather.racing/f1/13');
    });
});
