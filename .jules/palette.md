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
