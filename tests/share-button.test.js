import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(true),
        toggle: vi.fn(),
    },
    style: {},
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    textContent: '',
    value: '',
    innerHTML: 'ORIGINAL_ICON',
    dataset: {},
});

const documentMock = {
    title: 'Circuit Weather',
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    querySelector: vi.fn((sel) => createMockElement(sel)),
    createElement: vi.fn((tag) => createMockElement(tag)),
    createDocumentFragment: vi.fn(() => ({ appendChild: vi.fn() })),
    head: { appendChild: vi.fn() },
    body: { appendChild: vi.fn(), style: {} },
};

vi.stubGlobal('document', documentMock);
vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn()
    })),
    location: { href: 'https://circuit-weather.racing/f1/1/race' }
});
vi.stubGlobal('navigator', {
    clipboard: {
        writeText: vi.fn().mockResolvedValue()
    }
});

// Mock dependencies required by CircuitWeatherApp
vi.mock('../public/src/api/F1API.js', () => ({
    F1API: vi.fn().mockImplementation(() => ({
        getSchedule: vi.fn().mockResolvedValue([]),
        parseRace: vi.fn(r => r),
    }))
}));
vi.mock('../public/src/api/WeatherClient.js', () => ({
    WeatherClient: vi.fn().mockImplementation(() => ({}))
}));
vi.mock('../public/src/map/TrackLayer.js', () => ({
    TrackLayer: vi.fn().mockImplementation(() => ({ updateTheme: vi.fn() }))
}));
vi.mock('../public/src/map/WeatherRadar.js', () => ({
    WeatherRadar: vi.fn().mockImplementation(() => ({}))
}));
vi.mock('../public/src/map/RangeCircles.js', () => ({
    RangeCircles: vi.fn().mockImplementation(() => ({ updateTheme: vi.fn() }))
}));
vi.mock('../public/src/map/MapWeatherWidget.js', () => ({
    MapWeatherWidget: vi.fn().mockImplementation(() => ({ addTo: vi.fn() }))
}));
vi.mock('../public/src/map/RecentreControl.js', () => ({
    RecentreControl: vi.fn().mockImplementation(() => ({}))
}));
vi.mock('../public/src/ui/CountdownTimer.js', () => ({
    CountdownTimer: vi.fn().mockImplementation(() => ({}))
}));
vi.mock('../public/src/routing/Router.js', () => ({
    Router: vi.fn().mockImplementation(() => ({ getParams: vi.fn(() => ({})) }))
}));
vi.mock('../public/src/map/MapManager.js', () => ({
    MapManager: vi.fn().mockImplementation(() => ({
        init: vi.fn(),
        setTheme: vi.fn()
    }))
}));
vi.mock('../public/src/ui/ThemeManager.js', () => ({
    ThemeManager: vi.fn()
}));
vi.mock('../public/src/ui/SidebarManager.js', () => ({
    SidebarManager: vi.fn()
}));

const { CircuitWeatherApp } = await import('../public/src/CircuitWeatherApp.js');

describe('Share Button Logic', () => {
    let app;
    let mockBtn;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        mockBtn = createMockElement('shareBtn');
        documentMock.getElementById.mockReturnValue(mockBtn);

        app = new CircuitWeatherApp();
        // Manually attach mock button if constructor didn't pick it up due to mock timing
        app.ui.shareBtn = mockBtn;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('writes URL to clipboard on click', async () => {
        await app.handleShare(mockBtn);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://circuit-weather.racing/f1/1/race');
    });

    it('updates button state on success', async () => {
        await app.handleShare(mockBtn);

        // Check icon swap
        expect(mockBtn.innerHTML).toContain('<svg');
        expect(mockBtn.dataset.originalIcon).toBe('ORIGINAL_ICON');

        // Check attributes
        expect(mockBtn.setAttribute).toHaveBeenCalledWith('aria-label', 'Copied!');
        expect(mockBtn.setAttribute).toHaveBeenCalledWith('title', 'Copied!');
        expect(mockBtn.style.color).toBe('var(--color-primary)');
    });

    it('reverts button state after timeout', async () => {
        await app.handleShare(mockBtn);

        // Fast forward 2000ms
        vi.advanceTimersByTime(2000);

        expect(mockBtn.innerHTML).toBe('ORIGINAL_ICON');
        expect(mockBtn.setAttribute).toHaveBeenCalledWith('aria-label', 'Share URL');
        expect(mockBtn.setAttribute).toHaveBeenCalledWith('title', 'Share URL');
        expect(mockBtn.style.color).toBe('');
    });

    it('handles clipboard API error gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        navigator.clipboard.writeText.mockRejectedValueOnce(new Error('Clipboard Failed'));

        await app.handleShare(mockBtn);

        expect(consoleSpy).toHaveBeenCalledWith('Failed to copy URL:', expect.any(Error));
        expect(mockBtn.innerHTML).toBe('ORIGINAL_ICON'); // Should not change

        consoleSpy.mockRestore();
    });

    it('warns when clipboard API is missing', async () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const originalClipboard = navigator.clipboard;
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

        await app.handleShare(mockBtn);

        expect(consoleSpy).toHaveBeenCalledWith('Clipboard API not available');
        expect(navigator.clipboard).toBeUndefined();

        // Restore
        Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
        consoleSpy.mockRestore();
    });
});
