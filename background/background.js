// =============================================================================
// SubTX — Background Service Worker
// Subtle Title eXtractor for Microsoft Edge (Manifest V3)
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Subtitle URL detection regex
// ---------------------------------------------------------------------------
const SUBTITLE_URL_REGEX = /\.(vtt|srt|ass|scc|dfxp)(\?|$)|[/](caption|subtitle|timedtext|track)[/]/i;

// ---------------------------------------------------------------------------
// 2. Extract language from URL helper
// ---------------------------------------------------------------------------
function extractLanguageFromUrl(url) {
  try {
    const parsed = new URL(url);

    // Check query parameters
    const langParam = parsed.searchParams.get('lang') ||
                      parsed.searchParams.get('language') ||
                      parsed.searchParams.get('hl') ||
                      parsed.searchParams.get('locale');
    if (langParam) return langParam;

    // Check path segments for known language codes (2-letter ISO)
    const segments = parsed.pathname.split('/').filter(Boolean);
    for (const seg of segments) {
      if (/^[a-z]{2}$/.test(seg) && !/^(www|api|cdn|static|v[0-9])$/.test(seg)) {
        // Heuristic: short path segment that looks like a language code
        return seg;
      }
    }

    // Check filename before extension for language codes like .en.vtt
    const filename = parsed.pathname.split('/').pop() || '';
    const match = filename.match(/[._-]([a-z]{2})(?:\.[a-z0-9]+)?$/i);
    if (match) return match[1].toLowerCase();
  } catch {
    // Invalid URL — fall through
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3. Storage helper — add to queue, cap at 100, deduplicate by URL
// ---------------------------------------------------------------------------
async function addDetectedSubtitle(subtitle) {
  try {
    const result = await chrome.storage.session.get('detectedSubtitles');
    let list = result.detectedSubtitles || [];

    // Deduplicate by URL
    if (list.some(item => item.url === subtitle.url)) return;

    // Prepend newest first
    list.unshift(subtitle);

    // FIFO cap at 100 (remove oldest = last items)
    if (list.length > 100) {
      list = list.slice(0, 100);
    }

    await chrome.storage.session.set({ detectedSubtitles: list });
  } catch (err) {
    console.error('[SubTX] Failed to store subtitle:', err);
  }
}

// ---------------------------------------------------------------------------
// 4. webRequest listener — NON-BLOCKING, passive observe
// ---------------------------------------------------------------------------
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (SUBTITLE_URL_REGEX.test(details.url)) {
      const subtitle = {
        url: details.url,
        language: extractLanguageFromUrl(details.url) || 'Unknown',
        format: details.url.match(/\.(\w+)(\?|$)/)?.[1] || 'vtt',
        timestamp: Date.now(),
        tabId: details.tabId
      };
      addDetectedSubtitle(subtitle);
    }
  },
  { urls: ['<all_urls>'], types: ['other', 'xmlhttprequest', 'media'] }

);

// ---------------------------------------------------------------------------
// 5. runtime.onMessage handler with sender validation
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // SENDER VALIDATION: reject messages from unknown extensions / web pages
  if (sender.id !== chrome.runtime.id) {
    console.warn('[SubTX] Ignoring message from unknown sender:', sender.id);
    return false;
  }

  switch (request.action) {
    case 'getDetectedSubtitles': {
      chrome.storage.session.get('detectedSubtitles', (data) => {
        sendResponse(data.detectedSubtitles || []);
      });
      return true; // Keep channel open for async response
    }

    case 'clearDetectedSubtitles': {
      chrome.storage.session.remove('detectedSubtitles', () => {
        sendResponse({ success: true });
      });
      return true;
    }

    case 'contentScriptSubtitles':
    case 'subtitlesFound': {
      // RELAY: store subtitles from content script (preserve existing behavior)
      chrome.storage.session.set({ detectedSubtitles: request.subtitles }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    default: {
      sendResponse({ error: 'Unknown action' });
      return false;
    }
  }
});

// ---------------------------------------------------------------------------
// 6. onInstalled listener
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[SubTX] Extension installed/updated:', details.reason);
});

// ---------------------------------------------------------------------------
// 7. Set storage access level for popup compatibility
// ---------------------------------------------------------------------------
chrome.storage.session.setAccessLevel({
  accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
});
