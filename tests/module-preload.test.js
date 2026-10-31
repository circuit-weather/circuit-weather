import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

// index.html lists every module the app imports at startup as a modulepreload,
// so they download together rather than one import level at a time. This keeps
// that list in step with the real static import graph from src/main.js.
const read = (path) => readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8');
const html = read('/index.html');

function staticImportGraph(entry) {
    const seen = new Set();
    const walk = (file) => {
        if (seen.has(file)) return;
        seen.add(file);
        for (const [, specifier] of read(file).matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)) {
            walk(posix.normalize(posix.join(posix.dirname(file), specifier)));
        }
    };
    walk(entry);
    return seen;
}

describe('index.html preloads', () => {
    const preloaded = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]);

    it('modulepreloads exactly the modules imported at startup', () => {
        expect(new Set(preloaded)).toEqual(staticImportGraph('/src/main.js'));
        expect(preloaded).toHaveLength(new Set(preloaded).size);
    });

    it('leaves the non-English locales to load on demand', () => {
        expect(preloaded.filter(path => path.startsWith('/src/i18n/locales/')).sort())
            .toEqual(['/src/i18n/locales/en-GB.js', '/src/i18n/locales/en-NZ.js', '/src/i18n/locales/en-US.js', '/src/i18n/locales/en.js']);
    });

    it('starts the slow requests early without blocking the page', () => {
        expect(html).toContain('<link rel="preload" href="/api/config" as="fetch" crossorigin>');
        expect(html).toContain('<link rel="preload" href="/api/radar" as="fetch" crossorigin>');
        expect(html).toContain('<link rel="preload" href="/api/assets/mapbox-gl.js" as="script" fetchpriority="low">');
        // No render-blocking third-party or map library scripts
        expect(html).not.toMatch(/<script[^>]+src="(https:|\/api\/assets)/);
    });
});
