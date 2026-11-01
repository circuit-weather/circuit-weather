import { describe, it, expect } from 'vitest';
import {
    getSessionRainVerdict, sessionHours, isRainBannerTimely, RAIN_BANNER_LEAD_HOURS, isNowcastRelevant, summariseTrackRain, pixelDbz, worldPixel, samplePlan,
    RAIN_DBZ, SAMPLE_TILE_SIZE,
} from '../public/src/utils/rain.js';

const HOUR = 3600;
const start = new Date('2026-11-01T14:30:00Z');
const startHour = Date.parse('2026-11-01T14:00:00Z') / 1000;
const hours = (probs) => probs.map((precipProb, i) => ({ time: startHour + (i - 1) * HOUR, precipProb }));

describe('sessionHours', () => {
    it('gives races two hours and everything else one', () => {
        expect(sessionHours('race')).toBe(2);
        expect(sessionHours('feature-race')).toBe(2);
        expect(sessionHours('qualifying')).toBe(1);
        expect(sessionHours(undefined)).toBe(1);
    });
});

describe('isRainBannerTimely', () => {
    const at = (hoursFromStart) => start.getTime() + hoursFromStart * HOUR * 1000;

    it('covers a session from 3 days out until it ends', () => {
        expect(RAIN_BANNER_LEAD_HOURS).toBe(72);
        expect(isRainBannerTimely(start, 'race', at(-72.1))).toBe(false);
        expect(isRainBannerTimely(start, 'race', at(-72))).toBe(true);
        expect(isRainBannerTimely(start, 'race', at(1.9))).toBe(true);
        expect(isRainBannerTimely(start, 'race', at(2))).toBe(false);
        expect(isRainBannerTimely(start, 'fp1', at(1))).toBe(false);
    });

    it('rejects sessions months away and bad dates', () => {
        expect(isRainBannerTimely(start, 'race', at(-24 * 60))).toBe(false);
        expect(isRainBannerTimely(new Date('nope'), 'race', at(0))).toBe(false);
        expect(isRainBannerTimely(null, 'race', at(0))).toBe(false);
    });
});

describe('isNowcastRelevant', () => {
    const at = (minutes) => start.getTime() + minutes * 60000;

    it('covers a session from an hour before it starts until it ends', () => {
        expect(isNowcastRelevant(start, 'race', at(-61))).toBe(false);
        expect(isNowcastRelevant(start, 'race', at(-60))).toBe(true);
        expect(isNowcastRelevant(start, 'race', at(119))).toBe(true);
        expect(isNowcastRelevant(start, 'race', at(120))).toBe(false);
        expect(isNowcastRelevant(start, 'fp2', at(60))).toBe(false);
        expect(isNowcastRelevant(new Date('nope'), 'race', at(0))).toBe(false);
    });
});

describe('getSessionRainVerdict', () => {
    it('covers the hour the session starts in until it ends, timed mid-hour', () => {
        // Hours starting 13:00 (before), 14:00, 15:00, 16:00 (a 2 h race from 14:30 runs to 16:30) and 17:00 (after)
        const verdict = getSessionRainVerdict(hours([90, 10, 15, 30, 95]), start, 2);
        expect(verdict).toEqual({ level: 'possible', peakPct: 30, peakTime: startHour + 2 * HOUR + 1800 });
    });

    it('leaves out hours already over once the session is under way', () => {
        // Malaysian MotoGP: GP at 07:00 UTC; at 07:38 the 07:00-08:00 hour is still running
        const gp = new Date('2026-11-01T07:00:00Z');
        const t = (h) => Date.parse(`2026-11-01T0${h}:00:00Z`) / 1000;
        const hourly = [{ time: t(6), precipProb: 41 }, { time: t(7), precipProb: 30 }, { time: t(8), precipProb: 25 }];
        const now = Date.parse('2026-11-01T07:38:00Z');

        // Before the start, the hour before it doesn't count either
        expect(getSessionRainVerdict(hourly, gp, 2, Date.parse('2026-11-01T06:30:00Z')))
            .toEqual({ level: 'possible', peakPct: 30, peakTime: t(7) + 1800 });
        // Under way: still 07:00-08:00 (said as the next 5 minutes, 07:40) and 08:00-09:00
        expect(getSessionRainVerdict(hourly, gp, 2, now))
            .toEqual({ level: 'possible', peakPct: 30, peakTime: Date.parse('2026-11-01T07:40:00Z') / 1000 });
        // Once 07:00-08:00 is over, only 08:00-09:00 is left
        expect(getSessionRainVerdict(hourly, gp, 2, Date.parse('2026-11-01T08:05:00Z')))
            .toEqual({ level: 'possible', peakPct: 25, peakTime: t(8) + 1800 });
        // And after the session, nothing
        expect(getSessionRainVerdict(hourly, gp, 2, Date.parse('2026-11-01T09:00:00Z'))).toBeNull();
    });

    it('bands the peak chance into dry, possible and likely', () => {
        expect(getSessionRainVerdict(hours([0, 19]), start, 1).level).toBe('dry');
        expect(getSessionRainVerdict(hours([0, 20]), start, 1).level).toBe('possible');
        expect(getSessionRainVerdict(hours([0, 49.6]), start, 1)).toMatchObject({ level: 'likely', peakPct: 50 });
    });

    it('keeps the first hour of a tied peak', () => {
        expect(getSessionRainVerdict(hours([0, 60, 60]), start, 2).peakTime).toBe(startHour + 1800);
    });

    it('returns null without usable data', () => {
        expect(getSessionRainVerdict(null, start, 1)).toBeNull();
        expect(getSessionRainVerdict(hours([5]), start, 1)).toBeNull();
        expect(getSessionRainVerdict([{ time: startHour, precipProb: null }], start, 1)).toBeNull();
        expect(getSessionRainVerdict(hours([5, 5]), 'soon', 1)).toBeNull();
    });
});

