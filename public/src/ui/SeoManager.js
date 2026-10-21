import { i18n } from '../i18n/index.js';

/**
 * SEO Manager for updating document titles, meta tags, and structured JSON-LD data.
 */
export class SeoManager {
    /**
     * Determines page title and description based on selected race and session.
     * @param {Object|null} selectedRace
     * @param {Object|null} selectedSession
     * @returns {{title: string, desc: string}}
     */
    static getPageTitleAndDesc(selectedRace, selectedSession) {
        const defaultTitle = i18n.t('meta.defaultTitle');
        const defaultDesc = i18n.t('meta.defaultDesc');

        let title = defaultTitle;
        let desc = defaultDesc;

        if (selectedRace && selectedSession) {
            // Specific session page: "Bahrain GP Qualifying Weather - Circuit Weather"
            title = i18n.t('meta.sessionTitle', {
                raceName: selectedRace.name,
                sessionName: selectedSession.name,
            });
            desc = i18n.t('meta.sessionDesc', {
                raceName: selectedRace.name,
                sessionName: selectedSession.name,
            });
        } else if (selectedRace) {
            // Race page: "Bahrain GP Weather - Circuit Weather"
            title = i18n.t('meta.raceTitle', { raceName: selectedRace.name });
            desc = i18n.t('meta.raceDesc', { raceName: selectedRace.name });
        }

        return { title, desc };
    }

    /**
     * Updates document title and meta/canonical tags in head.
     * @param {string} title
     * @param {string} desc
     */
    static updateMetaTags(title, desc) {
        // Update Title: Crucial for primary SERP display and browser history
        document.title = title;

        let child = document.head.firstElementChild;
        while (child) {
            const tag = child.tagName;
            if (tag === 'META') {
                const name = child.getAttribute('name');
                const property = child.getAttribute('property');

                if (name === 'description' || name === 'twitter:description' || property === 'og:description') {
                    child.setAttribute('content', desc);
                } else if (name === 'twitter:title' || property === 'og:title') {
                    child.setAttribute('content', title);
                } else if (name === 'twitter:url' || property === 'og:url') {
                    child.setAttribute('content', window.location.href);
                }
            } else if (tag === 'LINK' && child.getAttribute('rel') === 'canonical') {
                child.setAttribute('href', window.location.href);
            }
            child = child.nextElementSibling;
        }
    }

