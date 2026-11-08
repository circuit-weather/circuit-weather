// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    API_STATUS_EVENT, getApiOutage, nextLimitReset, noteApiResponse, resetApiStatus,
} from '../public/src/utils/apiStatus.js';

// The Worker answers every /api/* request with JSON; Cloudflare's error pages are HTML
const response = (status, body, headers = {}) => new Response(body, { status, headers });
const cloudflarePage = (code) => response(code === 1027 ? 429 : 502,
    `<!DOCTYPE html><title>Worker exceeded resource limits</title><span>Error ${code}</span>`,
    { 'content-type': 'text/html; charset=UTF-8' });
const sentAt = (ms) => ({ date: new Date(ms).toUTCString(), 'content-type': 'application/json' });

describe('apiStatus', () => {
    const events = [];
    const listener = (event) => events.push(event.detail.outage);

    beforeEach(() => {
        resetApiStatus();
        events.length = 0;
        document.addEventListener(API_STATUS_EVENT, listener);
    });

    afterEach(() => {
        document.removeEventListener(API_STATUS_EVENT, listener);
        vi.useRealTimers();
    });

    it('reports the daily request limit from Cloudflare error 1027', async () => {
        await noteApiResponse(cloudflarePage(1027));
        expect(getApiOutage()).toBe('limit');
        expect(events).toEqual(['limit']);
    });

    it('reports any other Cloudflare error page as the server being down', async () => {
        await noteApiResponse(cloudflarePage(1101));
        expect(getApiOutage()).toBe('down');
    });

    it('ignores errors the Worker sent itself', async () => {
        await noteApiResponse(response(429, '{"error":{"status":429}}', { 'content-type': 'application/json' }));
        await noteApiResponse(response(502, '{"error":{"status":502}}', { 'content-type': 'application/json; charset=utf-8' }));
        expect(getApiOutage()).toBeNull();
        expect(events).toEqual([]);
    });

    it('announces each change once', async () => {
        await noteApiResponse(cloudflarePage(1027));
        await noteApiResponse(cloudflarePage(1027));
        expect(events).toEqual(['limit']);
    });

    it('clears once the Worker answers again, but not for a response kept from before', async () => {
        vi.useFakeTimers({ now: Date.parse('2026-11-08T14:00:00Z'), toFake: ['Date'] });
        await noteApiResponse(cloudflarePage(1027));

        // e.g. /api/config from the browser's cache, sent before the outage
        await noteApiResponse(response(200, '{}', sentAt(Date.parse('2026-11-08T13:00:00Z'))));
        await noteApiResponse(response(200, '{}', { 'content-type': 'application/json' }));
        expect(getApiOutage()).toBe('limit');

        await noteApiResponse(response(200, '{}', sentAt(Date.parse('2026-11-08T14:00:00Z'))));
        expect(getApiOutage()).toBeNull();
        expect(events).toEqual(['limit', null]);
    });

    it('never throws, whatever it is given', async () => {
        await expect(noteApiResponse(undefined)).resolves.toBeUndefined();
        await expect(noteApiResponse({ ok: false })).resolves.toBeUndefined();
        await expect(noteApiResponse({ ok: true })).resolves.toBeUndefined();
        expect(getApiOutage()).toBeNull();
    });

    it('resets the limit at the next midnight UTC', () => {
        expect(nextLimitReset(Date.parse('2026-11-08T14:13:00Z')).toISOString()).toBe('2026-11-09T00:00:00.000Z');
        expect(nextLimitReset(Date.parse('2026-11-08T00:00:00Z')).toISOString()).toBe('2026-11-09T00:00:00.000Z');
    });
});
