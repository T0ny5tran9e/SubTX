# PROJECT KNOWLEDGE BASE - background/

**Generated:** 2026-01-06
**Directory:** background/
**Purpose:** Service worker for network monitoring and subtitle processing

## OVERVIEW
Background service worker that monitors network requests, detects subtitle URLs, verifies content, and manages storage.

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| Network monitoring | background.js | webRequest API listeners |
| Subtitle detection | background.js | URL pattern matching and validation |
| Content verification | background.js | HTTP fetch and format detection |
| Language detection | background.js | Franc library integration and custom regex |
| Storage management | background.js | Chrome storage API with locking mechanisms |
| Format detection | background.js | VTT/SRT/ASS/TXT format identification |

## CONVENTIONS
- Service worker context (no DOM access)
- Asynchronous operations with proper error handling
- Storage locking to prevent race conditions
- Retry mechanisms for network requests
- Content-based validation before storing subtitles
- Efficient memory usage for long-running service worker

## ANTI-PATTERNS
- No synchronous XHR (use fetch with async/await)
- No direct DOM manipulation (no access in service worker)
- No blocking operations in event listeners
- No storing large content in memory
- No duplicate processing of the same URL