describe('summariseTrackRain', () => {
    const now = 1_000_000 * 1000;
    const frame = (minutes, dbz) => ({ time: now / 1000 + minutes * 60, dbz });
    const dry = frame(-5, -Infinity);
    const wet = frame(-5, 35);

    it('reports rain arriving, rounded to 5 minutes', () => {
        expect(summariseTrackRain(dry, [frame(10, 0), frame(22, RAIN_DBZ)], now))
            .toEqual({ state: 'approaching', minutes: 20 });
    });

    it('never says less than 5 minutes', () => {
        expect(summariseTrackRain(dry, [frame(1, 40)], now)).toEqual({ state: 'approaching', minutes: 5 });
    });

    it('ignores nowcast frames already in the past', () => {
        expect(summariseTrackRain(dry, [frame(-1, 40), frame(10, 5)], now)).toEqual({ state: 'dry' });
    });

    it('reports rain at the track, and when it eases', () => {
        expect(summariseTrackRain(wet, [frame(10, 30), frame(30, 10)], now))
            .toEqual({ state: 'raining-easing', minutes: 30 });
        expect(summariseTrackRain(wet, [frame(10, 30)], now)).toEqual({ state: 'raining' });
    });

    it('counts echoes below the threshold as dry', () => {
        expect(summariseTrackRain(frame(-5, RAIN_DBZ - 1), [frame(10, 12)], now)).toEqual({ state: 'dry' });
    });
});

describe('pixelDbz', () => {
    it('decodes the black-and-white scheme, ignoring the snow bit', () => {
        expect(pixelDbz(0, 0)).toBe(-Infinity);
        expect(pixelDbz(52, 255)).toBe(20);
        expect(pixelDbz(175, 255)).toBe(15);
    });
});

describe('worldPixel / samplePlan', () => {
    it('places points in Web Mercator pixels', () => {
        expect(worldPixel(0, 0, 0)).toEqual({ x: 128, y: 128 });
        const { x, y } = worldPixel(85.0511287798, 180, 1);
        expect(x).toBe(512);
        expect(y).toBeCloseTo(0, 6);
    });

    it('reads a disc of pixels around the circuit', () => {
        // Melbourne (Albert Park) at zoom 8: ~480 m pixels, so a 3 km radius is ~6 px
        const plan = samplePlan(-37.85, 144.97);
        expect(plan).toHaveLength(1);
        const [tile] = plan;
        const centre = worldPixel(-37.85, 144.97, 8);
        expect(tile).toMatchObject({ x: Math.floor(centre.x / SAMPLE_TILE_SIZE), y: Math.floor(centre.y / SAMPLE_TILE_SIZE) });
        expect(tile.pixels.length).toBeGreaterThan(100);
        expect(tile.pixels.length).toBeLessThan(150);
        for (const [px, py] of tile.pixels) {
            expect(px).toBeGreaterThanOrEqual(0);
            expect(py).toBeLessThan(SAMPLE_TILE_SIZE);
        }
    });

    it('spans tile edges and wraps the antimeridian', () => {
        // On the equator at 180°: the disc straddles the last and first tile columns
        // and the rows either side of the equator
        const plan = samplePlan(0, 180);
        expect(plan.map(t => `${t.x}/${t.y}`).sort()).toEqual(['0/127', '0/128', '255/127', '255/128']);
    });

    it('always reads at least the centre pixel', () => {
        const plan = samplePlan(10, 10, 0);
        expect(plan.flatMap(t => t.pixels).length).toBeGreaterThanOrEqual(1);
    });
});
