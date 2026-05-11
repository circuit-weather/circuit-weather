## 2024-05-02 - Degree Symbol in HTML Replacement
**Learning:** When using `replace_with_git_merge_diff` to extract hardcoded strings in HTML containing special characters (like the degree symbol `°`), terminal output (like `cat`) might render them in a specific way that differs from the raw source code or how it appears in the browser. The `SEARCH` block must strictly match the characters exactly as they appear in the file.
**Action:** Always verify the exact character representation using a file reader or outputting a very tight `sed` or `head`/`tail` bound on the target lines before attempting a merge diff.
## 2024-05-11 - Error Toast Countdown String Extracted
**Learning:** Hardcoded short suffixes like `s` in `${remaining}s` bypass localization.
**Action:** Always extract single-character or very short suffixes, taking care to adapt appropriately for languages like Japanese ('秒') or Hungarian ('mp').
