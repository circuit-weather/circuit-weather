// A frame's layer can be kept only for the same tiles: forecast (nowcast)
// tiles carry their own URL, so once a forecast time has passed, its frame
// gets a new layer with the observed tiles
const layerKey = (time, path, url) => `${time}-${path}-${url ?? ''}`;

export class RadarReconcile {
    // Bolt Optimization: Reuse Leaflet layers to reduce DOM churn
    static reconcileLayers(map, currentLayers, newFrames, visibleLayerIndex) {
        const isMapbox = !map.hasLayer;

        // Map (time + path) -> Layer
        const existingLayerMap = new Map();

        // Populate map with existing valid layers
        // Every current layer not kept below is removed from the map
        const unused = new Set(currentLayers.filter(Boolean));
        unused.forEach(layer => {
            // A forecast is made afresh every update under the same times and
            // URLs, so its layer would keep showing the old forecast: never reuse it
            if (!layer.isForecast) {
                existingLayerMap.set(layerKey(layer.frameTime, layer.framePath, layer.frameUrl), layer);
            }
        });

        // Lazy Load: entries start null. A frame with no reusable layer is left
        // null here and its layer is created by getLayer() when needed (e.g. by
        // showFrame or preloading).
        const newLayers = new Array(newFrames.length).fill(null);
        let newVisibleIndex = -1;

        // Current visible layer (reference)
        const visibleLayer = visibleLayerIndex >= 0 ? currentLayers[visibleLayerIndex] : null;

        let index = 0;
        for (const frame of newFrames) {
            const key = layerKey(frame.time, frame.path, frame.url);
            if (existingLayerMap.has(key)) {
                // Reuse existing layer
                const layer = existingLayerMap.get(key);
                layer.setZIndex(100 + index);
                newLayers[index] = layer;

                // If this was the visible layer, track its new index
                if (layer === visibleLayer) {
                    newVisibleIndex = index;
                }

                // Kept: not available to another frame, and not removed
                existingLayerMap.delete(key);
                unused.delete(layer);
            }
            index++;
        }

        // Remove unused layers
        unused.forEach(layer => {
            if (isMapbox) {
                if (map.getLayer(layer.id)) map.removeLayer(layer.id);
                if (map.getSource(layer.sourceId)) map.removeSource(layer.sourceId);
            } else {
                map.removeLayer(layer);
            }
        });

        return { newLayers, newVisibleIndex };
    }
}
