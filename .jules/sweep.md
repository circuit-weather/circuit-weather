# Sweep Journal

This file tracks critical learnings from Sweep's cleanup operations.

## 2024-05-24 - Duplicate Keyframes in CSS
**Learning:** I discovered that `@keyframes` rules can be duplicated in CSS files without causing syntax errors, which can lead to confusing behavior and code rot. In this case, `radar-status-pulse` was defined twice with conflicting values.
**Action:** When auditing CSS, always search for duplicate definitions of classes and keyframes. Use `grep` to find all occurrences before assuming a block is unique.
