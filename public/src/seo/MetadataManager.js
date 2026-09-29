import { i18n } from '../i18n/index.js';

/**
 * Manages SEO page title, meta tags, and JSON-LD structured data for search engines.
 */
export class MetadataManager {
    /**
     * Determines the SEO page title and description based on current selection.
     * @param {Object} app - The app instance.
     * @returns {{ title: string, desc: string }} Title and description object.
     */
    getPageTitleAndDesc(app) {
        const defaultTitle = i18n.t('meta.defaultTitle');
        const defaultDesc = i18n.t('meta.defaultDesc');

        let title = defaultTitle;
        let desc = defaultDesc;

        if (app.selectedRace && app.selectedSession) {
            title = i18n.t('meta.sessionTitle', {
                raceName: app.selectedRace.name,
                sessionName: app.selectedSession.name,
            });
            desc = i18n.t('meta.sessionDesc', {
                raceName: app.selectedRace.name,
                sessionName: app.selectedSession.name,
            });
        } else if (app.selectedRace) {
            title = i18n.t('meta.raceTitle', { raceName: app.selectedRace.name });
            desc = i18n.t('meta.raceDesc', { raceName: app.selectedRace.name });
        }

        return { title, desc };
    }

    /**
     * Dynamically updates document.title and meta tags for search engines and social cards.
     * @param {string} title
     * @param {string} desc
     */
    updateMetaTags(title, desc) {
        document.title = title;

        let child = document.head ? document.head.firstElementChild : null;
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
            }
            child = child.nextElementSibling || child.nextSibling;
        }
    }

    /**
     * Injects or updates BreadcrumbList JSON-LD structured data for deep link indexing.
     * @param {Object} app - The app instance.
     */
    updateBreadcrumbJsonLd(app) {
        let breadcrumbScript = document.getElementById('dynamic-breadcrumb-ld');
        if (!breadcrumbScript) {
            breadcrumbScript = document.createElement('script');
            breadcrumbScript.id = 'dynamic-breadcrumb-ld';
            breadcrumbScript.type = 'application/ld+json';
            document.head.appendChild(breadcrumbScript);
        }

        const origin = window.location.origin || 'https://circuit-weather.racing';
        const items = [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": `${origin}/`
            }
        ];

        if (app.selectedRace) {
            items.push({
                "@type": "ListItem",
                "position": 2,
                "name": app.selectedRace.name,
                "item": `${origin}/f1/${app.selectedRace.round}`
            });

            if (app.selectedSession) {
                items.push({
                    "@type": "ListItem",
                    "position": 3,
                    "name": app.selectedSession.name,
                    "item": `${origin}/f1/${app.selectedRace.round}/${app.selectedSession.id}`
                });
            }
        }

        const schema = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": items
        };

        breadcrumbScript.textContent = JSON.stringify(schema)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');
    }

    /**
     * Injects or updates dynamic SportsEvent JSON-LD structured data for selected session.
     * @param {Object} app - The app instance.
     * @param {string} desc - Session description.
     */
    updateEventJsonLd(app, desc) {
        if (app.selectedRace && app.selectedSession && app.selectedSession.date && app.selectedSession.time) {
            let jsonLdScript = document.getElementById('dynamic-json-ld');
            if (!jsonLdScript) {
                jsonLdScript = document.createElement('script');
                jsonLdScript.id = 'dynamic-json-ld';
                jsonLdScript.type = 'application/ld+json';
                document.head.appendChild(jsonLdScript);
            }

            const startObj = new Date(`${app.selectedSession.date}T${app.selectedSession.time}`);
            const sessionStart = startObj.toISOString();
            const endObj = new Date(startObj.getTime() + 2 * 60 * 60 * 1000);
            const sessionEnd = endObj.toISOString();

            const schema = {
                "@context": "https://schema.org",
                "@type": "SportsEvent",
                "name": `${app.selectedRace.name} - ${app.selectedSession.name}`,
                "description": desc,
                "sport": "Formula 1",
                "startDate": sessionStart,
                "endDate": sessionEnd,
                "eventStatus": "https://schema.org/EventScheduled",
                "url": window.location.href,
                "image": "https://circuit-weather.racing/icon-512.png",
                "organizer": {
                    "@type": "Organization",
                    "name": "Formula 1",
                    "url": "https://www.formula1.com"
                },
                "location": {
                    "@type": "Place",
                    "name": app.selectedRace.circuit ? app.selectedRace.circuit.circuitName : (app.selectedRace.location ? app.selectedRace.location.country : ""),
                    "address": {
                        "@type": "PostalAddress",
                        "addressCountry": app.selectedRace.location ? app.selectedRace.location.country : ""
                    },
                    "geo": {
                        "@type": "GeoCoordinates",
                        "latitude": app.selectedRace.location ? app.selectedRace.location.lat : "",
                        "longitude": app.selectedRace.location ? app.selectedRace.location.long : ""
                    }
                }
            };

            jsonLdScript.textContent = JSON.stringify(schema)
                .replace(/</g, '\\u003c')
                .replace(/>/g, '\\u003e')
                .replace(/&/g, '\\u0026');
        } else {
            const existingScript = document.getElementById('dynamic-json-ld');
            if (existingScript && existingScript.parentNode) {
                existingScript.parentNode.removeChild(existingScript);
            }
        }
    }

    /**
     * Updates document title and metadata for SEO and browser history context.
     * @param {Object} app - The app instance.
     */
    updatePageMetadata(app) {
        const { title, desc } = this.getPageTitleAndDesc(app);
        this.updateMetaTags(title, desc);
        this.updateBreadcrumbJsonLd(app);
        this.updateEventJsonLd(app, desc);
    }
}
