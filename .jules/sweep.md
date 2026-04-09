# Sweep Journal

This file tracks critical learnings from Sweep's cleanup operations.

## 2024-05-24 - Duplicate Keyframes in CSS

**Learning:** I discovered that `@keyframes` rules can be duplicated in CSS files without causing syntax errors, which can lead to confusing behavior and code rot. In this case, `radar-status-pulse` was defined twice with conflicting values.
**Action:** When auditing CSS, always search for duplicate definitions of classes and keyframes. Use `grep` to find all occurrences before assuming a block is unique.

## 2024-05-24 - Verification Scripts Policy

**Learning:** The project's `AGENTS.md` strictly dictates a "Test & Verification File Policy," preventing the use of long-lived one-off test scripts and debug artifacts (such as screenshots for verification).
**Action:** When working as Sweep, continuously audit the root of the project to remove any Python/Playwright verification scripts or screenshots left over by other agents to enforce this policy.
\n## 2026-04-09 - False Positives for Root HTML Script Tags\n**Learning:** Analyzers like `knip` might flag essential scripts such as `public/src/main.js`, `public/sw.js`, or `public/theme.js` as "unused" because they are dynamically imported or loaded directly in HTML files, not via standard JS ES module imports.\n**Action:** Before removing any file flagged as unused, always run a global text search across HTML files to verify it's truly unreferenced.
