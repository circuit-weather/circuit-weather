import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RadarTimeFormatter } from '../public/src/map/RadarTimeFormatter.js';
import { i18n } from '../public/src/i18n/index.js';

describe('RadarTimeFormatter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('calculateEffectiveTime', () => {
        it('returns timestamp in ms without drift if no frames provided', () => {
            const result = RadarTimeFormatter.calculateEffectiveTime(1000);
            expect(result).toBe(1000000);
        });

        it('calculates drift from latest frame correctly', () => {
            const now = Date.now(); // 2025-01-01T12:00:00Z = 1735732800000
            const frameTimeSec = (now / 1000) - 600; // 10 minutes ago
            const frames = [{ time: frameTimeSec }];

            const effective = RadarTimeFormatter.calculateEffectiveTime(frameTimeSec, frames, 1);
            // Effective time = (frameTimeSec * 1000) + (now - frameTimeSec * 1000) = now
            expect(effective).toBe(now);
        });
    });

    describe('getSessionRelativeTimeInfo', () => {
        it('returns null if sessionTime is null or undefined', () => {
            expect(RadarTimeFormatter.getSessionRelativeTimeInfo(100000, null)).toBeNull();
            expect(RadarTimeFormatter.getSessionRelativeTimeInfo(100000, undefined)).toBeNull();
        });

        it('returns null if session is outside 7 days window', () => {
            const sessionTime = new Date('2025-01-01T12:00:00Z');
            const farPastMs = sessionTime.getTime() - (8 * 24 * 60 * 60 * 1000);
            expect(RadarTimeFormatter.getSessionRelativeTimeInfo(farPastMs, sessionTime)).toBeNull();
        });

        it('returns sessionStart when difference is less than 1 minute', () => {
            const sessionTime = new Date('2025-01-01T12:00:00Z');
            const info = RadarTimeFormatter.getSessionRelativeTimeInfo(sessionTime.getTime(), sessionTime);
            expect(info).not.toBeNull();
            expect(info.relativeText).toBe(i18n.t('radar.sessionStart'));
        });

        it('returns beforeSession when frame is before session', () => {
            const sessionTime = new Date('2025-01-01T12:00:00Z');
            const frameMs = sessionTime.getTime() - (30 * 60 * 1000); // 30 mins before
            const info = RadarTimeFormatter.getSessionRelativeTimeInfo(frameMs, sessionTime);
            expect(info).not.toBeNull();
            expect(info.relativeText).toContain('30');
        });

        it('returns afterSession when frame is after session', () => {
            const sessionTime = new Date('2025-01-01T12:00:00Z');
            const frameMs = sessionTime.getTime() + (15 * 60 * 1000); // 15 mins after
            const info = RadarTimeFormatter.getSessionRelativeTimeInfo(frameMs, sessionTime);
            expect(info).not.toBeNull();
            expect(info.relativeText).toContain('15');
        });
    });

    describe('getStandardRelativeTimeInfo', () => {
        it('returns forecast for future frames (>60s diffSec)', () => {
            const nowSec = Date.now() / 1000;
            const futureSec = nowSec + 120;
            const info = RadarTimeFormatter.getStandardRelativeTimeInfo(futureSec, futureSec * 1000);
            expect(info.relativeText).toBe(i18n.t('radar.forecast'));
        });

        it('returns live for frames less than 1 minute ago', () => {
            const nowMs = Date.now();
            const nowSec = nowMs / 1000;
            const info = RadarTimeFormatter.getStandardRelativeTimeInfo(nowSec, nowMs);
            expect(info.relativeText).toBe(i18n.t('radar.live'));
        });

        it('returns minutesAgo for frames in past', () => {
            const nowMs = Date.now();
            const pastMs = nowMs - (5 * 60 * 1000);
            const pastSec = pastMs / 1000;
            const info = RadarTimeFormatter.getStandardRelativeTimeInfo(pastSec, pastMs);
            expect(info.relativeText).toContain('5');
        });
    });

    describe('formatDuration', () => {
        it('formats days, hours, and minutes correctly', () => {
            const totalMinutes = (2 * 24 * 60) + (3 * 60) + 45; // 2 days 3 hours 45 mins
            const result = RadarTimeFormatter.formatDuration(totalMinutes);
            expect(result).toContain('2');
            expect(result).toContain('3');
            expect(result).toContain('45');
        });

        it('always includes minutes even when zero', () => {
            const totalMinutes = 60; // 1 hour
            const result = RadarTimeFormatter.formatDuration(totalMinutes);
            expect(result).toContain('1');
            expect(result).toContain('0');
        });
    });
});
