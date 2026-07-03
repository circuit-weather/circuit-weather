## 2024-05-24 - Focus Management in Custom Selects
**Learning:** In custom select dropdowns (like the language menu), always focusing the first element upon opening forces keyboard users to navigate back through the list to reach their current selection. The active element should be the initial focus target.
**Action:** When implementing custom menus, always add focus management that targets the `.active` or `[aria-checked="true"]` item first, falling back to the first item if no active state is found.
## 2024-05-24 - Screen Reader Ghost Elements
**Learning:** Purely visual overlay elements (like full-screen backdrops used to close sidebars on mobile) can be announced by screen readers as empty, interactive regions if not explicitly hidden. Even if they are just empty `div`s, their presence in the DOM, especially when toggled alongside other interactive elements, adds unnecessary noise.
**Action:** Always add `aria-hidden="true"` to visual backdrop or overlay elements that serve no semantic purpose and are not meant to be navigated to via keyboard.
## 2024-05-24 - Custom Toggle Keyboard Accessibility
**Learning:** In this vanilla JavaScript codebase, custom interactive components (like switches or custom radio groups) often rely solely on `click` listeners. This leaves keyboard users (navigating via Tab) unable to interact with the controls using Space or Enter.
**Action:** When auditing or implementing custom UI components, explicitly bind `keydown` listeners for 'Space' and 'Enter' (with `e.preventDefault()`) to ensure complete keyboard accessibility, mirroring the logic of the `click` handlers.
