# PROJECT KNOWLEDGE BASE - content/

**Generated:** 2026-01-06
**Directory:** content/
**Purpose:** Content script for fallback subtitle detection

## OVERVIEW
Content script that injects into web pages to detect subtitles when network monitoring is insufficient.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Platform detection | content.js | YouTube, Vimeo, JW Player detection |
| Fallback detection | content.js | Video element and text track scanning |
| Embedded player support | content.js | iframe and shadow DOM handling |
| Message passing | content.js | Communication with background script |

## CONVENTIONS
- Content script context (limited access to page elements)
- Platform-specific detection logic
- Safe injection techniques for cross-origin frames
- Message passing for communication with background
- Minimal DOM manipulation for performance

## ANTI-PATTERNS
- No direct access to cross-origin iframes
- No modification of page content
- No heavy DOM querying that impacts page performance
- No synchronous operations that block page loading