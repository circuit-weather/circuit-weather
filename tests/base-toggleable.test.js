import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseToggleable } from '../public/src/ui/BaseToggleable.js';

// --- DOM Mocks ---
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(false),
        toggle: vi.fn(),
    },
    setAttribute: vi.fn(),
});

const elements = {};

const documentMock = {
    getElementById: vi.fn((id) => elements[id] || null),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
};

// Create a Dummy UI component that extends BaseToggleable to test DOM interactions
class DummyToggleable extends BaseToggleable {
    // Only inherit for testing the BaseToggleable's constructor, open, and close natively
    constructor(buttonId, containerId, activeClass) {
        super(buttonId, containerId, activeClass);
    }
}

describe('BaseToggleable natively with DOM Mocks', () => {
    beforeEach(() => {
        vi.stubGlobal('document', documentMock);
        Object.keys(elements).forEach(key => delete elements[key]);
        vi.clearAllMocks();

        elements['test-button'] = createMockElement('test-button');
        elements['test-container'] = createMockElement('test-container');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('initializes with isOpen = false', () => {
        const toggleable = new DummyToggleable('test-button', 'test-container');
        expect(toggleable.isOpen).toBe(false);
    });

    it('toggles state to open and adds active class when toggle() is called', () => {
        const toggleable = new DummyToggleable('test-button', 'test-container', 'custom-active');
        const container = elements['test-container'];
        const button = elements['test-button'];

        expect(toggleable.isOpen).toBe(false);

        toggleable.toggle();

        expect(toggleable.isOpen).toBe(true);
        expect(container.classList.add).toHaveBeenCalledWith('custom-active');
        expect(button.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
    });

    it('binds click event to button and toggles state when called', () => {
        const toggleable = new DummyToggleable('test-button', 'test-container');
        const button = elements['test-button'];

        expect(button.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

        // Extract the bound function and call it with a mock event
        const clickHandler = button.addEventListener.mock.calls.find(call => call[0] === 'click')[1];
        const mockEvent = { stopPropagation: vi.fn() };
        clickHandler(mockEvent);

        expect(mockEvent.stopPropagation).toHaveBeenCalledOnce();
        expect(toggleable.isOpen).toBe(true);
    });

    it('toggles state to closed and removes active class when toggle() is called while open', () => {
        const toggleable = new DummyToggleable('test-button', 'test-container');
        const container = elements['test-container'];
        const button = elements['test-button'];

        // Open first
        toggleable.toggle();
        expect(toggleable.isOpen).toBe(true);
        expect(container.classList.add).toHaveBeenCalledWith('active'); // default class
        expect(button.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');

        // Close
        toggleable.toggle();
        expect(toggleable.isOpen).toBe(false);
        expect(container.classList.remove).toHaveBeenCalledWith('active');
        expect(button.setAttribute).toHaveBeenCalledWith('aria-expanded', 'false');
    });

    it('handles missing DOM elements gracefully', () => {
        // Clear mock elements
        Object.keys(elements).forEach(key => delete elements[key]);

        // Should not throw
        const toggleable = new DummyToggleable('missing-btn', 'missing-container');
        expect(toggleable.button).toBeNull();
        expect(toggleable.container).toBeNull();

        // Toggling should update state even without DOM
        toggleable.toggle();
        expect(toggleable.isOpen).toBe(true);

        toggleable.toggle();
        expect(toggleable.isOpen).toBe(false);
    });

    it('ignores DOM assignments if no IDs provided', () => {
        // Instantiate without IDs
        const toggleable = new DummyToggleable();
        expect(toggleable.button).toBeUndefined();
        expect(toggleable.container).toBeUndefined();
        expect(toggleable.activeClass).toBe('active');

        toggleable.toggle();
        expect(toggleable.isOpen).toBe(true);
    });
});
