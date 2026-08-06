import { describe, it, expect } from 'vitest';
import { CONFIG, COUNTRY_CODES, CIRCUIT_MAP } from '../public/src/config.js';

describe('Config File (public/src/config.js)', () => {

    describe('CONFIG object', () => {
        it('should be defined and not empty', () => {
            expect(CONFIG).toBeDefined();
            expect(Object.keys(CONFIG).length).toBeGreaterThan(0);
        });

        it('should have important API configurations', () => {
            expect(CONFIG.f1ApiBase).toBe('/api/f1');
            expect(CONFIG.rainViewerApi).toBe('/api/radar');
            expect(CONFIG.trackApi).toBe('/api/track');
            expect(CONFIG.weatherApi).toBe('https://api.open-meteo.com/v1/forecast');
        });

        it('should have default UI state configurations', () => {
            expect(CONFIG.defaultCenter).toEqual([48.8566, 2.3522]);
            expect(CONFIG.defaultZoom).toBe(3);
            expect(CONFIG.circuitZoom).toBe(10);
        });

        it('should be completely frozen to prevent runtime tampering', () => {
            expect(Object.isFrozen(CONFIG)).toBe(true);
        });
    });

    describe('COUNTRY_CODES object', () => {
        it('should be defined and have mappings', () => {
            expect(COUNTRY_CODES).toBeDefined();
            expect(Object.keys(COUNTRY_CODES).length).toBeGreaterThan(0);
        });

        it('should have correct mappings for known countries', () => {
            expect(COUNTRY_CODES['Australia']).toBe('au');
            expect(COUNTRY_CODES['USA']).toBe('us');
            expect(COUNTRY_CODES['United States']).toBe('us');
            expect(COUNTRY_CODES['UK']).toBe('gb');
        });

        it('should be completely frozen to prevent runtime tampering', () => {
            expect(Object.isFrozen(COUNTRY_CODES)).toBe(true);
        });
    });

    describe('CIRCUIT_MAP object', () => {
        it('should be defined and have mappings', () => {
            expect(CIRCUIT_MAP).toBeDefined();
            expect(Object.keys(CIRCUIT_MAP).length).toBeGreaterThan(0);
        });

        it('should map Ergast Circuit IDs to bacinger/f1-circuits IDs properly', () => {
            expect(CIRCUIT_MAP['albert_park']).toBe('au-1953');
            expect(CIRCUIT_MAP['monza']).toBe('it-1922');
            expect(CIRCUIT_MAP['monaco']).toBe('mc-1929');
            expect(CIRCUIT_MAP['silverstone']).toBe('gb-1948');
        });

        it('should be completely frozen to prevent runtime tampering', () => {
            expect(Object.isFrozen(CIRCUIT_MAP)).toBe(true);
        });
    });
});
