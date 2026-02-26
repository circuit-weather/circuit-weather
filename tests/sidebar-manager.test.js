import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- DOM Mocks ---
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(false),
    },
    style: {},
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    textContent: '',
    focus: vi.fn(),
    querySelectorAll: vi.fn(() => []),
    offsetParent: document, // truthy = visible
});

const elements = {};
const eventHandlers = {};

vi.stubGlobal('document', {
    getElementById: vi.fn((id) => {
        if (!elements[id]) elements[id] = createMockElement(id);
        return elements[id];
    }),
    addEventListener: vi.fn((event, handler) => {
        eventHandlers[event] = handler;
    }),
    activeElement: null,
    body: { style: {} },
});

const matchMediaHandler = { matches: false, addEventListener: vi.fn() };
vi.stubGlobal('window', {
    matchMedia: vi.fn(() => matchMediaHandler),
    getComputedStyle: vi.fn(() => ({ display: 'block' })),
});

const { SidebarManager } = await import('../public/src/ui/SidebarManager.js');

describe('SidebarManager', () => {
    let manager;

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset element state
        Object.keys(elements).forEach(key => delete elements[key]);
        Object.keys(eventHandlers).forEach(key => delete eventHandlers[key]);

        document.body.style = {};
        matchMediaHandler.matches = false;
        matchMediaHandler.addEventListener = vi.fn();

        manager = new SidebarManager();
    });

    // ---------------------------------------------------------------
    // Outcome: Sidebar opens
    // ---------------------------------------------------------------
    describe('when opened', () => {
        it('adds the sidebar--open class', () => {
            manager.open();
            expect(manager.sidebar.classList.add).toHaveBeenCalledWith('sidebar--open');
        });

        it('sets isOpen to true', () => {
            manager.open();
            expect(manager.isOpen).toBe(true);
        });

        it('prevents body scroll', () => {
            manager.open();
            expect(document.body.style.overflow).toBe('hidden');
        });

        it('sets aria-expanded to true on toggle and mobile buttons', () => {
            manager.open();
            expect(manager.toggleBtn.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
            expect(manager.mobileMenuBtn.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
        });

        it('enables focus trap on the sidebar', () => {
            manager.open();
            expect(manager.sidebar.addEventListener).toHaveBeenCalledWith('keydown', manager._handleFocusTrap);
        });
    });

    // ---------------------------------------------------------------
    // Outcome: Sidebar closes
    // ---------------------------------------------------------------
    describe('when closed', () => {
        it('removes the sidebar--open class', () => {
            manager.open();
            manager.close();
            expect(manager.sidebar.classList.remove).toHaveBeenCalledWith('sidebar--open');
        });

        it('sets isOpen to false', () => {
            manager.open();
            manager.close();
            expect(manager.isOpen).toBe(false);
        });

        it('restores body scroll', () => {
            manager.open();
            manager.close();
            expect(document.body.style.overflow).toBe('');
        });

        it('sets aria-expanded to false', () => {
            manager.open();
            manager.close();
            expect(manager.toggleBtn.setAttribute).toHaveBeenCalledWith('aria-expanded', 'false');
            expect(manager.mobileMenuBtn.setAttribute).toHaveBeenCalledWith('aria-expanded', 'false');
        });

        it('removes focus trap listener', () => {
            manager.open();
            manager.close();
            expect(manager.sidebar.removeEventListener).toHaveBeenCalledWith('keydown', manager._handleFocusTrap);
        });

        it('returns focus to mobile menu button', () => {
            manager.open();
            manager.close();
            expect(manager.mobileMenuBtn.focus).toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // Outcome: Toggle alternates state
    // ---------------------------------------------------------------
    describe('toggle', () => {
        it('opens when closed', () => {
            expect(manager.isOpen).toBe(false);
            manager.toggle();
            expect(manager.isOpen).toBe(true);
        });

        it('closes when open', () => {
            manager.open();
            manager.toggle();
            expect(manager.isOpen).toBe(false);
        });
    });

    // ---------------------------------------------------------------
    // Outcome: Escape key closes sidebar when open
    // ---------------------------------------------------------------
    describe('escape key', () => {
        it('closes sidebar when open', () => {
            manager.open();
            expect(manager.isOpen).toBe(true);

            // Fire the keydown handler
            const keydownHandler = eventHandlers['keydown'];
            expect(keydownHandler).toBeDefined();

            keydownHandler({ key: 'Escape' });
            expect(manager.isOpen).toBe(false);
        });

        it('does nothing when sidebar is already closed', () => {
            const removeSpy = manager.sidebar.classList.remove;
            removeSpy.mockClear();

            const keydownHandler = eventHandlers['keydown'];
            keydownHandler({ key: 'Escape' });

            expect(manager.isOpen).toBe(false);
            expect(removeSpy).not.toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // Outcome: Focus trap wraps correctly
    // ---------------------------------------------------------------
    describe('focus trap', () => {
        it('wraps focus from last to first element on Tab', () => {
            const first = createMockElement('first');
            const last = createMockElement('last');
            manager.sidebar.querySelectorAll = vi.fn(() => [first, last]);

            document.activeElement = last;

            const event = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };
            manager.handleFocusTrap(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(first.focus).toHaveBeenCalled();
        });

        it('wraps focus from first to last element on Shift+Tab', () => {
            const first = createMockElement('first');
            const last = createMockElement('last');
            manager.sidebar.querySelectorAll = vi.fn(() => [first, last]);

            document.activeElement = first;

            const event = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() };
            manager.handleFocusTrap(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(last.focus).toHaveBeenCalled();
        });

        it('does nothing for non-Tab keys', () => {
            const event = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() };
            manager.handleFocusTrap(event);
            expect(event.preventDefault).not.toHaveBeenCalled();
        });

        it('does nothing when no focusable elements exist', () => {
            manager.sidebar.querySelectorAll = vi.fn(() => []);
            const event = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };
            manager.handleFocusTrap(event);
            expect(event.preventDefault).not.toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // Outcome: Desktop breakpoint auto-closes sidebar
    // ---------------------------------------------------------------
    describe('desktop breakpoint', () => {
        it('closes sidebar when crossing to desktop while open', () => {
            manager.open();
            expect(manager.isOpen).toBe(true);

            // Find the change handler registered on matchMedia
            const changeHandler = matchMediaHandler.addEventListener.mock.calls.find(
                call => call[0] === 'change'
            );
            expect(changeHandler).toBeDefined();

            // Simulate crossing to desktop
            changeHandler[1]({ matches: true });
            expect(manager.isOpen).toBe(false);
        });
    });
});
