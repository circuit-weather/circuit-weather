import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Config first
vi.mock('../public/src/config.js', () => ({
    CONFIG: {
        circuitZoom: 10
    }
}));

// Mock Leaflet
const createMockElement = (tag, className) => {
    const el = {
        tagName: tag.toUpperCase(),
        className: className || '',
        innerHTML: '',
        textContent: '',
        style: { display: '' },
        children: [],
        firstChild: null,
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
        addEventListener: vi.fn(),
        insertBefore: vi.fn(function(newNode, refNode) {
            this.children.unshift(newNode);
            this.firstChild = newNode;
        }),
        appendChild: vi.fn(),
        querySelector: vi.fn(),
        remove: vi.fn(),
    };
    return el;
};

// Global Mocks Setup
const domEventMock = {
    disableClickPropagation: vi.fn()
};

const latLngMock = (coords) => coords;

vi.stubGlobal('L', {
    DomEvent: domEventMock,
    latLng: latLngMock
});

// Mock Document/Window
const mockDocument = {
    querySelector: vi.fn(),
    createElement: vi.fn((tag) => createMockElement(tag)),
    addEventListener: vi.fn(),
    activeElement: { tagName: 'BODY' },
    body: createMockElement('body')
};

vi.stubGlobal('document', mockDocument);
vi.stubGlobal('window', {});

// Import System Under Test
const { RecentreControl } = await import('../public/src/map/RecentreControl.js');

describe('RecentreControl', () => {
    let control;
    let mapMock;
    let zoomControlMock;

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset document state
        mockDocument.activeElement = { tagName: 'BODY' };

        // Mock the zoom control container which must exist for init()
        zoomControlMock = createMockElement('div', 'leaflet-control-zoom');
        mockDocument.querySelector.mockReturnValue(zoomControlMock);

        // Mock Map
        mapMock = {
            setView: vi.fn(),
            getCenter: vi.fn().mockReturnValue([0, 0]),
            distance: vi.fn().mockReturnValue(0),
            on: vi.fn()
        };
    });

    it('should initialize correctly when zoom control exists', () => {
        control = new RecentreControl(mapMock);

        // Verify button creation
        expect(mockDocument.createElement).toHaveBeenCalledWith('a');
        expect(control.button).toBeDefined();
        expect(control.button.className).toBe('leaflet-control-zoom-recentre');
        // Check mock calls on the button instance, not the spy directly if checking specific attribute
        expect(control.button.setAttribute).toHaveBeenCalledWith('role', 'button');

        // Verify insertion into DOM
        // The mock implementation of insertBefore modifies this.firstChild, so initially it is null.
        // If we call toHaveBeenCalledWith(..., zoomControlMock.firstChild) it might check the current value
        // or we need to be careful. The code calls it with the *current* firstChild.
        // Initially zoomControlMock.firstChild is null (from createMockElement).
        expect(zoomControlMock.insertBefore).toHaveBeenCalledWith(control.button, null);

        // Verify click propagation disabled
        expect(L.DomEvent.disableClickPropagation).toHaveBeenCalledWith(control.button);

        // Verify event listeners
        expect(control.button.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(mockDocument.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
        expect(mapMock.on).toHaveBeenCalledWith('moveend', expect.any(Function));
    });

    it('should return early if zoom control is missing', () => {
        mockDocument.querySelector.mockReturnValue(null);
        control = new RecentreControl(mapMock);
        expect(control.button).toBeNull();
    });

    describe('Visibility Logic', () => {
        beforeEach(() => {
            control = new RecentreControl(mapMock);
            control.setCircuit([10, 10]); // Set a circuit center
        });

        it('should show button if distance > 5km', () => {
            // Mock map center far away
            mapMock.distance.mockReturnValue(5001);

            // Trigger update
            control.updateVisibility();

            expect(control.button.style.display).toBe('flex');
        });

        it('should hide button if distance <= 5km', () => {
            // Mock map center close
            mapMock.distance.mockReturnValue(5000);

            // Trigger update
            control.updateVisibility();

            expect(control.button.style.display).toBe('none');
        });

        it('should hide button if circuit center is not set', () => {
            control.circuitCenter = null;
            control.updateVisibility();
            expect(control.button.style.display).toBe('none');
        });
    });

    describe('Interactions', () => {
        beforeEach(() => {
            control = new RecentreControl(mapMock);
            control.setCircuit([10, 10]);
        });

        it('should recentre map on click', () => {
            // Extract the click handler
            const clickHandler = control.button.addEventListener.mock.calls.find(call => call[0] === 'click')[1];

            const eventMock = { preventDefault: vi.fn() };
            clickHandler(eventMock);

            expect(eventMock.preventDefault).toHaveBeenCalled();
            expect(mapMock.setView).toHaveBeenCalledWith([10, 10], 10); // 10 is default circuit zoom
        });

        it('should recentre map on Spacebar keydown for accessibility', () => {
            // Extract the keydown handler on the button
            const keydownHandler = control.button.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

            const eventMock = { key: ' ', preventDefault: vi.fn(), stopPropagation: vi.fn() };
            keydownHandler(eventMock);

            expect(eventMock.preventDefault).toHaveBeenCalled();
            expect(mapMock.setView).toHaveBeenCalledWith([10, 10], 10);
        });

        it('should recentre map on "C" key press', () => {
            // Extract keydown handler
            const keyHandler = mockDocument.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

            const eventMock = { key: 'c', ctrlKey: false, metaKey: false, altKey: false };
            keyHandler(eventMock);

            expect(mapMock.setView).toHaveBeenCalledWith([10, 10], 10);
        });

        it('should recentre map on "Shift+C" (capital C)', () => {
             const keyHandler = mockDocument.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

            const eventMock = { key: 'C', ctrlKey: false, metaKey: false, altKey: false };
            keyHandler(eventMock);

            expect(mapMock.setView).toHaveBeenCalledWith([10, 10], 10);
        });

        it('should NOT recentre if modifier keys are pressed', () => {
            const keyHandler = mockDocument.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

            // Ctrl+C
            keyHandler({ key: 'c', ctrlKey: true });
            expect(mapMock.setView).not.toHaveBeenCalled();

            // Alt+C
            keyHandler({ key: 'c', altKey: true });
            expect(mapMock.setView).not.toHaveBeenCalled();
        });

        it('should NOT recentre if user is typing in an input', () => {
            mockDocument.activeElement = { tagName: 'INPUT' };
            const keyHandler = mockDocument.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

            keyHandler({ key: 'c' });
            expect(mapMock.setView).not.toHaveBeenCalled();
        });

        it('should NOT recentre if user is typing in a textarea', () => {
            mockDocument.activeElement = { tagName: 'TEXTAREA' };
            const keyHandler = mockDocument.addEventListener.mock.calls.find(call => call[0] === 'keydown')[1];

            keyHandler({ key: 'c' });
            expect(mapMock.setView).not.toHaveBeenCalled();
        });
    });

    describe('setCircuit', () => {
        it('should update circuit center and trigger visibility check', () => {
            control = new RecentreControl(mapMock);
            const spy = vi.spyOn(control, 'updateVisibility');

            control.setCircuit([20, 20], 12);

            expect(control.circuitCenter).toEqual([20, 20]);
            expect(control.circuitZoom).toBe(12);
            expect(spy).toHaveBeenCalled();
        });
    });
});
