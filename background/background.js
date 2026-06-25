// =============================================================================
// SubTX — Background Service Worker
// Subtle Title eXtractor for Microsoft Edge (Manifest V3)
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Subtitle URL detection regex
// ---------------------------------------------------------------------------
const SUBTITLE_URL_REGEX = /\.(vtt|srt|ass|ssa|scc|dfxp|sbv|smi|sami|ttml|xml)(\?|$)|[/](caption|subtitle|timedtext|track)[/]|api\/timedtext|fmt=(vtt|srt|json3)|format=(vtt|srt)|\.m3u8(\?|$)|\.mpd(\?|$)/i;

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
// 3b. HLS/DASH Manifest parser — fire-and-forget
// ---------------------------------------------------------------------------
async function parseManifestForSubtitles(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn('[SubTX] Manifest fetch failed:', response.status, url);
      return;
    }

    const text = await response.text();
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    if (url.match(/\.m3u8/i)) {
      // HLS manifest — extract EXT-X-MEDIA with TYPE=SUBTITLES
      const subtitleRegex = /#EXT-X-MEDIA:TYPE=SUBTITLES[^]*?URI="([^"]+)"/gi;
      let match;
      while ((match = subtitleRegex.exec(text)) !== null) {
        let uri = match[1];
        // Resolve relative URIs
        if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
          uri = new URL(uri, baseUrl).href;
        }
        addDetectedSubtitle({
          url: uri,
          language: extractLanguageFromUrl(uri) || 'Unknown',
          format: 'vtt',
          timestamp: Date.now(),
          tabId: -1,
          confidence: 0.6,
          source: 'hls-manifest'
        });
      }
    } else if (url.match(/\.mpd/i)) {
      // DASH manifest — parse XML for text AdaptationSets
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');

      const adaptationSets = xmlDoc.querySelectorAll('AdaptationSet');
      for (const set of adaptationSets) {
        const mimeType = set.getAttribute('mimeType') || '';
        if (!mimeType.startsWith('text/')) continue;

        const baseUrls = set.querySelectorAll('BaseURL');
        for (const baseUrlEl of baseUrls) {
          let uri = baseUrlEl.textContent || '';
          if (!uri) continue;
          // Resolve relative URIs
          if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
            uri = new URL(uri, baseUrl).href;
          }
          addDetectedSubtitle({
            url: uri,
            language: extractLanguageFromUrl(uri) || 'Unknown',
            format: 'vtt',
            timestamp: Date.now(),
            tabId: -1,
            confidence: 0.6,
            source: 'dash-manifest'
          });
        }
      }

      // Fallback: also check for Representation elements with text mime type
      const representations = xmlDoc.querySelectorAll('Representation');
      for (const rep of representations) {
        const repMime = rep.getAttribute('mimeType') || '';
        if (!repMime.startsWith('text/')) continue;
        const baseUrls = rep.querySelectorAll('BaseURL');
        for (const baseUrlEl of baseUrls) {
          let uri = baseUrlEl.textContent || '';
          if (!uri) continue;
          if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
            uri = new URL(uri, baseUrl).href;
          }
          addDetectedSubtitle({
            url: uri,
            language: extractLanguageFromUrl(uri) || 'Unknown',
            format: 'vtt',
            timestamp: Date.now(),
            tabId: -1,
            confidence: 0.6,
            source: 'dash-manifest'
          });
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[SubTX] Manifest fetch timed out:', url);
    } else {
      console.warn('[SubTX] Manifest parse error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. webRequest listener — NON-BLOCKING, passive observe
// ---------------------------------------------------------------------------
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (SUBTITLE_URL_REGEX.test(details.url)) {
      // Determine format from URL
      let format = 'vtt';
      let confidence;

      // YouTube timedtext detection
      if (/api\/timedtext/i.test(details.url)) {
        format = 'vtt';
        confidence = 0.7;
      }

      // Check query parameters for explicit format
      try {
        const parsed = new URL(details.url);
        const fmtParam = parsed.searchParams.get('fmt');
        const formatParam = parsed.searchParams.get('format');
        if (fmtParam && ['vtt', 'srt', 'json3'].includes(fmtParam)) {
          format = fmtParam;
        } else if (formatParam && ['vtt', 'srt'].includes(formatParam)) {
          format = formatParam;
        }
      } catch {
        // Malformed URL — fall through to extension-based detection
      }

      // Extension-based format fallback (if not already determined by params)
      if (!confidence) {
        const extMatch = details.url.match(/\.(\w+)(\?|$)/);
        if (extMatch && ['vtt', 'srt', 'ass', 'ssa', 'scc', 'dfxp', 'sbv', 'smi', 'sami', 'ttml', 'xml'].includes(extMatch[1])) {
          format = extMatch[1];
        }
      }

      const subtitle = {
        url: details.url,
        language: extractLanguageFromUrl(details.url) || 'Unknown',
        format: format,
        timestamp: Date.now(),
        tabId: details.tabId
      };

      // If confidence was set (e.g. YouTube timedtext), attach it
      if (confidence) {
        subtitle.confidence = confidence;
      }

      addDetectedSubtitle(subtitle);

      // Fire-and-forget manifest parsing for HLS/DASH manifests
      if (details.url.match(/\.m3u8(\?|$)/i)) {
        subtitle.source = 'hls-manifest';
        parseManifestForSubtitles(details.url);
      } else if (details.url.match(/\.mpd(\?|$)/i)) {
        subtitle.source = 'dash-manifest';
        parseManifestForSubtitles(details.url);
      }
    }
  },
  { urls: ['<all_urls>'], types: ['other', 'xmlhttprequest', 'media', 'script'] }

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
      // MERGE: combine with existing items instead of overwriting
      chrome.storage.session.get('detectedSubtitles', (existing) => {
        let list = existing.detectedSubtitles || [];
        const incoming = request.subtitles || [];

        // Prepend incoming items
        for (const item of incoming) {
          // Deduplicate by URL
          if (!list.some(existingItem => existingItem.url === item.url)) {
            list.unshift(item);
          }
        }

        // Cap at 100
        if (list.length > 100) {
          list = list.slice(0, 100);
        }

        chrome.storage.session.set({ detectedSubtitles: list }, () => {
          sendResponse({ success: true, count: incoming.length });
        });
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