    /**
     * Injects dynamic BreadcrumbList JSON-LD structured data.
     * Scout: Improves SERP display by giving search engines clear navigational
     * context for nested routes.
     * @param {Object|null} selectedRace
     * @param {Object|null} selectedSession
     */
    static updateBreadcrumbJsonLd(selectedRace, selectedSession) {
        let breadcrumbScript = document.getElementById('dynamic-breadcrumb-ld');
        if (!breadcrumbScript) {
            breadcrumbScript = document.createElement('script');
            breadcrumbScript.id = 'dynamic-breadcrumb-ld';
            breadcrumbScript.type = 'application/ld+json';
            document.head.appendChild(breadcrumbScript);
        }

        const baseUrl = window.location.origin || 'https://circuit-weather.racing';
        const breadcrumbs = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Circuit Weather",
                    "item": baseUrl
                }
            ]
        };

        if (selectedRace) {
            breadcrumbs.itemListElement.push({
                "@type": "ListItem",
                "position": 2,
                "name": selectedRace.name,
                "item": `${baseUrl}/f1/${selectedRace.round}`
            });

            if (selectedSession) {
                breadcrumbs.itemListElement.push({
                    "@type": "ListItem",
                    "position": 3,
                    "name": selectedSession.name,
                    "item": `${baseUrl}/f1/${selectedRace.round}/${selectedSession.id}`
                });
            }
        }

        // SEC: Sanitize JSON string for inline script injection to prevent XSS
        breadcrumbScript.textContent = JSON.stringify(breadcrumbs)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');
    }

    /**
     * Injects or removes SportsEvent JSON-LD structured data for selected session.
     * Scout: Improves rich snippets in SERP by providing explicit event details
     * (SportsEvent) to search engines.
     * @param {Object|null} selectedRace
     * @param {Object|null} selectedSession
     * @param {string} desc
     */
    static updateEventJsonLd(selectedRace, selectedSession, desc) {
        if (selectedRace && selectedSession && selectedSession.date && selectedSession.time) {
            let jsonLdScript = document.getElementById('dynamic-json-ld');
            if (!jsonLdScript) {
                jsonLdScript = document.createElement('script');
                jsonLdScript.id = 'dynamic-json-ld';
                jsonLdScript.type = 'application/ld+json';
                document.head.appendChild(jsonLdScript);
            }

            const startObj = new Date(`${selectedSession.date}T${selectedSession.time}`);
            const sessionStart = startObj.toISOString();

            // Scout: Calculate an estimated end time (2 hours after start) to satisfy search engine
            // requirements for Event schema, preventing 'Missing field "endDate"' warnings in Rich Results.
            const endObj = new Date(startObj.getTime() + 2 * 60 * 60 * 1000);
            const sessionEnd = endObj.toISOString();

            // Scout: sport, url and image give search engines richer context about the
            // entity for better indexing.
            const schema = {
                "@context": "https://schema.org",
                "@type": "SportsEvent",
                "name": `${selectedRace.name} - ${selectedSession.name}`,
                "description": desc,
                "sport": "Formula 1",
                "startDate": sessionStart,
                "endDate": sessionEnd,
                "eventStatus": "https://schema.org/EventScheduled",
                "url": window.location.href,
                "image": "https://circuit-weather.racing/icon-512.png",
                // Scout: Added organizer entity to explicitly link the event to Formula 1 for knowledge graph integration.
                "organizer": {
                    "@type": "Organization",
                    "name": "Formula 1",
                    "url": "https://www.formula1.com"
                },
                "location": {
                    "@type": "Place",
                    "name": selectedRace.circuit ? selectedRace.circuit.circuitName : (selectedRace.location ? selectedRace.location.country : ""),
                    "address": {
                        "@type": "PostalAddress",
                        "addressCountry": selectedRace.location ? selectedRace.location.country : ""
                    },
                    // Scout: Injected precise GeoCoordinates into the Place schema.
                    // Value: Helps search engines exactly geolocate the event for better local search relevance and map integrations.
                    "geo": {
                        "@type": "GeoCoordinates",
                        "latitude": selectedRace.location ? selectedRace.location.lat : "",
                        "longitude": selectedRace.location ? selectedRace.location.long : ""
                    }
                }
            };

            // SEC: Sanitize JSON string for inline script injection to prevent XSS
            jsonLdScript.textContent = JSON.stringify(schema)
                .replace(/</g, '\\u003c')
                .replace(/>/g, '\\u003e')
                .replace(/&/g, '\\u0026');
        } else {
            // Remove the dynamic schema if no specific session is selected
            const existingScript = document.getElementById('dynamic-json-ld');
            if (existingScript && existingScript.parentNode) {
                existingScript.parentNode.removeChild(existingScript);
            }
        }
    }

    /**
     * Updates the document title and metadata for SEO and browser history context.
     * Dynamic titles and meta tags improve SERP visibility and rich social sharing.
     * @param {Object|null} selectedRace
     * @param {Object|null} selectedSession
     */
    static updatePageMetadata(selectedRace, selectedSession) {
        const { title, desc } = SeoManager.getPageTitleAndDesc(selectedRace, selectedSession);
        SeoManager.updateMetaTags(title, desc);
        SeoManager.updateBreadcrumbJsonLd(selectedRace, selectedSession);
        SeoManager.updateEventJsonLd(selectedRace, selectedSession, desc);
    }
}
