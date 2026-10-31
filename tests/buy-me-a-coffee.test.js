// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../public/src/utils/loadScript.js', () => ({
    whenIdleAfterLoad: vi.fn((task) => task()),
    loadScript: vi.fn(),
}));

const { loadBuyMeACoffee } = await import('../public/src/ui/BuyMeACoffee.js');
const { loadScript, whenIdleAfterLoad } = await import('../public/src/utils/loadScript.js');

describe('loadBuyMeACoffee', () => {
    let container;
    const originalWriteln = document.writeln;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<aside id="bmcContainer"></aside>';
        container = document.getElementById('bmcContainer');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.writeln = originalWriteln;
    });

    it('does nothing without a container', () => {
        loadBuyMeACoffee(null);
        expect(whenIdleAfterLoad).not.toHaveBeenCalled();
    });

    it('loads the same widget after the page, writing its button into the container', async () => {
        // The widget writes its button with document.writeln while it runs
        loadScript.mockImplementation(async () => {
            document.writeln('<div class="bmc-btn-container"><a class="bmc-btn" href="https://buymeacoffee.com/2fst4u">Buy me a coffee</a></div>');
        });

        loadBuyMeACoffee(container);
        await vi.waitFor(() => expect(document.writeln).toBe(originalWriteln));

        expect(whenIdleAfterLoad).toHaveBeenCalled();
        expect(loadScript).toHaveBeenCalledWith('https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js', {
            integrity: 'sha384-OibPdNn05smfqAFi21q8C4YkzZLEjwXs7kTtiqrJwOv7PtZefVaGPzKgX4rJfvWv',
            attributes: expect.objectContaining({ 'data-name': 'bmc-button', 'data-slug': '2fst4u', 'data-color': '#FF5F5F', 'data-font': 'Poppins' }),
            parent: container,
        });
        expect(container.querySelector('a.bmc-btn').getAttribute('href')).toBe('https://buymeacoffee.com/2fst4u');
    });

    it('restores document.writeln and leaves the space empty if the widget fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        loadScript.mockRejectedValue(new Error('blocked'));

        loadBuyMeACoffee(container);
        await vi.waitFor(() => expect(console.warn).toHaveBeenCalledWith('Buy Me a Coffee widget failed to load:', 'blocked'));

        expect(document.writeln).toBe(originalWriteln);
        expect(container.children).toHaveLength(0);
    });
});
