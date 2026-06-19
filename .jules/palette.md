## 2024-05-24 - Focus Management in Custom Selects
**Learning:** In custom select dropdowns (like the language menu), always focusing the first element upon opening forces keyboard users to navigate back through the list to reach their current selection. The active element should be the initial focus target.
**Action:** When implementing custom menus, always add focus management that targets the `.active` or `[aria-checked="true"]` item first, falling back to the first item if no active state is found.
## 2024-05-24 - Screen Reader Ghost Elements
**Learning:** Purely visual overlay elements (like full-screen backdrops used to close sidebars on mobile) can be announced by screen readers as empty, interactive regions if not explicitly hidden. Even if they are just empty `div`s, their presence in the DOM, especially when toggled alongside other interactive elements, adds unnecessary noise.
**Action:** Always add `aria-hidden="true"` to visual backdrop or overlay elements that serve no semantic purpose and are not meant to be navigated to via keyboard.
