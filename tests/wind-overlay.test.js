import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG } from '../public/src/config.js';
import { SafeStorage } from '../public/src/utils/storage.js';

// Helper to create mock DOM elements
const createMockElement = (tag, className = '') => {
    const listeners = {};
    const classList = new Set(className.split(' ').filter(Boolean));

    const el = {
        tagName: tag.toUpperCase(),
        className: className,
        classList: {
            add: vi.fn((cls) => classList.add(cls)),
            remove: vi.fn((cls) => classList.delete(cls)),
            contains: vi.fn((cls) => classList.has(cls)),
        },
        innerHTML: '',
        textContent: '',
        style: {},
        attributes: {},
        children: [],
        childNodes: [],
        parentNode: null,
        width: 0,
        height: 0,
        setAttribute: vi.fn((key, val) => {
            el.attributes[key] = String(val);
        }),
        getAttribute: vi.fn((key) => el.attributes[key] || null),
        addEventListener: vi.fn((event, handler) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
        }),
        removeEventListener: vi.fn((event, handler) => {
            if (listeners[event]) {
                listeners[event] = listeners[event].filter((h) => h !== handler);
            }
        }),
        dispatchEvent: (event) => {
            const handlers = listeners[event.type] || [];
            handlers.forEach((h) => h(event));
        },
        appendChild: vi.fn((child) => {
            child.parentNode = el;
            el.children.push(child);
            el.childNodes.push(child);
            return child;
        }),
        removeChild: vi.fn((child) => {
            child.parentNode = null;
            el.children = el.children.filter((c) => c !== child);
            el.childNodes = el.childNodes.filter((c) => c !== child);
            return child;
        }),
        querySelector: vi.fn((selector) => {
            if (selector === '.wind-toast-message') {
                const msg = el.children.find((c) => c.className === 'wind-toast-message');
                return msg || null;
            }
            return null;
        }),
        getContext: vi.fn(() => ({
            clearRect: vi.fn(),
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            setTransform: vi.fn(),
            globalCompositeOperation: 'source-over',
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
        })),
        getBoundingClientRect: vi.fn(() => ({
            width: 800,
            height: 600,
            top: 0,
            left: 0,
            right: 800,
            bottom: 600,
        })),
        _listeners: listeners,
    };
    return el;
};

// Mock Document and Window globals
let mockContainer;
let mockToggle;
let mockDocument;
let mockGetComputedStyle;

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SafeStorage, 'getItem').mockImplementation(() => 'false');
    vi.spyOn(SafeStorage, 'setItem').mockImplementation(() => {});

    mockContainer = createMockElement('div', 'map-container');
    mockToggle = createMockElement('button', 'wind-toggle');

    mockDocument = {
        documentElement: createMockElement('html'),
        createElement: vi.fn((tag) => createMockElement(tag)),
        createElementNS: vi.fn((ns, tag) => createMockElement(tag)),
        getElementById: vi.fn((id) => {
            if (id === 'windOverlayToggle') return mockToggle;
            return null;
        }),
    };

    mockGetComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => 'rgba(2, 132, 199, 0.7)'),
    }));

    vi.stubGlobal('document', mockDocument);
    vi.stubGlobal('getComputedStyle', mockGetComputedStyle);
    vi.stubGlobal('window', {
        devicePixelRatio: 1,
        getComputedStyle: mockGetComputedStyle,
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => 123));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('performance', { now: vi.fn(() => 1000) });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const createMockMap = (options = {}) => {
    const eventHandlers = {};
    return {
        hasLayer: options.isLeaflet ? vi.fn() : undefined,
        getContainer: vi.fn(() => mockContainer),
        getZoom: vi.fn(() => options.zoom ?? 10),
        project: vi.fn((coords) => ({ x: coords[0] * 10, y: coords[1] * 10 })),
        latLngToContainerPoint: vi.fn((coords) => ({ x: coords[1] * 10, y: coords[0] * 10 })),
        on: vi.fn((event, handler) => {
            if (!eventHandlers[event]) eventHandlers[event] = [];
            eventHandlers[event].push(handler);
        }),
        off: vi.fn((event, handler) => {
            if (eventHandlers[event]) {
                eventHandlers[event] = eventHandlers[event].filter((h) => h !== handler);
            }
        }),
        _triggerMapEvent: (event) => {
            if (eventHandlers[event]) {
                eventHandlers[event].forEach((h) => h());
            }
        },
        _eventHandlers: eventHandlers,
    };
};

