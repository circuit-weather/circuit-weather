import { loadScript, whenIdleAfterLoad } from '../utils/loadScript.js';

// Buy Me a Coffee's own widget, exactly as it was embedded inline before
const WIDGET_SRC = 'https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js';
const WIDGET_INTEGRITY = 'sha384-OibPdNn05smfqAFi21q8C4YkzZLEjwXs7kTtiqrJwOv7PtZefVaGPzKgX4rJfvWv';
const WIDGET_ATTRIBUTES = Object.freeze({
    'data-name': 'bmc-button',
    'data-slug': '2fst4u',
    'data-color': '#FF5F5F',
    'data-emoji': '',
    'data-font': 'Poppins',
    'data-text': 'Buy me a coffee',
    'data-outline-color': '#000000',
    'data-font-color': '#ffffff',
    'data-coffee-color': '#FFDD00',
});

/**
 * Loads the Buy Me a Coffee button once the page has loaded and is idle.
 *
 * Inline, the widget's script blocked the page while it downloaded (along
 * with its Poppins font). The widget finds its own <script data-name=
 * "bmc-button"> tag and writes the button with document.writeln, which
 * browsers ignore once the page has loaded, so writeln is pointed at the
 * container while the widget runs. The button's markup is unchanged.
 *
 * @param {Element|null} container
 */
export function loadBuyMeACoffee(container) {
    if (!container) return;
    whenIdleAfterLoad(async () => {
        const originalWriteln = document.writeln;
        document.writeln = (html) => container.insertAdjacentHTML('beforeend', html);
        try {
            await loadScript(WIDGET_SRC, { integrity: WIDGET_INTEGRITY, attributes: WIDGET_ATTRIBUTES, parent: container });
        } catch (error) {
            // A blocked or offline widget just leaves the space empty
            console.warn('Buy Me a Coffee widget failed to load:', error.message);
        } finally {
            document.writeln = originalWriteln;
        }
    });
}
