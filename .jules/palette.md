## 2024-05-24 - Focus Management in Custom Selects
**Learning:** In custom select dropdowns (like the language menu), always focusing the first element upon opening forces keyboard users to navigate back through the list to reach their current selection. The active element should be the initial focus target.
**Action:** When implementing custom menus, always add focus management that targets the `.active` or `[aria-checked="true"]` item first, falling back to the first item if no active state is found.
