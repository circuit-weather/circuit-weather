import { describe, it, expect, vi, beforeEach } from "vitest";
import { i18n } from "../public/src/i18n/index.js";

// --- Global Mocks ---
const createMockElement = (id) => {
  const el = {
    id,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      contains: vi.fn().mockReturnValue(false),
    },
    style: {},
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    textContent: "",
    innerHTML: "",
    focus: vi.fn(function () {
      // Correctly update activeElement when focus is called
      mockActiveElement = this;
    }),
    querySelectorAll: vi.fn(() => []),
    offsetParent: {},
    showModal: vi.fn(),
    close: vi.fn(),
  };
  return el;
};

// We need a way to control activeElement for tests
let mockActiveElement = { tagName: "BODY" };

vi.stubGlobal("document", {
  getElementById: vi.fn((id) => createMockElement(id)),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  documentElement: { lang: "en" },
  get activeElement() {
    return mockActiveElement;
  },
  set activeElement(el) {
    mockActiveElement = el;
  },
  body: { style: {} },
});

vi.stubGlobal("fetch", vi.fn());

// Mock DOMParser for tests since it's not natively available in the Node.js test environment
class MockDOMParser {
  parseFromString(str, type) {
    // Simple mock implementation to handle entity decoding for our specific test cases
    let decoded = str;
    // Run a few times to handle nested encoded strings like `&amp;colon;` becoming `&colon;` then `:`
    for (let i = 0; i < 3; i++) {
      decoded = decoded
        .replace(/&amp;/gi, "&")
        .replace(/&colon;/gi, ":")
        .replace(/&#58;/gi, ":")
        .replace(/&#x3a;/gi, ":")
        .replace(/&quot;/gi, '"');
    }

    return {
      documentElement: {
        textContent: decoded,
      },
    };
  }
}
vi.stubGlobal("DOMParser", MockDOMParser);

const { PrivacyModal } = await import("../public/src/ui/PrivacyModal.js");

describe("PrivacyModal", () => {
  let modal;

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveElement = { tagName: "BODY", focus: vi.fn() };
    // Reset fetch to a default success
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => "Privacy Policy Content",
    });
    i18n.locale = "en";
    modal = new PrivacyModal();
  });

  // ---------------------------------------------------------------
  // sanitizeUrl is a closure inside parseMarkdown, so we test it
  // indirectly by passing markdown containing links and inspecting
  // the href attribute in the rendered HTML.
  // ---------------------------------------------------------------
  describe("sanitizeUrl (via parseMarkdown)", () => {
    const extractHref = (html) => {
      const match = html.match(/href="([^"]*)"/);
      return match ? match[1] : null;
    };

    it("allows https URLs", () => {
      const md = "[link](https://example.com)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("https://example.com");
    });

    it("allows http URLs", () => {
      const md = "[link](http://example.com)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("http://example.com");
    });

    it("allows mailto URLs", () => {
      const md = "[email](mailto:user@example.com)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("mailto:user@example.com");
    });

    it("allows relative URLs (no scheme)", () => {
      const md = "[page](/about)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("/about");
    });

    it("blocks javascript: URLs", () => {
      const md = "[click](javascript:alert(1))";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("blocks vbscript: URLs", () => {
      const md = "[click](vbscript:MsgBox)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("blocks data: URLs", () => {
      const md = "[click](data:text/html,<h1>XSS</h1>)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("blocks file: URLs", () => {
      const md = "[click](file:///etc/passwd)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("blocks blob: URLs", () => {
      const md = "[click](blob:http://example.com/uuid)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("blocks whitespace bypass (java\\nscript:)", () => {
      const md = "[click](java\nscript:alert(1))";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("blocks control character bypass (java\\x00script:)", () => {
      const md = "[click](java\x00script:alert(1))";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("handles case-insensitive scheme detection", () => {
      const md = "[click](JAVASCRIPT:alert(1))";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("blocks HTML entity encoded scheme bypasses (&colon;)", () => {
      const md = "[click](javascript&colon;alert(1))";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("blocks HTML entity encoded scheme bypasses (&#58;)", () => {
      const md = "[click](javascript&#58;alert(1))";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("blocks HTML entity encoded scheme bypasses (&#x3a;)", () => {
      const md = "[click](javascript&#x3a;alert(1))";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");
    });

    it("allows HTTPS in uppercase", () => {
      const md = "[link](HTTPS://EXAMPLE.COM)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("HTTPS://EXAMPLE.COM");
    });

    it("re-escapes entities that decode to quotes to prevent attribute breakout", () => {
      const md = "[link](https://example.com/&quot;onmouseover=&quot;alert=1)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe(
        "https://example.com/&quot;onmouseover=&quot;alert=1",
      );
    });

    it("fails securely and blocks URL if DOMParser fails", () => {
      // Temporarily mock DOMParser to throw an error
      const originalDOMParser = global.DOMParser;
      class ErrorDOMParser {
        parseFromString() {
          throw new Error("Simulated DOMParser error");
        }
      }
      global.DOMParser = ErrorDOMParser;

      const md = "[link](https://example.com/safe)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");

      // Restore original mock
      global.DOMParser = originalDOMParser;
    });

    it("returns #unsafe-url if DOMParser throws an error", () => {
      const originalDOMParser = global.DOMParser;
      class ThrowingDOMParser {
        parseFromString() {
          throw new Error("Parse error");
        }
      }
      global.DOMParser = ThrowingDOMParser;

      const md = "[link](https://example.com/safe)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");

      // Restore original mock
      global.DOMParser = originalDOMParser;
    });

    it("fails securely and blocks URL if DOMParser returns null doc", () => {
      const originalDOMParser = global.DOMParser;
      class NullDocDOMParser {
        parseFromString() {
          return null;
        }
      }
      global.DOMParser = NullDocDOMParser;

      const md = "[link](https://example.com/safe)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");

      // Restore original mock
      global.DOMParser = originalDOMParser;
    });

    it("fails securely and blocks URL if DOMParser returns doc without documentElement", () => {
      const originalDOMParser = global.DOMParser;
      class NullDocDOMParser {
        parseFromString() {
          return {};
        }
      }
      global.DOMParser = NullDocDOMParser;

      const md = "[link](https://example.com/safe)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("#unsafe-url");

      // Restore original mock
      global.DOMParser = originalDOMParser;
    });

    it("handles DOMParser missing documentElement textContent", () => {
      const originalDOMParser = global.DOMParser;
      class NoTextContentDOMParser {
        parseFromString() {
          return { documentElement: {} };
        }
      }
      global.DOMParser = NoTextContentDOMParser;

      const md = "[link](https://example.com/safe)";
      const html = modal.parseMarkdown(md);
      expect(extractHref(html)).toBe("https://example.com/safe");

      // Restore original mock
      global.DOMParser = originalDOMParser;
    });
  });

  // ---------------------------------------------------------------
  // parseMarkdown rendering tests
  // ---------------------------------------------------------------
  describe("parseMarkdown", () => {
    it("removes the main h1 heading", () => {
      const md = "# Politica de privacidad\n\nSome content.";
      const html = modal.parseMarkdown(md);
      expect(html).not.toContain("Politica de privacidad");
      expect(html).toContain("Some content.");
    });

    it("converts ## headings to <h2>", () => {
      const md = "## Section Title";
      const html = modal.parseMarkdown(md);
      expect(html).toContain("<h2>Section Title</h2>");
    });

    it("converts ### headings to <h3>", () => {
      const md = "### Sub-Section";
      const html = modal.parseMarkdown(md);
      expect(html).toContain("<h3>Sub-Section</h3>");
    });

    it("converts **bold** to <strong>", () => {
      const md = "This is **bold** text.";
      const html = modal.parseMarkdown(md);
      expect(html).toContain("<strong>bold</strong>");
    });

    it("converts list items to <li> wrapped in <ul>", () => {
      const md = "- Item 1\n- Item 2";
      const html = modal.parseMarkdown(md);
      expect(html).toContain("<li>Item 1</li>");
      expect(html).toContain("<li>Item 2</li>");
      expect(html).toContain("<ul>");
      expect(html).toContain("</ul>");
    });

    it("escapes HTML to prevent XSS", () => {
      const md = '<script>alert("xss")</script>';
      const html = modal.parseMarkdown(md);
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("wraps plain text blocks in <p> tags", () => {
      const md = "Just a paragraph.";
      const html = modal.parseMarkdown(md);
      expect(html).toContain("<p>");
      expect(html).toContain("Just a paragraph.");
    });

    it('renders links with target="_blank" and rel="noopener noreferrer"', () => {
      const md = "[Example](https://example.com)";
      const html = modal.parseMarkdown(md);
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });

    it("returns block unchanged if it starts with < but not h or ul", () => {
      const md = "**bold**";
      const html = modal.parseMarkdown(md);
      expect(html).toBe("<strong>bold</strong>");
    });

    it("returns empty string for empty input", () => {
      const html = modal.parseMarkdown("");
      expect(html).toBe("");
    });
  });

  // ---------------------------------------------------------------
  // Interaction & Logic Tests
  // ---------------------------------------------------------------
  describe("Interaction Logic", () => {
    it("binds events on initialization", () => {
      // Check that event listeners were attached to key elements
      expect(modal.privacyLink.addEventListener).toHaveBeenCalledWith(
        "click",
        expect.any(Function),
      );
      expect(modal.closeBtn.addEventListener).toHaveBeenCalledWith(
        "click",
        expect.any(Function),
      );
      expect(modal.modal.addEventListener).toHaveBeenCalledWith(
        "click",
        expect.any(Function),
      );
      expect(modal.modal.addEventListener).toHaveBeenCalledWith(
        "close",
        expect.any(Function),
      );
    });

    it("triggers open when privacy link is clicked", () => {
      const openSpy = vi.spyOn(modal, "open").mockImplementation(() => {});
      const clickHandler = modal.privacyLink.addEventListener.mock.calls.find(
        (call) => call[0] === "click",
      )[1];
      clickHandler({ preventDefault: vi.fn() });
      expect(openSpy).toHaveBeenCalled();
    });

    it("triggers open when privacy link is activated via keyboard (Space)", () => {
      const openSpy = vi.spyOn(modal, "open").mockImplementation(() => {});
      const keydownHandler = modal.privacyLink.addEventListener.mock.calls.find(
        (call) => call[0] === "keydown",
      )[1];

      const event = { key: " ", preventDefault: vi.fn() };
      keydownHandler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalled();
    });

    it("triggers open when privacy link is activated via keyboard (Spacebar)", () => {
      const openSpy = vi.spyOn(modal, "open").mockImplementation(() => {});
      const keydownHandler = modal.privacyLink.addEventListener.mock.calls.find(
        (call) => call[0] === "keydown",
      )[1];

      const event = { key: "Spacebar", preventDefault: vi.fn() };
      keydownHandler(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalled();
    });

    it("does not trigger open for other keys on privacy link", () => {
      const openSpy = vi.spyOn(modal, "open").mockImplementation(() => {});
      const keydownHandler = modal.privacyLink.addEventListener.mock.calls.find(
        (call) => call[0] === "keydown",
      )[1];

      const event = { key: "Enter", preventDefault: vi.fn() };
      keydownHandler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(openSpy).not.toHaveBeenCalled();
    });

    it("closes when modal is clicked directly (backdrop click)", () => {
      const closeSpy = vi.spyOn(modal, "close").mockImplementation(() => {});
      const clickHandler = modal.modal.addEventListener.mock.calls.find(
        (call) => call[0] === "click",
      )[1];
      clickHandler({ target: modal.modal });
      expect(closeSpy).toHaveBeenCalled();
    });

    it("does not close when inner content of modal is clicked", () => {
      const closeSpy = vi.spyOn(modal, "close").mockImplementation(() => {});
      const clickHandler = modal.modal.addEventListener.mock.calls.find(
        (call) => call[0] === "click",
      )[1];
      clickHandler({ target: {} });
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it("opens, fetches content, and locks focus", async () => {
      // Setup a trigger element
      const trigger = { tagName: "BUTTON", focus: vi.fn(), id: "trigger-btn" };
      document.activeElement = trigger;

      await modal.open();

      // Verify content fetch
      // Fallback order for 'en': PRIVACY.en.md (doesn't exist but is tried) -> en-GB -> en-US -> /PRIVACY.md
      // Actually it depends on the mocked i18n.locale.
      // In beforeEach it's 'en'. resolvePrivacyLocale('en') returns 'en-NZ'.
      expect(global.fetch).toHaveBeenCalledWith("/privacy/PRIVACY.en-NZ.md", expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(modal.loaded).toBe(true);

      // Verify visibility
      expect(modal.modal.showModal).toHaveBeenCalled();
      expect(document.body.style.overflow).toBe("hidden");

      // Verify focus management
      expect(modal.triggerElement).toBe(trigger); // Should store the trigger
    });

    it("does not re-fetch content if already loaded", async () => {
      modal.loaded = true;
      await modal.open();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("closes the native modal", async () => {
      // Setup open state
      const trigger = { tagName: "BUTTON", focus: vi.fn(), id: "trigger-btn" };
      modal.triggerElement = trigger;

      modal.close();

      expect(modal.modal.close).toHaveBeenCalled();
    });

    it("restores focus and unlocks body on native close event", () => {
      const trigger = { tagName: "BUTTON", focus: vi.fn(), id: "trigger-btn" };
      modal.triggerElement = trigger;

      const closeHandler = modal.modal.addEventListener.mock.calls.find(
        (call) => call[0] === "close",
      )[1];

      closeHandler();

      expect(document.body.style.overflow).toBe("");
      expect(trigger.focus).toHaveBeenCalled();
      expect(modal.triggerElement).toBeNull();
    });

    it("handles missing content element when fetch fails", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      global.fetch.mockRejectedValue(new Error("Network error"));

      modal.content = null;
      await modal.open();

      expect(modal.loaded).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("throws an error when no translation is available", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      global.fetch.mockResolvedValue({ ok: true, text: async () => "" });

      await modal.open();

      expect(modal.loaded).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith("Failed to load privacy policy:", expect.any(Error));
      expect(modal.content.innerHTML).toContain("Failed to load privacy policy");
      errorSpy.mockRestore();
    });

    it("handles fetch errors gracefully", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      global.fetch.mockRejectedValue(new Error("Network error"));

      await modal.open();

      expect(modal.content.innerHTML).toContain(
        "Failed to load privacy policy",
      );
      // Even if failed, it might set loaded to false or just show error.
      // Implementation sets loaded=true only on success? No, let's check code.
      // Code sets loaded=true ONLY in try block. So it remains false.
      expect(modal.loaded).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe("localized privacy policy loading", () => {
    it("builds locale-specific fallback paths", () => {
      i18n.locale = "pt-BR";
      expect(modal.getPrivacyPolicyPaths()).toEqual([
        "/privacy/PRIVACY.pt-BR.md",
        "/privacy/PRIVACY.en-GB.md",
        "/privacy/PRIVACY.en-NZ.md",
        "/privacy/PRIVACY.en-US.md",
        "/PRIVACY.md",
      ]);
    });

    it("handles explicit falsy locale fallback safely", () => {
      expect(modal.resolvePrivacyLocale(null)).toBe("en-NZ");
      expect(modal.resolvePrivacyLocale("")).toBe("en-NZ");
      expect(modal.resolvePrivacyLocale(undefined)).toBe("en-NZ");

      // Force getPrivacyPolicyPaths to run with falsy locale
      i18n.locale = null;
      expect(modal.getPrivacyPolicyPaths()).toEqual([
        "/privacy/PRIVACY.en-NZ.md",
        "/privacy/PRIVACY.en-GB.md",
        "/privacy/PRIVACY.en-US.md",
        "/PRIVACY.md",
      ]);
    });

    it("handles non-supported base languages", () => {
      expect(modal.resolvePrivacyLocale("ko-KR")).toBe("en-NZ");
    });

    it("handles en regional variations", () => {
      expect(modal.resolvePrivacyLocale("en-AU")).toBe("en-NZ");
      expect(modal.resolvePrivacyLocale("pt-PT")).toBe("pt-BR");
      expect(modal.resolvePrivacyLocale("zh-TW")).toBe("zh-CN");
    });

    it("falls back to en-NZ for completely unknown locales", () => {
      i18n.locale = "xx-YY";
      expect(modal.resolvePrivacyLocale("xx-YY")).toBe("en-NZ");
    });

    it("normalises regional locales to supported translation files", () => {
      i18n.locale = "fr-CA";
      expect(modal.getPrivacyPolicyPaths()).toEqual([
        "/privacy/PRIVACY.fr.md",
        "/privacy/PRIVACY.en-GB.md",
        "/privacy/PRIVACY.en-NZ.md",
        "/privacy/PRIVACY.en-US.md",
        "/PRIVACY.md",
      ]);
    });

    it("separates english locale fallbacks for en-US", () => {
      i18n.locale = "en-US";
      expect(modal.getPrivacyPolicyPaths()).toEqual([
        "/privacy/PRIVACY.en-US.md",
        "/privacy/PRIVACY.en-GB.md",
        "/privacy/PRIVACY.en-NZ.md",
        "/PRIVACY.md",
      ]);
    });

    it("separates english locale fallbacks for en-GB", () => {
      i18n.locale = "en-GB";
      expect(modal.getPrivacyPolicyPaths()).toEqual([
        "/privacy/PRIVACY.en-GB.md",
        "/privacy/PRIVACY.en-NZ.md",
        "/privacy/PRIVACY.en-US.md",
        "/PRIVACY.md",
      ]);
    });

    it("falls back to next translation when first path is unavailable", async () => {
      i18n.locale = "fr-CA";
      global.fetch
        .mockResolvedValueOnce({ ok: false, text: async () => "" })
        .mockResolvedValueOnce({ ok: true, text: async () => "# Politique\n\nContenu" });

      await modal.open();

      expect(global.fetch).toHaveBeenNthCalledWith(1, "/privacy/PRIVACY.fr.md", expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(global.fetch).toHaveBeenNthCalledWith(2, "/privacy/PRIVACY.en-GB.md", expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(modal.content.innerHTML).toContain("Contenu");
    });
  });

  describe("Focus Trap", () => {
    it("is skipped natively by the dialog element, removing manual logic", () => {
      // Focus trap is handled natively by HTML dialog, testing it manually is obsolete
      expect(modal.handleFocusTrap).toBeUndefined();
    });
  });
});
