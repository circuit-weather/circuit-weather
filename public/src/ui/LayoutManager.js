/**
 * Manages responsive layout offsets, visibility states, and resize observers.
 */
export class LayoutManager {
    /**
     * Binds media query resize listeners to update mobile visibility and layout offsets.
     * @param {Object} app - The app instance.
     */
    bindResizeHandler(app) {
        if (!app.mobileQuery) return;
        app.mobileQuery.addEventListener('change', () => {
            app.updateMobileVisibility();
            app.updateLayoutOffsets();
        });
    }

    /**
     * Initializes ResizeObservers to handle dynamic layout updates when UI elements change size.
     * @param {Object} app - The app instance.
     */
    initResizeObserver(app) {
        let rafId = null;
        const update = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                app.updateLayoutOffsets();
                rafId = null;
            });
        };
        const observer = new ResizeObserver(update);

        if (app.ui.mobileHeader) observer.observe(app.ui.mobileHeader);
        if (app.ui.mobileRaceInfo) observer.observe(app.ui.mobileRaceInfo);
        if (app.ui.mapContainer) observer.observe(app.ui.mapContainer);

        const bottomControls = ['.mapboxgl-ctrl-bottom-left', '.mapboxgl-ctrl-bottom-right', '.leaflet-control-attribution'];
        bottomControls.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) observer.observe(el);
        });

        const controlSelector = bottomControls.join(', ');
        const mutationObserver = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (let i = 0; i < mutations.length; i++) {
                const addedNodes = mutations[i].addedNodes;
                for (let j = 0; j < addedNodes.length; j++) {
                    const node = addedNodes[j];
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches(controlSelector) || node.querySelector(controlSelector) !== null) {
                            observer.observe(node);
                            shouldUpdate = true;
                        }
                    }
                }
            }
            if (shouldUpdate) update();
        });

        if (app.ui.mapContainer) {
            mutationObserver.observe(app.ui.mapContainer, { childList: true, subtree: true });
        }
    }

    /**
     * Updates visibility of mobile race info banner and map countdown.
     * @param {Object} app - The app instance.
     */
    updateMobileVisibility(app) {
        const isMobile = app.mobileQuery ? app.mobileQuery.matches : false;

        if (app.ui.mobileRaceInfo) {
            app.ui.mobileRaceInfo.style.display = (app.selectedRace && isMobile) ? 'flex' : 'none';
        }

        const mapCountdown = document.getElementById('mapCountdown');
        if (mapCountdown) {
            const now = new Date();
            const isFuture = app.countdown && app.countdown.targetTime && app.countdown.targetTime > now;
            const shouldShow = app.selectedSession && isFuture;
            mapCountdown.style.display = shouldShow ? 'block' : 'none';
        }
    }

    /**
     * Programmatically calculates and updates CSS variables for mobile UI offsets.
     * @param {Object} app - The app instance.
     */
    updateLayoutOffsets(app) {
        if (!app.mobileQuery || !app.mobileQuery.matches) return;

        let topOffset = 56;
        if (app.ui.mobileRaceInfo) {
            const bannerBox = app.ui.mobileRaceInfo.getBoundingClientRect();
            if (bannerBox.height > 0) {
                topOffset = bannerBox.bottom;
            } else if (app.ui.mobileHeader) {
                topOffset = app.ui.mobileHeader.getBoundingClientRect().bottom;
            }
        } else if (app.ui.mobileHeader) {
            topOffset = app.ui.mobileHeader.getBoundingClientRect().bottom;
        }

        const mapTop = 56;
        const mobileTopVar = Math.max(0, topOffset - mapTop) + 2;

        let attributionHeight = 25;
        const attribution = document.querySelector('.mapboxgl-ctrl-bottom-left') ||
                            document.querySelector('.mapboxgl-ctrl-bottom-right') ||
                            document.querySelector('.leaflet-control-attribution');

        if (attribution) {
            const attrBox = attribution.getBoundingClientRect();
            const mapBox = app.ui.mapContainer ? app.ui.mapContainer.getBoundingClientRect() : { bottom: window.innerHeight };
            attributionHeight = Math.max(25, mapBox.bottom - attrBox.top);
        }

        const radarBottom = attributionHeight + 8;

        let radarHeight = 0;
        if (app.ui.radarControls) {
            const radarBox = app.ui.radarControls.getBoundingClientRect();
            if (radarBox.height > 0) {
                radarHeight = radarBox.height;
            }
        }
        const controlsBottom = radarBottom + radarHeight + (radarHeight > 0 ? 8 : 0);

        document.documentElement.style.setProperty('--mobile-top-offset', `${mobileTopVar}px`);
        document.documentElement.style.setProperty('--mobile-radar-offset', `${radarBottom}px`);
        document.documentElement.style.setProperty('--mobile-controls-offset', `${controlsBottom}px`);
    }
}
