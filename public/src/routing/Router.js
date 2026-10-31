/**
 * Handles application routing using the HTML5 History API.
 */
export class Router {
    constructor(onRoute) {
        this.onRoute = onRoute;
        window.addEventListener('popstate', () => this.handleRoute());
    }

    handleRoute() {
        const parts = window.location.pathname.split('/').filter(Boolean);
        if (parts.length >= 1) {
            this.onRoute({ series: parts[0], round: parts[1] || null, session: parts[2] || null });
        }
    }

    navigate(series, round, session) {
        let path = `/${series}`;
        if (round) path += `/${round}`;
        if (session) path += `/${session}`;
        window.history.pushState({}, '', path);
    }

    getParams() {
        const parts = window.location.pathname.split('/').filter(Boolean);
        // No series in the URL: the app falls back to the visitor's saved series
        return { series: parts[0] || null, round: parts[1] || null, session: parts[2] || null };
    }
}
