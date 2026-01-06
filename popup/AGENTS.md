# PROJECT KNOWLEDGE BASE - popup/

**Generated:** 2026-01-06
**Directory:** popup/
**Purpose:** Terminal-style UI interface

## OVERVIEW
WebTUI terminal interface for subtitle management with bulk operations and downloads.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| UI rendering | popup.js | displaySubtitles(), DOM manipulation |
| Event handling | popup.js | Checkbox events, button clicks |
| Download logic | popup.js | downloadSubtitle(), format conversion |
| State management | popup.js | currentSubtitles, selectedSubtitles |
| Styling | popup.css | Terminal theme, WebTUI components |
| HTML structure | popup.html | Panel layout, form elements |
| Conversion logic | subtitle-converter.js | Dedicated subtitle conversion module |

## CONVENTIONS
- DOM-safe text insertion (no innerHTML injection)
- Event delegation for dynamic elements
- Async download with timeout handling
- Checkbox state synchronization
- Use dedicated subtitle-converter.js module for conversions

## ANTI-PATTERNS
- No direct DOM manipulation without sanitization
- No synchronous operations in UI thread
- No duplicate conversion functions (use subtitle-converter.js)