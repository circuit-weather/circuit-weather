import { describe, it, expect } from 'vitest';
import {
    getWindDirection,
    windToVector,
    sampleWindField,
    windDisplacement,
    isWithinField,
} from '../public/src/utils/wind.js';

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

describe('windDisplacement', () => {
    // Chosen so a 1-hour step at the equator with gain 1 yields exactly 1° each:
    // 110.574 km/°lat and 111.320 km/°lon (cos 0 = 1).
    const U_EQ = 111.320;
    const V_EQ = 110.574;

    it('moves one degree per hour at the equator for the reference speeds', () => {
        const { dLat, dLon } = windDisplacement(0, U_EQ, V_EQ, 3600, 1);
        expect(dLat).toBeCloseTo(1, 6);
        expect(dLon).toBeCloseTo(1, 6);
    });

    it('produces no displacement for zero wind', () => {
        const { dLat, dLon } = windDisplacement(45, 0, 0, 3600, 1);
        expect(dLat).toBe(0);
        expect(dLon).toBe(0);
    });

    it('scales linearly with elapsed time', () => {
        const half = windDisplacement(0, U_EQ, V_EQ, 1800, 1);
        expect(half.dLat).toBeCloseTo(0.5, 6);
        expect(half.dLon).toBeCloseTo(0.5, 6);
    });

    it('scales linearly with gain', () => {
        const { dLat, dLon } = windDisplacement(0, U_EQ, V_EQ, 3600, 3);
        expect(dLat).toBeCloseTo(3, 6);
        expect(dLon).toBeCloseTo(3, 6);
    });

    it('stretches longitude by 1/cos(lat) away from the equator', () => {
        // cos(60°) = 0.5, so the same eastward speed covers twice the longitude.
        const { dLon } = windDisplacement(60, U_EQ, 0, 3600, 1);
        expect(dLon).toBeCloseTo(2, 6);
    });

    it('latitude displacement is independent of latitude', () => {
        const atEquator = windDisplacement(0, 0, V_EQ, 3600, 1).dLat;
        const atSixty = windDisplacement(60, 0, V_EQ, 3600, 1).dLat;
        expect(atSixty).toBeCloseTo(atEquator, 6);
    });

    it('preserves direction signs (north/east positive, south/west negative)', () => {
        const north = windDisplacement(0, 0, V_EQ, 3600, 1);
        expect(north.dLat).toBeGreaterThan(0);
        const south = windDisplacement(0, 0, -V_EQ, 3600, 1);
        expect(south.dLat).toBeLessThan(0);
        const west = windDisplacement(0, -U_EQ, 0, 3600, 1);
        expect(west.dLon).toBeLessThan(0);
    });
});

describe('isWithinField', () => {
    const field = { minLat: -10, maxLat: 10, minLon: 20, maxLon: 40 };

    it('returns true for an interior point', () => {
        expect(isWithinField(0, 30, field)).toBe(true);
    });

    it('is inclusive of the boundary corners', () => {
        expect(isWithinField(-10, 20, field)).toBe(true);
        expect(isWithinField(10, 40, field)).toBe(true);
    });

    it('returns false past each edge', () => {
        expect(isWithinField(-11, 30, field)).toBe(false); // south of minLat
        expect(isWithinField(11, 30, field)).toBe(false);  // north of maxLat
        expect(isWithinField(0, 19, field)).toBe(false);   // west of minLon
        expect(isWithinField(0, 41, field)).toBe(false);   // east of maxLon
    });
});
