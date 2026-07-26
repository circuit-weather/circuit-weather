import { describe, it, expect } from 'vitest';
import {
    getErrorHeaders,
    getEmptyRadarResponse,
    calculateHash,
    API_SECURITY_HEADERS
} from '../src/worker-utils.js';

const PRODUCTION_DOMAIN = 'https://circuit-weather.racing';

// Mock Request helper
const createRequest = (headers = {}) => ({
    headers: {
        get: (key) => headers[key] || null
    }
});

describe('Worker Utils Helpers', () => {

    describe('getErrorHeaders', () => {
        it('returns JSON content-type and no-store cache-control', () => {
            const req = createRequest({});
            const headers = getErrorHeaders(req);

            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['Cache-Control']).toBe('no-store');
        });

        it('includes all API security headers', () => {
            const req = createRequest({});
            const headers = getErrorHeaders(req);

            for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
                expect(headers[key]).toBe(value);
            }
        });

        it('adds CORS headers for allowed origin', () => {
            const req = createRequest({ 'Origin': PRODUCTION_DOMAIN });
            const headers = getErrorHeaders(req);

            expect(headers['Access-Control-Allow-Origin']).toBe(PRODUCTION_DOMAIN);
            expect(headers['Vary']).toBe('Origin');
        });

        it('omits CORS headers for disallowed origin', () => {
            const req = createRequest({ 'Origin': 'https://evil.com' });
            const headers = getErrorHeaders(req);

            expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
            expect(headers['Vary']).toBeUndefined();
        });

        it('omits CORS headers when no Origin header is present', () => {
            const req = createRequest({});
            const headers = getErrorHeaders(req);

            expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
        });

        it('adds CORS headers for localhost origin', () => {
            const req = createRequest({ 'Origin': 'http://localhost:8787' });
            const headers = getErrorHeaders(req);

            expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:8787');
            expect(headers['Vary']).toBe('Origin');
        });
    });

    describe('getEmptyRadarResponse', () => {
        it('returns a 200 Response', async () => {
            const req = createRequest({ 'Sec-Fetch-Site': 'same-origin' });
            const res = getEmptyRadarResponse(req);

            expect(res.status).toBe(200);
        });

        it('body contains expected empty radar structure', async () => {
            const req = createRequest({});
            const res = getEmptyRadarResponse(req);
            const data = await res.json();

            expect(data.radar).toBeDefined();
            expect(data.radar.past).toEqual([]);
            expect(data.radar.nowcast).toEqual([]);
            expect(data.host).toBe('https://tilecache.rainviewer.com');
        });

        it('includes security headers from getErrorHeaders', async () => {
            const req = createRequest({ 'Origin': PRODUCTION_DOMAIN });
            const res = getEmptyRadarResponse(req);

            expect(res.headers.get('Content-Type')).toBe('application/json');
            expect(res.headers.get('Cache-Control')).toBe('no-store');
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PRODUCTION_DOMAIN);
        });
    });

    describe('calculateHash', () => {
        it('returns a base64-encoded SHA-256 hash', async () => {
            const input = new TextEncoder().encode('hello world');
            const hash = await calculateHash(input.buffer);

            // SHA-256 of 'hello world' is known:
            // b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
            // Base64 of that: uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=
            expect(hash).toBe('sha256-uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=');
        });

        it('returns different hashes for different inputs', async () => {
            const input1 = new TextEncoder().encode('foo');
            const input2 = new TextEncoder().encode('bar');

            const hash1 = await calculateHash(input1.buffer);
            const hash2 = await calculateHash(input2.buffer);

            expect(hash1).not.toBe(hash2);
        });

        it('returns a consistent hash for the same input', async () => {
            const input = new TextEncoder().encode('test');
            const hash1 = await calculateHash(input.buffer);
            const hash2 = await calculateHash(new TextEncoder().encode('test').buffer);

            expect(hash1).toBe(hash2);
        });
    });
});
