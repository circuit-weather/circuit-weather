// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SERIES_IDS } from '../public/src/config.js';

// public/theme.js is a classic script that runs in <head>; run the real file
const source = readFileSync(resolve(process.cwd(), 'public/theme.js'), 'utf8');
const runThemeScript = () => new Function(source)();

const DAY = 24 * 60 * 60 * 1000;
const schedulePreload = () => document.head.querySelector('link[rel="preload"][as="fetch"]');

function visit(path) {
    window.history.replaceState(null, '', path);
    runThemeScript();
}

describe('theme.js', () => {
    beforeEach(() => {
        document.head.innerHTML = '<meta name="theme-color" content="#e10600">';
        localStorage.clear();
    });

    it('sets the theme and adds the web font without blocking the page', () => {
        localStorage.setItem('theme', 'dark');
        visit('/');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        const font = document.head.querySelector('link[rel="stylesheet"]');
        expect(font.href).toContain('fonts.googleapis.com/css2?family=Inter');
        expect(font.href).toContain('display=swap');
    });

    describe('early schedule request', () => {
        it('preloads the F1 schedule for the home page and unknown paths', () => {
            visit('/');
            expect(schedulePreload().getAttribute('href')).toBe('/api/f1/current.json');
            expect(schedulePreload().getAttribute('crossorigin')).toBe('anonymous');

            document.head.innerHTML = '';
            visit('/not-a-series/3');
            expect(schedulePreload().getAttribute('href')).toBe('/api/f1/current.json');
        });

        it('preloads the schedule of the series in the URL', () => {
            visit('/motogp/19/gp');
            expect(schedulePreload().getAttribute('href')).toBe('/api/schedule/motogp');
        });

        it('uses the saved series when the URL names none, as the app does', () => {
            localStorage.setItem('series', 'motogp');
            visit('/');
            expect(schedulePreload().getAttribute('href')).toBe('/api/schedule/motogp');

            // A series in the URL still wins
            document.head.innerHTML = '';
            visit('/f2/1');
            expect(schedulePreload().getAttribute('href')).toBe('/api/schedule/f2');

            // An unusable saved value is ignored
            document.head.innerHTML = '';
            localStorage.setItem('series', '../evil');
            visit('/');
            expect(schedulePreload().getAttribute('href')).toBe('/api/f1/current.json');
        });

        it('skips it when the app will use its saved copy', () => {
            localStorage.setItem('f1_schedule_cache', JSON.stringify({ timestamp: Date.now() - DAY, races: [] }));
            visit('/f1/3/race');
            expect(schedulePreload()).toBeNull();

            localStorage.setItem('series_schedule_cache', JSON.stringify({
                wec: { timestamp: Date.now() - DAY, races: [], complete: true },
                f2: { timestamp: Date.now() - 60000, races: [], complete: false },
            }));
            visit('/wec');
            visit('/f2/1');
            expect(schedulePreload()).toBeNull();
        });

        it('only trusts a saved copy for an hour on the day of an event', () => {
            // A session starting now is "today" in any time zone
            const start = new Date();
            const today = [{
                date: '2026-01-01',
                sessions: [{ date: start.toISOString().slice(0, 10), time: start.toISOString().slice(11, 19) + 'Z' }],
            }];
            localStorage.setItem('series_schedule_cache', JSON.stringify({
                motogp: { timestamp: Date.now() - 30 * 60000, races: today, complete: true },
            }));
            visit('/motogp');
            expect(schedulePreload()).toBeNull();

            localStorage.setItem('series_schedule_cache', JSON.stringify({
                motogp: { timestamp: Date.now() - 2 * 60 * 60000, races: today, complete: true },
            }));
            visit('/motogp');
            expect(schedulePreload().getAttribute('href')).toBe('/api/schedule/motogp');

            document.head.innerHTML = '';
            localStorage.setItem('f1_schedule_cache', JSON.stringify({
                timestamp: Date.now() - 2 * 60 * 60000,
                races: [{ date: '2026-01-01', Qualifying: today[0].sessions[0] }],
            }));
            visit('/f1');
            expect(schedulePreload().getAttribute('href')).toBe('/api/f1/current.json');
        });

        it('still preloads when the saved copy is stale, partial and old, or unreadable', () => {
            localStorage.setItem('f1_schedule_cache', JSON.stringify({ timestamp: Date.now() - 8 * DAY, races: [] }));
            visit('/f1');
            expect(schedulePreload().getAttribute('href')).toBe('/api/f1/current.json');

            document.head.innerHTML = '';
            localStorage.setItem('series_schedule_cache', JSON.stringify({ f2: { timestamp: Date.now() - 10 * 60000, races: [], complete: false } }));
            visit('/f2');
            expect(schedulePreload().getAttribute('href')).toBe('/api/schedule/f2');

            document.head.innerHTML = '';
            localStorage.setItem('series_schedule_cache', '{not json');
            visit('/fe');
            // A broken saved copy throws inside the try: no preload, and no error
            expect(schedulePreload()).toBeNull();
        });

        it('knows every series the app supports', () => {
            const listed = source.match(/var SERIES = \[([^\]]+)\]/)[1].match(/'([a-z0-9]+)'/g).map(s => s.slice(1, -1));
            expect(listed).toEqual([...SERIES_IDS]);
        });
    });
});