describe('WindOverlay', async () => {
    const { WindOverlay } = await import('../public/src/map/WindOverlay.js');

    const sampleField = {
        minLat: 10,
        maxLat: 20,
        minLon: 30,
        maxLon: 40,
        rows: 2,
        cols: 2,
        u: [5, 5, 5, 5],
        v: [5, 5, 5, 5],
    };

    describe('Constructor & Initialization', () => {
        it('initializes correctly with map and attaches listeners', () => {
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map);

            expect(overlay.map).toBe(map);
            expect(overlay.container).toBe(mockContainer);
            expect(overlay.enabled).toBe(false);
            expect(overlay.canvas).not.toBeNull();
            expect(mockContainer.appendChild).toHaveBeenCalledWith(overlay.canvas);
            expect(map.on).toHaveBeenCalledWith('resize', expect.any(Function));
            expect(map.on).toHaveBeenCalledWith('movestart', expect.any(Function));
            expect(map.on).toHaveBeenCalledWith('zoomstart', expect.any(Function));
            expect(map.on).toHaveBeenCalledWith('moveend', expect.any(Function));
            expect(map.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
        });

        it('binds toggle button listeners and sets initial aria-checked', () => {
            const map = createMockMap();
            const overlay = new WindOverlay(map);

            expect(mockToggle.attributes['aria-checked']).toBe('false');

            // Test button click toggles overlay
            const setEnabledSpy = vi.spyOn(overlay, 'setEnabled');
            mockToggle.dispatchEvent({ type: 'click' });
            expect(setEnabledSpy).toHaveBeenCalledWith(true);
        });

        it('handles keyboard navigation (Space / Enter) on toggle button', () => {
            const map = createMockMap();
            const overlay = new WindOverlay(map);
            const setEnabledSpy = vi.spyOn(overlay, 'setEnabled');

            const enterEvent = { key: 'Enter', preventDefault: vi.fn(), type: 'keydown' };
            mockToggle.dispatchEvent(enterEvent);
            expect(enterEvent.preventDefault).toHaveBeenCalled();
            expect(setEnabledSpy).toHaveBeenCalledWith(true);

            const spaceEvent = { key: ' ', preventDefault: vi.fn(), type: 'keydown' };
            mockToggle.dispatchEvent(spaceEvent);
            expect(setEnabledSpy).toHaveBeenCalledWith(false);
        });

        it('starts enabled if SafeStorage has windOverlay = true and zoom is adequate', () => {
            vi.spyOn(SafeStorage, 'getItem').mockImplementation(() => 'true');
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map);

            expect(overlay.enabled).toBe(true);
            expect(overlay.canvas.style.display).toBe('block');
        });
    });

    describe('setEnabled & State Management', () => {
        it('persists enabled state and triggers onToggle callback', () => {
            const onToggle = vi.fn();
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map, { onToggle });

            overlay.setEnabled(true);

            expect(SafeStorage.setItem).toHaveBeenCalledWith('windOverlay', 'true');
            expect(overlay.enabled).toBe(true);
            expect(overlay.canvas.style.display).toBe('block');
            expect(onToggle).toHaveBeenCalledWith(true);
            expect(mockToggle.attributes['aria-checked']).toBe('true');
        });

        it('shows zoom toast when enabling at low zoom level', () => {
            const map = createMockMap({ zoom: 4 }); // CONFIG.WIND_MIN_ZOOM is 6
            const overlay = new WindOverlay(map);

            overlay.setEnabled(true);

            expect(overlay._zoomSuppressed).toBe(true);
            expect(overlay._infoToast.classList.contains('visible')).toBe(true);
        });

        it('starts particle flow when enabling with existing field and sufficient zoom', () => {
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map);
            overlay.field = sampleField;

            overlay.setEnabled(true);

            expect(overlay.particles.length).toBe(CONFIG.WIND_FIELD_PARTICLES);
            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('stops and clears canvas when disabling', () => {
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map);
            overlay.setField(sampleField);
            overlay.setEnabled(true);

            overlay.setEnabled(false);

            expect(cancelAnimationFrame).toHaveBeenCalled();
            expect(overlay.canvas.style.display).toBe('none');
            expect(overlay._infoToast.classList.contains('visible')).toBe(false);
        });
    });

    describe('setField & View Updates', () => {
        it('seeds particles and starts loop when field is set and overlay is enabled', () => {
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map);
            overlay.setEnabled(true);

            overlay.setField(sampleField);

            expect(overlay.field).toBe(sampleField);
            expect(overlay.particles.length).toBe(CONFIG.WIND_FIELD_PARTICLES);
            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('does not start loop if field is set while zoom is too low', () => {
            const map = createMockMap({ zoom: 3 });
            const overlay = new WindOverlay(map);
            overlay.setEnabled(true);

            overlay.setField(sampleField);

            expect(overlay._zoomSuppressed).toBe(true);
            expect(requestAnimationFrame).not.toHaveBeenCalled();
        });
    });

    describe('Map Interactions & Zoom Suppression', () => {
        it('suspends on movestart/zoomstart and resumes on moveend/zoomend', () => {
            const onViewChange = vi.fn();
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map, { onViewChange });
            overlay.setField(sampleField);
            overlay.setEnabled(true);

            // Trigger interact start
            map._triggerMapEvent('movestart');
            expect(overlay._interacting).toBe(true);
            expect(cancelAnimationFrame).toHaveBeenCalled();

            // Trigger interact end
            map._triggerMapEvent('moveend');
            expect(overlay._interacting).toBe(false);
            expect(onViewChange).toHaveBeenCalled();
            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('shows zoom toast on moveend/zoomend if zoomed out below WIND_MIN_ZOOM', () => {
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map);
            overlay.setEnabled(true);

            // Zoom level drops
            map.getZoom.mockReturnValue(4);
            map._triggerMapEvent('zoomend');

            expect(overlay._zoomSuppressed).toBe(true);
            expect(overlay._infoToast.classList.contains('visible')).toBe(true);
        });
    });

    describe('Projection Logic', () => {
        it('projects using map.project in Mapbox mode', () => {
            const map = createMockMap({ isLeaflet: false });
            const overlay = new WindOverlay(map);

            const p = overlay._project(15, 35);
            expect(map.project).toHaveBeenCalledWith([35, 15]);
            expect(p).toEqual({ x: 350, y: 150 });
        });

        it('projects using map.latLngToContainerPoint in Leaflet mode', () => {
            const map = createMockMap({ isLeaflet: true });
            const overlay = new WindOverlay(map);

            const p = overlay._project(15, 35);
            expect(map.latLngToContainerPoint).toHaveBeenCalledWith([15, 35]);
            expect(p).toEqual({ x: 350, y: 150 });
        });

        it('handles projection errors gracefully', () => {
            const map = createMockMap();
            map.project.mockImplementation(() => {
                throw new Error('Projection error');
            });
            const overlay = new WindOverlay(map);

            expect(overlay._project(15, 35)).toBeNull();
        });
    });

    describe('Frame Rendering & Animation', () => {
        it('advances particles during animation frame', () => {
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map);
            overlay.setField(sampleField);
            overlay.setEnabled(true);

            const ctx = overlay.ctx;
            overlay._frame(1050); // 50ms delta

            expect(ctx.fillRect).toHaveBeenCalled();
            expect(ctx.stroke).toHaveBeenCalled();
            expect(overlay.lastTime).toBe(1050);
        });

        it('respawns expired or out-of-bounds particles during frame', () => {
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map);
            overlay.setField(sampleField);
            overlay.setEnabled(true);

            // Force particle age to exceed life limit
            overlay.particles[0].age = 100;
            overlay._frame(1100);

            expect(overlay.particles[0].age).toBeLessThan(CONFIG.WIND_FIELD_PARTICLE_LIFE);
        });
    });

    describe('Theme & Destroy', () => {
        it('updates wind flow color on updateTheme', () => {
            const map = createMockMap();
            const overlay = new WindOverlay(map);

            mockGetComputedStyle.mockImplementation(() => ({
                getPropertyValue: () => 'rgba(100, 200, 255, 0.9)',
            }));

            overlay.updateTheme();
            expect(overlay.color).toBe('rgba(100, 200, 255, 0.9)');
        });

        it('falls back to data-theme attribute if --color-wind-flow CSS variable is empty', () => {
            const map = createMockMap();
            const overlay = new WindOverlay(map);

            mockGetComputedStyle.mockImplementation(() => ({
                getPropertyValue: () => '',
            }));
            mockDocument.documentElement.attributes['data-theme'] = 'dark';
            mockDocument.documentElement.getAttribute = vi.fn((attr) => mockDocument.documentElement.attributes[attr]);

            overlay.updateTheme();
            expect(overlay.color).toBe('rgba(125, 211, 252, 0.85)');
        });

        it('destroys and cleans up map listeners, DOM nodes, and timers', () => {
            vi.useFakeTimers();
            const map = createMockMap({ zoom: 10 });
            const overlay = new WindOverlay(map);
            overlay.setField(sampleField);
            overlay.setEnabled(true); // Starts animation loop and sets overlay.rafId

            overlay.destroy();

            expect(cancelAnimationFrame).toHaveBeenCalled();
            expect(map.off).toHaveBeenCalledWith('resize', expect.any(Function));
            expect(map.off).toHaveBeenCalledWith('movestart', expect.any(Function));
            expect(map.off).toHaveBeenCalledWith('zoomstart', expect.any(Function));
            expect(map.off).toHaveBeenCalledWith('moveend', expect.any(Function));
            expect(map.off).toHaveBeenCalledWith('zoomend', expect.any(Function));
            expect(mockContainer.removeChild).toHaveBeenCalledWith(overlay.canvas);
            expect(mockContainer.removeChild).toHaveBeenCalledWith(overlay._infoToast);

            vi.useRealTimers();
        });
    });
});
