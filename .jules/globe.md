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
## 2024-06-06 - Extracting Hardcoded Concatenations
**Learning:** Hardcoded strings in UI components often disguise themselves as simple concatenations (e.g. `` `R${race.round}: ${race.name} (${dateStr})` ``). When extracting these, it's crucial to map the raw JavaScript variable names to proper i18n placeholders (like `{{round}}`) to ensure correct interpolation across locales.
**Action:** Always replace string template literals containing UI text with `i18n.t()` calls passing a context object that maps the local variables to the placeholder keys defined in the dictionary.
## 2024-10-25 - Brazilian Portuguese Dialect Preferences
**Learning:** The `pt-BR` locale initially contained European Portuguese (pt-PT) terms. For browser tabs, Brazilian Portuguese strictly uses "aba" instead of the European "separador". The word for a network connection is "conexão", not "ligação" (which means a phone call in Brazil).
**Action:** Always use "aba" for tabs and "conexão" for network connections to ensure Brazilian terminology is maintained over European equivalents.
