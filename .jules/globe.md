## 2024-05-02 - Degree Symbol in HTML Replacement
**Learning:** When using `replace_with_git_merge_diff` to extract hardcoded strings in HTML containing special characters (like the degree symbol `°`), terminal output (like `cat`) might render them in a specific way that differs from the raw source code or how it appears in the browser. The `SEARCH` block must strictly match the characters exactly as they appear in the file.
**Action:** Always verify the exact character representation using a file reader or outputting a very tight `sed` or `head`/`tail` bound on the target lines before attempting a merge diff.
## 2024-05-11 - Error Toast Countdown String Extracted
**Learning:** Hardcoded short suffixes like `s` in `${remaining}s` bypass localization.
**Action:** Always extract single-character or very short suffixes, taking care to adapt appropriately for languages like Japanese ('秒') or Hungarian ('mp').
## 2024-05-19 - Hardcoded Suffix Logic Causes Pluralization Bugs
**Learning:** Using an English-centric hardcoded suffix placeholder like `{{suffix}}` (e.g. `suffix: count > 1 ? 's' : ''`) for pluralization causes severe grammatical errors in target languages. For example, German requires "Kacheln" instead of "Kachels", and Italian requires "riuscite" instead of "riuscitass".
**Action:** Never use string concatenation or single-character suffix injections to handle plurals. Always create explicit singular and plural translation keys (e.g., `retryingFailedTiles` and `retryingFailedTilesPlural`) in the base dictionary and duplicate them in languages without plural forms if necessary.
## 2024-05-24 - Dynamic Unit Suffixes over Hardcoded Symbols
**Learning:** Do not hardcode unit symbols like the degree symbol (`°`) in the UI components (like the hourly weather timeline). The API response provides proper dynamic localized and unit-aware strings (e.g., `weather.units.temperature_2m`).
**Action:** Always prefer the dynamic API-provided unit string variables over injecting explicit unit characters to respect user preference and locale correctly.
