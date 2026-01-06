# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-06
**Project:** SubTX Edge Extension
**Status:** Recently optimized codebase

## OVERVIEW
Microsoft Edge extension for extracting subtitles from streaming platforms via network request monitoring. Built with Manifest V3, vanilla JS. Supports YouTube, Vimeo, JW Player, OneStream, and embedded players. Features IDM-like link capture with format conversion and bulk operations.

## STRUCTURE
```
SubTX/
├── manifest.json      # Extension config (Manifest V3)
├── popup/             # UI interface (HTML/CSS/JS)
├── content/           # Page injection script
├── background/        # Service worker
├── tests/             # Playwright tests
└── node_modules/      # Dependencies
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| UI changes | popup/popup.js | DOM manipulation, downloads, copy functions |
| Subtitle detection | content/content.js | Platform-specific logic |
| Network monitoring | background/background.js | webRequest API & subtitle capture |
| Extension setup | manifest.json | Permissions, scripts |
| Testing | tests/extension.test.js | Playwright tests |
| Styling | popup/popup.css | Terminal theme |
| Subtitle conversion | popup/subtitle-converter.js | Dedicated conversion module |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `detectLanguageFromContent` | Function | background/background.js | Advanced language detection with franc + regex fallback |
| `verifySubtitleContent` | Function | background/background.js | Content verification via HTTP fetch |
| `isSubtitleUrl` | Function | background/background.js | URL pattern matching |
| `displaySubtitles` | Function | popup/popup.js | UI rendering with checkboxes |
| `downloadSubtitle` | Function | popup/popup.js | Individual subtitle download |
| `convertSubtitleFormat` | Function | popup/subtitle-converter.js | Format conversion logic |

## CONVENTIONS
- Manifest V3: Service worker instead of background page
- Async/await: For all async operations
- Chrome APIs: tabs, downloads, storage, webRequest
- Error handling: Try/catch with user feedback
- Recent cleanup: Removed duplicate code, optimized structure

## ANTI-PATTERNS (THIS PROJECT)
- No synchronous XHR (use fetch)
- No eval() or new Function()
- No insecure CSP bypasses
- No duplicate conversion functions (use subtitle-converter.js)

## UNIQUE STYLES
- Terminal UI: Courier font, dark theme
- Color scheme: Mirage blue background, lime green accents
- Single popup: No persistent UI
- WebTUI design system: Authentic terminal experience

## COMMANDS
```bash
bun test              # Run Playwright tests
bun run test:headed   # Run tests with browser UI
```

## NOTES
- Cross-origin iframes block access to embedded players
- Subtitle URLs may require CORS handling
- webRequest API monitors subtitle requests with filtering
- Bulk copy and individual link copy features available
- Storage queuing prevents subtitle loss during rapid detections
- Recent cleanup: ~400KB reduction, duplicate functions removed