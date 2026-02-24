import { describe, it, expect } from 'vitest';
import { ALLOWED_WORKER_REGEX } from '../src/worker-utils.js';

describe('Worker Security Regex', () => {
    describe('ALLOWED_WORKER_REGEX', () => {
        const validUrls = [
            'https://circuit-weather.user.workers.dev',
            'https://circuit-weather.user.workers.dev/',
            'https://dev-circuit-weather.user.workers.dev',
            'https://feature-branch-circuit-weather.user.workers.dev',
            'https://038ad3cf-circuit-weather.joshua-allan.workers.dev/', // Dev build format
        ];

        const invalidUrls = [
            'https://circuit-weather-evil.user.workers.dev',
            'https://circuit-weather-attack.attacker.workers.dev',
            'https://evil.com',
            'http://circuit-weather.user.workers.dev',
            'https://circuit-weather.user.workers.dev.evil.com',
        ];

        validUrls.forEach(url => {
            it(`allows ${url}`, () => {
                expect(ALLOWED_WORKER_REGEX.test(url)).toBe(true);
            });
        });

        invalidUrls.forEach(url => {
            it(`blocks ${url}`, () => {
                expect(ALLOWED_WORKER_REGEX.test(url)).toBe(false);
            });
        });
    });
});
