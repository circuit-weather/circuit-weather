## 2024-05-18 - Added skip-to-content link
**Learning:** Adding a visually hidden skip link for keyboard navigation requires a unique CSS class (e.g., `.skip-link`) because the global `:focus-visible` styles don't inherently support repositioning elements off-screen and then on-screen during focus. Custom styling is required for this specific accessibility pattern, even though general focus styles are handled globally.
**Action:** When adding bypass blocks or skip links, explicitly style them to be hidden visually (e.g., `position: absolute; top: -40px;`) and visible only on `:focus`, overriding the global focus ring if necessary.
## 2026-04-28 - Focus-visible requires Tab emulation for verification
**Learning:** When using Playwright to visually verify `:focus-visible` styles, programmatically focusing elements (e.g., `locator.focus()`) may not reliably trigger the pseudo-class. Genuine keyboard navigation must be simulated using `page.keyboard.press('Tab')` to accurately trigger and capture the keyboard focus state.
**Action:** When writing Playwright verification scripts for keyboard accessibility features, rely on sequential `Tab` presses to reach the target element rather than direct DOM `.focus()` methods.
## 2024-05-19 - Screen reader visibility of disabled inputs
**Learning:** Screen readers might not consistently announce elements with only the `disabled` property. Adding `aria-disabled="true"` to inputs like `select` gives screen reader users explicit information that an element is present but currently inactive, which provides better context than skipping it entirely.
**Action:** When adding or dynamically toggling the `disabled` property on form elements or buttons, also update the `aria-disabled` attribute to maintain synchronization for assistive technologies.
## 2026-05-03 - Redundant labels for screen readers
**Learning:** Adding an internal visually hidden span (e.g., `<span class="sr-only">`) inside an interactive element like a button that already has an explicit `aria-label` causes screen readers to redundantly announce the label twice.
**Action:** Always avoid using an internal `.sr-only` span for text if the parent interactive element already provides the exact same information via an `aria-label` attribute.
