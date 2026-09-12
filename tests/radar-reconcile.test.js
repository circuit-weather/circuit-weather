import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RadarReconcile } from '../public/src/map/RadarReconcile.js';

describe('RadarReconcile', () => {
    let mockMap;

    beforeEach(() => {
        mockMap = {
            hasLayer: vi.fn().mockReturnValue(true),
            removeLayer: vi.fn(),
            getLayer: vi.fn(),
            getSource: vi.fn(),
            removeSource: vi.fn()
        };
    });

    describe('reconcileLayers', () => {
        it('returns empty layers and -1 visible index when newFrames is empty', () => {
            const currentLayers = [];
            const newFrames = [];
            const result = RadarReconcile.reconcileLayers(mockMap, currentLayers, newFrames, -1);

            expect(result).toEqual({
                newLayers: [],
                newVisibleIndex: -1
            });
        });

        it('populates newLayers with null for brand new frames (lazy load)', () => {
            const currentLayers = [];
            const newFrames = [
                { time: 100, path: '/path1' },
                { time: 200, path: '/path2' }
            ];

            const result = RadarReconcile.reconcileLayers(mockMap, currentLayers, newFrames, -1);

            expect(result.newLayers).toEqual([null, null]);
            expect(result.newVisibleIndex).toBe(-1);
        });

        it('ignores null or falsy layers in currentLayers array', () => {
            const currentLayers = [null, undefined];
            const newFrames = [{ time: 100, path: '/path1' }];

            const result = RadarReconcile.reconcileLayers(mockMap, currentLayers, newFrames, -1);

            expect(result.newLayers).toEqual([null]);
            expect(mockMap.removeLayer).not.toHaveBeenCalled();
        });

        it('reuses existing layers matching time and path and updates zIndex', () => {
            const mockLayer1 = {
                frameTime: 100,
                framePath: '/path1',
                setZIndex: vi.fn()
            };
            const mockLayer2 = {
                frameTime: 200,
                framePath: '/path2',
                setZIndex: vi.fn()
            };

            const currentLayers = [mockLayer1, mockLayer2];
            // Reordered frames: frame2 first, frame1 second
            const newFrames = [
                { time: 200, path: '/path2' },
                { time: 100, path: '/path1' }
            ];

            const result = RadarReconcile.reconcileLayers(mockMap, currentLayers, newFrames, 0);

            // Layer 2 is now at index 0, Layer 1 is now at index 1
            expect(result.newLayers).toEqual([mockLayer2, mockLayer1]);
            expect(mockLayer2.setZIndex).toHaveBeenCalledWith(100);
            expect(mockLayer1.setZIndex).toHaveBeenCalledWith(101);
            expect(mockMap.removeLayer).not.toHaveBeenCalled();
        });

        it('tracks newVisibleIndex when visible layer is reused in new position', () => {
            const mockLayer1 = { frameTime: 100, framePath: '/path1', setZIndex: vi.fn() };
            const mockLayer2 = { frameTime: 200, framePath: '/path2', setZIndex: vi.fn() };

            const currentLayers = [mockLayer1, mockLayer2];
            const newFrames = [
                { time: 200, path: '/path2' },
                { time: 100, path: '/path1' }
            ];

            // Initially, mockLayer1 (index 0) was visible
            const result = RadarReconcile.reconcileLayers(mockMap, currentLayers, newFrames, 0);

            // mockLayer1 moved to index 1
            expect(result.newVisibleIndex).toBe(1);
        });

        it('returns -1 for newVisibleIndex when previously visible layer is omitted or removed', () => {
            const mockLayer1 = { frameTime: 100, framePath: '/path1', setZIndex: vi.fn() };
            const mockLayer2 = { frameTime: 200, framePath: '/path2', setZIndex: vi.fn() };

            const currentLayers = [mockLayer1, mockLayer2];
            // Frame 1 is omitted from newFrames
            const newFrames = [{ time: 200, path: '/path2' }];

            // Layer 1 (index 0) was visible
            const result = RadarReconcile.reconcileLayers(mockMap, currentLayers, newFrames, 0);

            expect(result.newVisibleIndex).toBe(-1);
            expect(result.newLayers).toEqual([mockLayer2]);
            expect(mockMap.removeLayer).toHaveBeenCalledWith(mockLayer1);
        });

        it('removes unused Leaflet layers from the map', () => {
            const mockUnusedLayer = { frameTime: 300, framePath: '/path3', setZIndex: vi.fn() };
            const currentLayers = [mockUnusedLayer];
            const newFrames = [{ time: 100, path: '/path1' }];

            RadarReconcile.reconcileLayers(mockMap, currentLayers, newFrames, -1);

            expect(mockMap.removeLayer).toHaveBeenCalledWith(mockUnusedLayer);
        });

        it('handles Mapbox map removal for layer and source when layer exists on Mapbox map', () => {
            const mapboxMapMock = {
                // Notice hasLayer is undefined for Mapbox maps in this codebase
                getLayer: vi.fn().mockImplementation(id => id === 'layer-300'),
                getSource: vi.fn().mockImplementation(id => id === 'source-300'),
                removeLayer: vi.fn(),
                removeSource: vi.fn()
            };

            const mockUnusedMapboxLayer = {
                id: 'layer-300',
                sourceId: 'source-300',
                frameTime: 300,
                framePath: '/path3',
                setZIndex: vi.fn()
            };

            const currentLayers = [mockUnusedMapboxLayer];
            const newFrames = [];

            RadarReconcile.reconcileLayers(mapboxMapMock, currentLayers, newFrames, -1);

            expect(mapboxMapMock.removeLayer).toHaveBeenCalledWith('layer-300');
            expect(mapboxMapMock.removeSource).toHaveBeenCalledWith('source-300');
        });

        it('does not attempt Mapbox removal if layer/source is not present on map', () => {
            const mapboxMapMock = {
                getLayer: vi.fn().mockReturnValue(null),
                getSource: vi.fn().mockReturnValue(null),
                removeLayer: vi.fn(),
                removeSource: vi.fn()
            };

            const mockUnusedMapboxLayer = {
                id: 'layer-400',
                sourceId: 'source-400',
                frameTime: 400,
                framePath: '/path4',
                setZIndex: vi.fn()
            };

            const currentLayers = [mockUnusedMapboxLayer];
            const newFrames = [];

            RadarReconcile.reconcileLayers(mapboxMapMock, currentLayers, newFrames, -1);

            expect(mapboxMapMock.removeLayer).not.toHaveBeenCalled();
            expect(mapboxMapMock.removeSource).not.toHaveBeenCalled();
        });
    });
});
