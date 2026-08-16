## 2024-05-24 - Focus Management in Custom Selects

**Learning:** In custom select dropdowns (like the language menu), always focusing the first element upon opening forces keyboard users to navigate back through the list to reach their current selection. The active element should be the initial focus target.
**Action:** When implementing custom menus, always add focus management that targets the `.active` or `[aria-checked="true"]` item first, falling back to the first item if no active state is found.

## 2024-05-24 - Screen Reader Ghost Elements

**Learning:** Purely visual overlay elements (like full-screen backdrops used to close sidebars on mobile) can be announced by screen readers as empty, interactive regions if not explicitly hidden. Even if they are just empty `div`s, their presence in the DOM, especially when toggled alongside other interactive elements, adds unnecessary noise.
**Action:** Always add `aria-hidden="true"` to visual backdrop or overlay elements that serve no semantic purpose and are not meant to be navigated to via keyboard.

## 2024-05-24 - Custom Toggle Keyboard Accessibility

**Learning:** In this vanilla JavaScript codebase, custom interactive components (like switches or custom radio groups) often rely solely on `click` listeners. This leaves keyboard users (navigating via Tab) unable to interact with the controls using Space or Enter.
**Action:** When auditing or implementing custom UI components, explicitly bind `keydown` listeners for 'Space' and 'Enter' (with `e.preventDefault()`) to ensure complete keyboard accessibility, mirroring the logic of the `click` handlers.

## 2024-07-10 - Focus Indicators for Scrollable Regions

**Learning:** Adding `tabindex="0"` to scrollable regions (like `.weather-timeline`, `.privacy-modal-content`, and `.leaflet-control-weather`) correctly makes them accessible to keyboard users for scrolling, but without explicit `:focus-visible` styles, the focus ring disappears entirely when navigating to these areas, causing users to lose track of their position.
**Action:** When implementing custom scrollable regions with `tabindex="0"`, always explicitly define `:focus-visible` styles (e.g. an inset outline) to ensure keyboard users have visual confirmation of their focus state.

## 2024-05-24 - Theme Toggle Keyboard Accessibility

**Learning:** In vanilla JavaScript, custom theme toggle buttons (like those inside sidebars and mobile headers) that rely purely on `click` event listeners become inaccessible to keyboard users navigating via Tab, as they cannot trigger the action using Space or Enter.
**Action:** When auditing or implementing interactive toggle components, explicitly bind `keydown` listeners for 'Space' and 'Enter' (with `e.preventDefault()`) to ensure complete keyboard accessibility, mirroring the functionality of the `click` handlers.

## 2024-07-15 - Inline Spacing in Shrink-to-Fit Flex Items

**Learning:** Flex containers without explicit gaps or flexible base sizing can cause adjacent horizontal content blocks to collide in narrow widget views (such as map-based current weather widgets), reducing spacing between units (e.g. "km/h") and direction indicators (e.g. "NE") to 0px.
**Action:** Ensure inline-related elements have guaranteed physical spacing (such as `margin-left: var(--spacing-sm)`) rather than relying on `margin-left: auto` in container dimensions that shrink to fit.

## 2024-05-24 - Native Button Redundancy

**Learning:** Native HTML `<button>` elements automatically map 'Enter' and 'Space' keypresses to `click` events by default in browsers. Explicitly binding `keydown` listeners for these keys on standard `<button>` elements adds unnecessary overhead and redundancy.
**Action:** When implementing keyboard accessibility for interactive elements, only explicitly bind `keydown` listeners for 'Space' and 'Enter' if the element is a custom component (e.g., a `div` or `a` functioning as a button) and *not* a standard `<button>` element.

## 2024-05-24 - Menu Transition Layout Shifts

**Learning:** When replacing `display: none` with `visibility: hidden` to enable CSS transitions on UI components (like dropdown menus), ensure the element is absolutely positioned (`position: absolute` or `position: fixed`) so it doesn't disrupt document layout. `visibility: hidden` preserves the element's box in layout, but correctly removes it from the accessibility tree mimicking `display: none` for screen readers.
**Action:** When animating display states, prefer `opacity` and `visibility: hidden` with `position: absolute` over `display: none`.

## 2024-11-20 - Multi-Renderer CSS Targeting

**Learning:** When implementing custom UI controls that are compatible with both Leaflet and Mapbox GL JS (like `MapWeatherWidget`), the controls are wrapped in renderer-specific container classes. Writing CSS (like `:focus-visible` for accessibility) that targets only one of these classes (e.g., `.leaflet-control-weather`) will cause the style to fail when the other renderer (e.g., Mapbox) is active.
**Action:** Always ensure CSS styles explicitly target both renderer-specific container classes (e.g., `.leaflet-control-weather:focus-visible` and `.mapboxgl-ctrl-group:focus-visible`) to maintain consistent styling and accessibility across both map engines.

## 2024-12-07 - Dynamic Content Announcement

**Learning:** When content is injected dynamically via JavaScript (like the skeleton loader or the final forecast data in `forecastContent`), screen readers will not announce it unless the container is explicitly marked as a live region.
**Action:** Always add `aria-live="polite"` (or `assertive` for critical alerts) to containers that will receive dynamically injected content that users need to be aware of without explicit focus.
