import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---

// Mock SafeStorage (localStorage)
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => { store[key] = String(value); }),
        clear: () => { store = {}; }
    };
})();

// Mock DOM Elements
const createMockElement = (id) => ({
    id,
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
    addEventListener: vi.fn(),
    style: {},
});

// Mock Document
const documentMock = {
    documentElement: {
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
    },
    getElementById: vi.fn((id) => createMockElement(id)),
    querySelector: vi.fn(),
};

// Mock Window.matchMedia
const matchMediaMock = vi.fn();

// Apply Globals
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('document', documentMock);
vi.stubGlobal('window', { matchMedia: matchMediaMock });

// --- Test Suite ---

describe('ThemeManager', () => {
    let ThemeManager;
    let themeManager;
    let onThemeChangeSpy;

    beforeEach(async () => {
        vi.clearAllMocks();
        localStorageMock.clear();
        onThemeChangeSpy = vi.fn();

        // Reset matchMedia default behavior
        matchMediaMock.mockReturnValue({ matches: false }); // Default to light

        // Import fresh module for each test to ensure clean state if module has side effects (though class-based usually fine)
        const module = await import('../public/src/ui/ThemeManager.js');
        ThemeManager = module.ThemeManager;
    });

    it('should initialize with stored theme if available', () => {
        localStorageMock.setItem('theme', 'dark');
        themeManager = new ThemeManager(onThemeChangeSpy);

        expect(themeManager.theme).toBe('dark');
        expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
        expect(onThemeChangeSpy).toHaveBeenCalledWith('dark');
    });

    it('should initialize with system preference (dark) if no stored theme', () => {
        matchMediaMock.mockReturnValue({ matches: true }); // Dark mode
        themeManager = new ThemeManager(onThemeChangeSpy);

        expect(themeManager.theme).toBe('dark');
        expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should initialize with system preference (light) if no stored theme', () => {
        matchMediaMock.mockReturnValue({ matches: false }); // Light mode
        themeManager = new ThemeManager(onThemeChangeSpy);

        expect(themeManager.theme).toBe('light');
        expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should toggle theme from light to dark', () => {
        matchMediaMock.mockReturnValue({ matches: false }); // Start light
        themeManager = new ThemeManager(onThemeChangeSpy);

        // Reset spy calls from init
        onThemeChangeSpy.mockClear();
        documentMock.documentElement.setAttribute.mockClear();

        themeManager.toggle();

        expect(themeManager.theme).toBe('dark');
        expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
        expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
        expect(onThemeChangeSpy).toHaveBeenCalledWith('dark');
    });

    it('should toggle theme from dark to light', () => {
        localStorageMock.setItem('theme', 'dark'); // Start dark
        themeManager = new ThemeManager(onThemeChangeSpy);

        // Reset spy calls from init
        onThemeChangeSpy.mockClear();
        documentMock.documentElement.setAttribute.mockClear();

        themeManager.toggle();

        expect(themeManager.theme).toBe('light');
        expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'light');
        expect(documentMock.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
        expect(onThemeChangeSpy).toHaveBeenCalledWith('light');
    });

    it('should update meta theme-color tag on toggle', () => {
        const metaMock = { content: '' };
        documentMock.querySelector.mockReturnValue(metaMock);

        localStorageMock.setItem('theme', 'light');
        themeManager = new ThemeManager(onThemeChangeSpy);

        // Initial apply
        expect(documentMock.querySelector).toHaveBeenCalledWith('meta[name="theme-color"]');
        expect(metaMock.content).toBe('#e10600'); // Light brand color

        themeManager.toggle();

        expect(metaMock.content).toBe('#1e293b'); // Dark sidebar color
    });

    it('should update toggle button aria-labels', () => {
        const btnMock = createMockElement('themeToggle');
        documentMock.getElementById.mockReturnValue(btnMock);

        localStorageMock.setItem('theme', 'light');
        themeManager = new ThemeManager(onThemeChangeSpy);

        // Expect label to be "Switch to dark mode" (next state)
        expect(btnMock.setAttribute).toHaveBeenCalledWith('aria-label', 'Switch to dark mode');
        expect(btnMock.setAttribute).toHaveBeenCalledWith('title', 'Switch to dark mode');

        themeManager.toggle();

        // Expect label to be "Switch to light mode"
        expect(btnMock.setAttribute).toHaveBeenCalledWith('aria-label', 'Switch to light mode');
        expect(btnMock.setAttribute).toHaveBeenCalledWith('title', 'Switch to light mode');
    });

    it('should bind click events to toggle buttons', () => {
        const toggleBtnMock = createMockElement('themeToggle');
        const mobileToggleBtnMock = createMockElement('mobileThemeToggle');

        documentMock.getElementById.mockImplementation((id) => {
            if (id === 'themeToggle') return toggleBtnMock;
            if (id === 'mobileThemeToggle') return mobileToggleBtnMock;
            return null;
        });

        themeManager = new ThemeManager(onThemeChangeSpy);

        expect(toggleBtnMock.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(mobileToggleBtnMock.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });
});
