export class RadarReconcile {
    // Bolt Optimization: Reuse Leaflet layers to reduce DOM churn
    static reconcileLayers(map, currentLayers, newFrames, visibleLayerIndex) {
        const isMapbox = !map.hasLayer;

        // Map (time + path) -> Layer
        const existingLayerMap = new Map();

        // Populate map with existing valid layers
        currentLayers.forEach(layer => {
            if (layer) {
                const key = `${layer.frameTime}-${layer.framePath}`;
                existingLayerMap.set(key, layer);
            }
        });

        const newLayers = new Array(newFrames.length).fill(null);
        let newVisibleIndex = -1;

        // Current visible layer (reference)
        const visibleLayer = visibleLayerIndex >= 0 ? currentLayers[visibleLayerIndex] : null;

        let index = 0;
        for (const frame of newFrames) {
            const key = `${frame.time}-${frame.path}`;
            if (existingLayerMap.has(key)) {
                // Reuse existing layer
                const layer = existingLayerMap.get(key);
                layer.setZIndex(100 + index);
                newLayers[index] = layer;

                // If this was the visible layer, track its new index
                if (layer === visibleLayer) {
                    newVisibleIndex = index;
                }

                // Remove from map so we know what's left is unused
                existingLayerMap.delete(key);
            } else {
                // Lazy Load: Leave as null.
                // Layer will be created by getLayer() when needed (e.g. by showFrame or preloading).
                newLayers[index] = null;
            }
            index++;
        }

        // Remove unused layers
        existingLayerMap.forEach(layer => {
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
