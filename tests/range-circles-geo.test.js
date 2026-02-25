import { describe, it, expect, vi } from 'vitest';

// Mock DOM and Leaflet globals so the module can be imported
vi.stubGlobal('document', {
    getElementById: vi.fn(() => null),
    addEventListener: vi.fn(),
    documentElement: {},
    querySelectorAll: vi.fn(() => []),
});
vi.stubGlobal('getComputedStyle', vi.fn(() => ({
    getPropertyValue: vi.fn(() => '#ffffff'),
})));
vi.stubGlobal('L', {
    circle: vi.fn(),
    divIcon: vi.fn(),
    marker: vi.fn(),
});

import { RangeCircles } from '../public/src/map/RangeCircles.js';

describe('RangeCircles Geodesic Calculations', () => {
    // Test getPointAtDistance directly via prototype to avoid constructor DOM dependencies
    const getPointAtDistance = RangeCircles.prototype.getPointAtDistance;

    describe('getPointAtDistance', () => {
        it('returns same point for 0 distance', () => {
            const center = [51.5074, -0.1278]; // London
            const result = getPointAtDistance(center, 0, 0);
            expect(result[0]).toBeCloseTo(center[0], 4);
            expect(result[1]).toBeCloseTo(center[1], 4);
        });

        it('moves north for bearing 0°', () => {
            const center = [0, 0]; // Equator, prime meridian
            const result = getPointAtDistance(center, 1000, 0);
            // 1000m north should increase latitude, longitude stays ~0
            expect(result[0]).toBeGreaterThan(0);
            expect(result[1]).toBeCloseTo(0, 4);
        });

        it('moves east for bearing 90°', () => {
            const center = [0, 0];
            const result = getPointAtDistance(center, 1000, 90);
            // 1000m east should increase longitude, latitude stays ~0
            expect(result[0]).toBeCloseTo(0, 4);
            expect(result[1]).toBeGreaterThan(0);
        });

        it('moves south for bearing 180°', () => {
            const center = [0, 0];
            const result = getPointAtDistance(center, 1000, 180);
            // 1000m south should decrease latitude
            expect(result[0]).toBeLessThan(0);
            expect(result[1]).toBeCloseTo(0, 4);
        });

        it('moves west for bearing 270°', () => {
            const center = [0, 0];
            const result = getPointAtDistance(center, 1000, 270);
            // 1000m west should decrease longitude
            expect(result[0]).toBeCloseTo(0, 4);
            expect(result[1]).toBeLessThan(0);
        });

        it('computes correct distance for known value (1km north from equator)', () => {
            const center = [0, 0];
            const result = getPointAtDistance(center, 1000, 0);
            // 1km ≈ 0.00899° latitude
            expect(result[0]).toBeCloseTo(0.00899, 4);
        });

        it('handles high latitudes (Silverstone)', () => {
            const silverstone = [52.0786, -1.0169];
            const result = getPointAtDistance(silverstone, 5000, 45); // 5km NE
            // Should move NE from Silverstone
            expect(result[0]).toBeGreaterThan(silverstone[0]);
            expect(result[1]).toBeGreaterThan(silverstone[1]);
        });

        it('produces symmetric results for opposite bearings', () => {
            const center = [48.8566, 2.3522]; // Paris
            const north = getPointAtDistance(center, 10000, 0);
            const south = getPointAtDistance(center, 10000, 180);

            // North and south should be equidistant from center latitude
            const northDiff = Math.abs(north[0] - center[0]);
            const southDiff = Math.abs(south[0] - center[0]);
            expect(northDiff).toBeCloseTo(southDiff, 3);
        });
    });
});
