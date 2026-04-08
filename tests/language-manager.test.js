import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { i18n, LANGUAGE_NAMES } from '../public/src/i18n/index.js';
import { LanguageManager } from '../public/src/ui/LanguageManager.js';

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
    style: {},
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    textContent: '',
    innerHTML: '',
    focus: vi.fn(),
    querySelectorAll: vi.fn(() => []),
    querySelector: vi.fn(() => null),
    appendChild: vi.fn(),
    contains: vi.fn().mockReturnValue(false),
    dataset: {},
});

const elements = {};
const eventHandlers = {};

vi.stubGlobal('document', {
    getElementById: vi.fn((id) => {
        if (!elements[id]) elements[id] = createMockElement(id);
        return elements[id];
    }),
    createElement: vi.fn((tag) => createMockElement(tag)),
    createDocumentFragment: vi.fn(() => createMockElement('fragment')),
    addEventListener: vi.fn((event, handler) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
    }),
    activeElement: null,
});

vi.stubGlobal('requestAnimationFrame', (cb) => cb());

describe('LanguageManager', () => {
    let manager;

    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(elements).forEach(key => delete elements[key]);
        Object.keys(eventHandlers).forEach(key => delete eventHandlers[key]);

        // Mock elements
        elements['languageToggle'] = createMockElement('languageToggle');
        elements['languageMenu'] = createMockElement('languageMenu');

        vi.spyOn(i18n, 'setLocale').mockImplementation(() => {});
        Object.defineProperty(i18n, 'locale', { get: () => 'en-NZ', configurable: true });

        manager = new LanguageManager();
    });

    it('initializes correctly when elements exist', () => {
        expect(elements['languageMenu'].innerHTML).toBe('');
        // check menu is populated
        expect(elements['languageMenu'].appendChild).toHaveBeenCalled();
    });

    it('handles toggle properly', () => {
        expect(manager.isOpen).toBe(false);
        manager.toggle();
        expect(manager.isOpen).toBe(true);
        expect(elements['languageMenu'].classList.add).toHaveBeenCalledWith('visible');
        expect(elements['languageToggle'].setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');

        manager.toggle();
        expect(manager.isOpen).toBe(false);
        expect(elements['languageMenu'].classList.remove).toHaveBeenCalledWith('visible');
        expect(elements['languageToggle'].setAttribute).toHaveBeenCalledWith('aria-expanded', 'false');
    });

    it('closes on Escape key when open', () => {
        manager.open();
        expect(manager.isOpen).toBe(true);

        const handlers = eventHandlers['keydown'];

        // Actually run handlers
        handlers.forEach(h => h({ key: 'Escape' }));
        expect(manager.isOpen).toBe(false);
    });

    it('focuses first item when open', () => {
        vi.useFakeTimers();
        manager.open();

        const firstItem = { focus: vi.fn() };
        elements['languageMenu'].querySelector = vi.fn((sel) => {
             if (sel === '.language-item') return firstItem;
             return null;
        });

        // Re-call open to use our mock querySelector
        manager.isOpen = false;
        manager.open();

        vi.runAllTimers();
        expect(firstItem.focus).toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('ignores clicks outside when closed', () => {
        const handlers = eventHandlers['click'];
        const docClickHandler = handlers[handlers.length - 1]; // Assume last is doc click

        expect(manager.isOpen).toBe(false);
        const spy = vi.spyOn(manager, 'close');
        docClickHandler({ target: document.body });
        expect(spy).not.toHaveBeenCalled();
    });

    it('closes when clicking outside menu and toggle', () => {
        manager.open();
        const handlers = eventHandlers['click'];
        const docClickHandler = handlers[handlers.length - 1];

        const spy = vi.spyOn(manager, 'close');
        docClickHandler({ target: document.body });
        expect(spy).toHaveBeenCalled();
    });

    it('does not close when clicking inside menu', () => {
        manager.open();
        const handlers = eventHandlers['click'];
        const docClickHandler = handlers[handlers.length - 1];

        elements['languageMenu'].contains.mockReturnValueOnce(true);
        const spy = vi.spyOn(manager, 'close');
        docClickHandler({ target: elements['languageMenu'] });
        expect(spy).not.toHaveBeenCalled();
    });

    it('does not close when clicking toggle button', () => {
        manager.open();
        const handlers = eventHandlers['click'];
        const docClickHandler = handlers[handlers.length - 1];

        elements['languageMenu'].contains.mockReturnValueOnce(false);
        elements['languageToggle'].contains.mockReturnValueOnce(true);
        const spy = vi.spyOn(manager, 'close');
        docClickHandler({ target: elements['languageToggle'] });
        expect(spy).not.toHaveBeenCalled();
    });

    it('focusout closes menu if focus moves outside', () => {
        manager.open();
        // The element that has the focusout listener is the menu itself, not document.
        // Wait, where is the focusout listener?
        // this.menu.addEventListener('focusout', ... )
        // The mock document doesn't intercept element event listeners, only document event listeners!
        // Elements intercept their own in our mock via addEventListener on createMockElement.
        const focusoutHandler = elements['languageMenu'].addEventListener.mock.calls.find(call => call[0] === 'focusout')[1];

        // Mock active element not in menu or toggle
        document.activeElement = document.body;
        elements['languageMenu'].contains.mockReturnValueOnce(false);

        const spy = vi.spyOn(manager, 'close');
        focusoutHandler({});
        expect(spy).toHaveBeenCalled();
    });

    it('focusout does not close menu if focus moves inside', () => {
        manager.open();
        const focusoutHandler = elements['languageMenu'].addEventListener.mock.calls.find(call => call[0] === 'focusout')[1];

        document.activeElement = createMockElement('someChild');
        elements['languageMenu'].contains.mockReturnValueOnce(true);

        const spy = vi.spyOn(manager, 'close');
        focusoutHandler({});
        expect(spy).not.toHaveBeenCalled();
    });

    it('focusout does not close menu if not open', () => {
        const focusoutHandler = elements['languageMenu'].addEventListener.mock.calls.find(call => call[0] === 'focusout')[1];

        const spy = vi.spyOn(manager, 'close');
        focusoutHandler({});
        expect(spy).not.toHaveBeenCalled();
    });

    it('focusout does not close menu if active element is toggleBtn', () => {
        manager.open();
        const focusoutHandler = elements['languageMenu'].addEventListener.mock.calls.find(call => call[0] === 'focusout')[1];

        document.activeElement = elements['languageToggle'];
        elements['languageMenu'].contains.mockReturnValueOnce(false);

        const spy = vi.spyOn(manager, 'close');
        focusoutHandler({});
        expect(spy).not.toHaveBeenCalled();
    });

    it('updates active language correctly', () => {
        const item1 = createMockElement('i1');
        item1.dataset.locale = 'en-NZ';
        const item2 = createMockElement('i2');
        item2.dataset.locale = 'fr';

        elements['languageMenu'].querySelectorAll = vi.fn(() => [item1, item2]);

        Object.defineProperty(i18n, 'locale', { get: () => 'fr', configurable: true });

        manager.updateActiveLanguage();

        expect(item1.classList.toggle).toHaveBeenCalledWith('active', false);
        expect(item1.setAttribute).toHaveBeenCalledWith('aria-current', 'false');

        expect(item2.classList.toggle).toHaveBeenCalledWith('active', true);
        expect(item2.setAttribute).toHaveBeenCalledWith('aria-current', 'true');
    });

    it('responds to i18n:change event', () => {
        const spy = vi.spyOn(manager, 'updateActiveLanguage');
        const handlers = eventHandlers['i18n:change'];
        handlers[0]();
        expect(spy).toHaveBeenCalled();
    });

    it('handles keyboard navigation for menu items', () => {
        let buttonKeydownHandler = null;

        const originalCreateElement = document.createElement;
        const mockItems = [];
        // create enough mock items for all locales
        const localeCount = Object.keys(LANGUAGE_NAMES || { "en-NZ": "English (NZ)", "fr": "Français", "de": "Deutsch" }).length || 10;
        for (let i = 0; i < localeCount; i++) {
            mockItems.push(createMockElement(`btn${i}`));
        }
        let createIndex = 0;

        document.createElement = vi.fn((tag) => {
             const el = mockItems[createIndex++];
             // In case there are more create elements than locales, fallback to a new mock
             if (!el) {
                 const fallbackEl = createMockElement(tag);
                 fallbackEl.addEventListener = vi.fn((ev, h) => {
                      if (ev === 'keydown') buttonKeydownHandler = h;
                 });
                 return fallbackEl;
             }
             el.addEventListener = vi.fn((ev, h) => {
                  if (ev === 'keydown') buttonKeydownHandler = h;
             });
             return el;
        });

        // Set up the items in the menu so Array.from(this.menu.querySelectorAll) works
        elements['languageMenu'].querySelectorAll = vi.fn(() => mockItems);

        manager.populateMenu();

        expect(buttonKeydownHandler).not.toBeNull();

        const preventDefault = vi.fn();

        // 1. ArrowDown
        buttonKeydownHandler({ key: 'ArrowDown', target: mockItems[0], preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(mockItems[1].focus).toHaveBeenCalled();

        // 2. ArrowUp
        preventDefault.mockClear();
        buttonKeydownHandler({ key: 'ArrowUp', target: mockItems[0], preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(mockItems[mockItems.length - 1].focus).toHaveBeenCalled(); // wraps around

        // 3. Home
        preventDefault.mockClear();
        buttonKeydownHandler({ key: 'Home', target: mockItems[2], preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(mockItems[0].focus).toHaveBeenCalled();

        // 4. End
        preventDefault.mockClear();
        buttonKeydownHandler({ key: 'End', target: mockItems[0], preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(mockItems[mockItems.length - 1].focus).toHaveBeenCalled();

        // 5. Unrelated key
        preventDefault.mockClear();
        buttonKeydownHandler({ key: 'A', target: mockItems[0], preventDefault });
        expect(preventDefault).not.toHaveBeenCalled();

        document.createElement = originalCreateElement;
    });

    it('clicking language item sets locale and closes menu', () => {
        let buttonClickHandler = null;

        const originalCreateElement = document.createElement;
        document.createElement = vi.fn((tag) => {
             const el = createMockElement(tag);
             el.addEventListener = vi.fn((ev, h) => {
                  if (ev === 'click') buttonClickHandler = h;
             });
             return el;
        });

        manager.populateMenu();

        expect(buttonClickHandler).not.toBeNull();

        const spyClose = vi.spyOn(manager, 'close');
        buttonClickHandler();

        expect(i18n.setLocale).toHaveBeenCalled();
        expect(spyClose).toHaveBeenCalled();

        document.createElement = originalCreateElement;
    });

    it('covers missing DOM elements gracefully', () => {
        Object.keys(elements).forEach(key => delete elements[key]);
        const m2 = new LanguageManager();
        expect(m2.isOpen).toBe(false);
    });

    it('covers toggle btn propagation', () => {
         const toggleHandler = elements['languageToggle'].addEventListener.mock.calls.find(call => call[0] === 'click')[1];
         const event = { stopPropagation: vi.fn() };
         const spy = vi.spyOn(manager, 'toggle');
         toggleHandler(event);
         expect(event.stopPropagation).toHaveBeenCalled();
         expect(spy).toHaveBeenCalled();
    });

    it('opens menu with arrow keys from the toggle button', () => {
        const keydownHandler = elements['languageToggle'].addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

        manager.isOpen = false;
        const spyOpen = vi.spyOn(manager, 'open');

        // Down arrow
        let preventDefault = vi.fn();
        keydownHandler({ key: 'ArrowDown', preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(spyOpen).toHaveBeenCalledTimes(1);

        // Up arrow
        preventDefault.mockClear();
        spyOpen.mockClear();
        manager.isOpen = false; // Reset to closed
        keydownHandler({ key: 'ArrowUp', preventDefault });
        expect(preventDefault).toHaveBeenCalled();
        expect(spyOpen).toHaveBeenCalledTimes(1);

        // Doesn't open if already open
        preventDefault.mockClear();
        spyOpen.mockClear();
        manager.isOpen = true; // Open
        keydownHandler({ key: 'ArrowDown', preventDefault });
        expect(preventDefault).not.toHaveBeenCalled();
        expect(spyOpen).not.toHaveBeenCalled();

        // Other keys
        preventDefault.mockClear();
        spyOpen.mockClear();
        manager.isOpen = false;
        keydownHandler({ key: 'Enter', preventDefault });
        expect(preventDefault).not.toHaveBeenCalled();
        expect(spyOpen).not.toHaveBeenCalled();
    });

    it('restores focus to toggle button when menu is closed', () => {
        manager.open();
        // Simulate focus within menu
        elements['languageMenu'].contains.mockReturnValue(true);
        const focusSpy = vi.spyOn(elements['languageToggle'], 'focus');
        manager.close();
        expect(focusSpy).toHaveBeenCalled();
    });
});
