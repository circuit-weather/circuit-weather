import { describe, it, expect } from 'vitest';
import { getWindDirection, windToVector, sampleWindField } from '../public/src/utils/wind.js';

describe('getWindDirection', () => {
    const cases = [
        [0, 'N', 180],
        [45, 'NE', 225],
        [90, 'E', 270],
        [180, 'S', 360],
        [315, 'NW', 495],
        [360, 'N', 540],
    ];
    cases.forEach(([deg, text, rotation]) => {
        it(`maps ${deg}° to ${text} (rotation ${rotation})`, () => {
            const result = getWindDirection(deg);
            expect(result.text).toBe(text);
            expect(result.rotation).toBe(rotation);
        });
    });
});

describe('windToVector', () => {
    it('wind from the north blows toward the south (negative v)', () => {
        const { u, v } = windToVector(10, 0);
        expect(u).toBeCloseTo(0, 6);
        expect(v).toBeCloseTo(-10, 6);
    });

    it('wind from the east blows toward the west (negative u)', () => {
        const { u, v } = windToVector(10, 90);
        expect(u).toBeCloseTo(-10, 6);
        expect(v).toBeCloseTo(0, 6);
    });

    it('wind from the south blows toward the north (positive v)', () => {
        const { u, v } = windToVector(8, 180);
        expect(u).toBeCloseTo(0, 6);
        expect(v).toBeCloseTo(8, 6);
    });

    it('scales with speed', () => {
        const { u } = windToVector(20, 270); // from west -> blows east (+u)
        expect(u).toBeCloseTo(20, 6);
    });
});

describe('sampleWindField', () => {
    // 2x2 grid: u increases west->east (cols), v increases south->north (rows).
    const field = {
        minLat: 0, maxLat: 2,
        minLon: 0, maxLon: 2,
        rows: 2, cols: 2,
        //        (r0,c0) (r0,c1) (r1,c0) (r1,c1)
        u: [0, 10, 0, 10],
        v: [0, 0, 20, 20],
    };

    it('returns the corner values exactly', () => {
        expect(sampleWindField(field, 0, 0)).toEqual({ u: 0, v: 0 });
        expect(sampleWindField(field, 0, 2)).toEqual({ u: 10, v: 0 });
        expect(sampleWindField(field, 2, 0)).toEqual({ u: 0, v: 20 });
        expect(sampleWindField(field, 2, 2)).toEqual({ u: 10, v: 20 });
    });

    it('bilinearly interpolates the centre', () => {
        const { u, v } = sampleWindField(field, 1, 1);
        expect(u).toBeCloseTo(5, 6);
        expect(v).toBeCloseTo(10, 6);
    });

    it('clamps coordinates outside the bounds to the edge', () => {
        expect(sampleWindField(field, -5, -5)).toEqual({ u: 0, v: 0 });
        expect(sampleWindField(field, 99, 99)).toEqual({ u: 10, v: 20 });
    });

    it('handles a degenerate (zero-extent) field without dividing by zero', () => {
        const point = {
            minLat: 5, maxLat: 5, minLon: 5, maxLon: 5,
            rows: 1, cols: 1, u: [7], v: [3],
        };
        expect(sampleWindField(point, 5, 5)).toEqual({ u: 7, v: 3 });
    });
});
