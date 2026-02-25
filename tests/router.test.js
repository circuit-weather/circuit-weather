import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock window and history before import
const mockPushState = vi.fn();
const mockAddEventListener = vi.fn();
let mockPathname = '/';

vi.stubGlobal('window', {
    addEventListener: mockAddEventListener,
    location: {
        get pathname() { return mockPathname; }
    },
    history: {
        pushState: mockPushState,
    },
});

import { Router } from '../public/src/routing/Router.js';

describe('Router', () => {
    let onRoute;
    let router;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPathname = '/';
        onRoute = vi.fn();
        router = new Router(onRoute);
    });

    describe('constructor', () => {
        it('registers popstate event listener', () => {
            expect(mockAddEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
        });
    });

    describe('getParams', () => {
        it('returns default series when path is empty', () => {
            mockPathname = '/';
            const params = router.getParams();
            expect(params).toEqual({ series: 'f1', round: null, session: null });
        });

        it('parses series only', () => {
            mockPathname = '/f1';
            const params = router.getParams();
            expect(params).toEqual({ series: 'f1', round: null, session: null });
        });

        it('parses series and round', () => {
            mockPathname = '/f1/3';
            const params = router.getParams();
            expect(params).toEqual({ series: 'f1', round: '3', session: null });
        });

        it('parses series, round, and session', () => {
            mockPathname = '/f1/1/race';
            const params = router.getParams();
            expect(params).toEqual({ series: 'f1', round: '1', session: 'race' });
        });

        it('parses qualifying session', () => {
            mockPathname = '/f1/5/qualifying';
            const params = router.getParams();
            expect(params).toEqual({ series: 'f1', round: '5', session: 'qualifying' });
        });
    });

    describe('navigate', () => {
        it('pushes series-only path', () => {
            router.navigate('f1');
            expect(mockPushState).toHaveBeenCalledWith({}, '', '/f1');
        });

        it('pushes series and round path', () => {
            router.navigate('f1', '3');
            expect(mockPushState).toHaveBeenCalledWith({}, '', '/f1/3');
        });

        it('pushes full path with session', () => {
            router.navigate('f1', '1', 'race');
            expect(mockPushState).toHaveBeenCalledWith({}, '', '/f1/1/race');
        });

        it('omits session when not provided', () => {
            router.navigate('f1', '2', null);
            expect(mockPushState).toHaveBeenCalledWith({}, '', '/f1/2');
        });

        it('omits round and session when not provided', () => {
            router.navigate('f1', null, null);
            expect(mockPushState).toHaveBeenCalledWith({}, '', '/f1');
        });
    });

    describe('handleRoute', () => {
        it('calls onRoute with parsed params when path has segments', () => {
            mockPathname = '/f1/3/qualifying';
            router.handleRoute();
            expect(onRoute).toHaveBeenCalledWith({
                series: 'f1',
                round: '3',
                session: 'qualifying',
            });
        });

        it('calls onRoute with null for missing round and session', () => {
            mockPathname = '/f1';
            router.handleRoute();
            expect(onRoute).toHaveBeenCalledWith({
                series: 'f1',
                round: null,
                session: null,
            });
        });

        it('does not call onRoute when path is empty', () => {
            mockPathname = '/';
            router.handleRoute();
            expect(onRoute).not.toHaveBeenCalled();
        });
    });
});
