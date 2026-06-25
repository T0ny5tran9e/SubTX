// SubTX Content Script — Isolated World
// Handles MAIN-world injection, postMessage relay, DOM <track> scanning,
// HLS.js detection, and relaying results to background script.

const DEBUG_MODE = false;

function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log('[SubTX]', ...args);
  }
}

function errorLog(...args) {
  console.error('[SubTX]', ...args);
}

debugLog('Content script loaded on:', window.location.hostname);

let detectedSubtitles = [];

// ═══════════════════════════════════════════
// MAIN-world injection
// ═══════════════════════════════════════════

(function injectMainWorldScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/injected.js');
  script.onload = function () {
    debugLog('Injected script loaded and removed');
    this.remove();
  };
  script.onerror = function () {
    errorLog('Failed to load injected script');
    this.remove();
  };
  document.documentElement.appendChild(script);
})();

// ═══════════════════════════════════════════
// postMessage listener (from injected.js MAIN world)
// ═══════════════════════════════════════════

window.addEventListener('message', function (event) {
  if (event.source !== window) return;

  const data = event.data;
  if (!data || typeof data !== 'object' || !data.type) return;

  debugLog('postMessage received:', data.type);

  switch (data.type) {
    case 'SUBTX_SUBTITLE_DETECTED': {
      const { url, body, contentType } = data;
      if (!url) return;
      const format = detectFormat(url, body, contentType);
      const language = extractLanguageFromUrl(url);
      addSubtitle({
        url: url,
        format: format,
        language: language,
        source: 'xhr-intercept',
        confidence: 0.85,
      });
      break;
    }

    case 'SUBTX_YOUTUBE_TRACKS': {
      const tracks = data.tracks;
      if (!Array.isArray(tracks)) return;
      for (const track of tracks) {
        if (!track || !track.url) continue;
        addSubtitle({
          url: track.url,
          format: 'vtt',
          language: track.language || track.label || track.srclang || 'Unknown',
          source: 'youtube-api',
          confidence: 0.9,
        });
      }
      break;
    }

    case 'SUBTX_JWPLAYER_TRACKS': {
      const jwTracks = data.tracks;
      if (!Array.isArray(jwTracks)) return;
      for (const track of jwTracks) {
        if (!track || !track.file) continue;
        addSubtitle({
          url: track.file,
          format: 'vtt',
          language: track.label || 'Unknown',
          source: 'jwplayer-api',
          confidence: 0.85,
        });
      }
      break;
    }
  }
});

// ═══════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════

/**
 * Attempt to extract a human-readable language string from a subtitle URL.
 * Checks query parameters, path segments, and filename conventions.
 */
function extractLanguageFromUrl(urlStr) {
  try {
    const url = new URL(urlStr);

    // Check common query parameters
    const langParam =
      url.searchParams.get('lang') ||
      url.searchParams.get('language') ||
      url.searchParams.get('hl') ||
      url.searchParams.get('locale');
    if (langParam) return langParam;

    // Check path segments for 2-letter language codes
    const segments = url.pathname.split('/').filter(Boolean);
    for (const seg of segments) {
      if (/^[a-z]{2}$/.test(seg)) return seg;
    }

    // Check filename prefix like ".en.vtt", ".fr.srt", "_en.vtt"
    const filename = url.pathname.split('/').pop() || '';
    const match = filename.match(/[._]([a-z]{2,3})(?:\.[a-z0-9]+)?$/i);
    if (match) return match[1].toLowerCase();
  } catch {
    // Invalid URL — silently ignore
  }
  return 'Unknown';
}

/**
 * Determine subtitle format from URL extension and/or content body.
 * Returns one of: 'vtt', 'srt', 'ass', 'ssa', 'ttml', 'dfxp', 'smi', 'txt', 'vtt'
 */
function detectFormat(urlStr, body, contentType) {
  // 1. Check URL extension
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname.toLowerCase();
    if (pathname.endsWith('.vtt')) return 'vtt';
    if (pathname.endsWith('.srt')) return 'srt';
    if (pathname.endsWith('.ass')) return 'ass';
    if (pathname.endsWith('.ssa')) return 'ssa';
    if (pathname.endsWith('.ttml') || pathname.endsWith('.ttml2')) return 'ttml';
    if (pathname.endsWith('.dfxp')) return 'dfxp';
    if (pathname.endsWith('.smi') || pathname.endsWith('.sami')) return 'smi';
  } catch {
    // fall through to body/content-type checks
  }

  // 2. Check Content-Type header
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes('text/vtt')) return 'vtt';
    if (ct.includes('application/x-subrip')) return 'srt';
    if (ct.includes('application/ttml+xml')) return 'ttml';
    if (ct.includes('text/srt')) return 'srt';
  }

  // 3. Inspect body content
  if (body && typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.startsWith('WEBVTT')) return 'vtt';
    if (/^\d+\s*\n\d{2}:\d{2}:\d{2}/.test(trimmed)) return 'srt';
    if (/^<\?xml.*<\s?tt\s/i.test(trimmed) || /^[\s\S]*?<\s?tt\s/i.test(trimmed)) return 'ttml';
    if (/^[\s\S]*?<SAMI/i.test(trimmed)) return 'smi';
    if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(trimmed)) return 'srt';
  }

  // 4. Default fallback
  return 'vtt';
}

/**
 * Normalize, deduplicate, store, and relay a subtitle entry.
 * Duplicates are checked against the local URL store.
 * Early send failures (before SW activation) are silently suppressed.
 */
function addSubtitle(sub) {
  const entry = {
    url: sub.url,
    language: sub.language || 'Unknown',
    format: sub.format || 'vtt',
    source: sub.source || 'unknown',
    confidence: sub.confidence || 0.5,
  };

  // Deduplicate against local store
  if (detectedSubtitles.some(function (existing) {
    return existing.url === entry.url;
  })) {
    debugLog('Duplicate subtitle skipped:', entry.url);
    return;
  }

  detectedSubtitles.push(entry);

  debugLog('Subtitle added:', entry.url, entry.language, entry.format);

  // Relay to background — suppress SW-not-ready errors from early sends
  chrome.runtime.sendMessage({
    action: 'contentScriptSubtitles',
    subtitles: [entry],
  }).catch(function () {
    // Service worker may not be ready yet; this is harmless
  });
}

// ═══════════════════════════════════════════
// DOM <track> element scanning
// ═══════════════════════════════════════════

function scanVideoTrackElements() {
  const trackElements = document.querySelectorAll(
    'video track[kind="subtitles"], video track[kind="captions"]'
  );

  for (let i = 0; i < trackElements.length; i++) {
    const track = trackElements[i];
    const src = track.getAttribute('src');
    if (!src) continue;

    const srclang = track.getAttribute('srclang') || '';
    const label = track.getAttribute('label') || srclang || 'Unknown';

    addSubtitle({
      url: src,
      format: detectFormat(src),
      language: label,
      source: 'html5-track',
      confidence: 0.9,
    });
  }
}

// ═══════════════════════════════════════════
// HLS.js subtitle scanning
// ═══════════════════════════════════════════

function scanHLSjs() {
  // HLS.js instances may be stored under various window property names.
  // Check common patterns:
  var hlsInstances = [];

  if (window.hls && typeof window.hls.subtitleTracks !== 'undefined') {
    hlsInstances.push(window.hls);
  }
  if (window.hlsInstance && typeof window.hlsInstance.subtitleTracks !== 'undefined') {
    hlsInstances.push(window.hlsInstance);
  }
  if (window.hlsPlayer && typeof window.hlsPlayer.subtitleTracks !== 'undefined') {
    hlsInstances.push(window.hlsPlayer);
  }
  if (window.hlsjs && typeof window.hlsjs.subtitleTracks !== 'undefined') {
    hlsInstances.push(window.hlsjs);
  }

  for (var i = 0; i < hlsInstances.length; i++) {
    var hls = hlsInstances[i];
    var tracks = hls.subtitleTracks;
    if (!Array.isArray(tracks)) continue;

    for (var j = 0; j < tracks.length; j++) {
      var track = tracks[j];
      var trackUrl =
        track.url ||
        (typeof track === 'string' ? track : null);
      if (!trackUrl) continue;

      addSubtitle({
        url: trackUrl,
        format: 'vtt',
        language: track.name || track.lang || track.label || track.language || 'Track ' + (j + 1),
        source: 'hlsjs-api',
        confidence: 0.8,
      });
    }
  }
}

// ═══════════════════════════════════════════
// Orchestrator — runs all available detection tiers
// ═══════════════════════════════════════════

function detectAllSubtitles() {
  debugLog('Running full subtitle detection');

  scanVideoTrackElements();
  scanHLSjs();

  debugLog('Detection complete, total subtitles:', detectedSubtitles.length);
}

// ═══════════════════════════════════════════
// chrome.runtime.onMessage handler
// ═══════════════════════════════════════════

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // Validate message structure
  if (!request || typeof request !== 'object') {
    return true;
  }

  // Validate sender identity
  if (sender.id !== chrome.runtime.id) {
    return true;
  }

  if (request.action === 'getSubtitles') {
    sendResponse({ subtitles: detectedSubtitles });
    return true;
  }

  return true; // Keep channel open for async response
});

// ═══════════════════════════════════════════
// MutationObserver — watch for <video>/<track> additions
// ═══════════════════════════════════════════

var subtitleObserver = null;

function setupMutationObserver() {
  if (!document.body) {
    // Body not available yet at document_start — defer to DOMContentLoaded
    debugLog('Body not available, deferring MutationObserver');
    return;
  }

  if (subtitleObserver) {
    subtitleObserver.disconnect();
  }

  subtitleObserver = new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var mutation = mutations[m];
      var nodes = mutation.addedNodes;
      if (!nodes) continue;

      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        if (node.nodeType !== 1) continue;
        var el = node;
        if (
          el.tagName === 'VIDEO' ||
          el.tagName === 'TRACK' ||
          (el.querySelector && el.querySelector('video, track'))
        ) {
          debugLog('Video/track mutation detected — re-scanning subtitles');
          detectAllSubtitles();
          break;
        }
      }
    }
  });

  subtitleObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  debugLog('MutationObserver active on document.body');
}

// ═══════════════════════════════════════════
// Periodic re-scan for SPA navigation
// ═══════════════════════════════════════════

var scanInterval = null;

function startPeriodicScan() {
  if (scanInterval) {
    clearInterval(scanInterval);
  }
  scanInterval = setInterval(function () {
    detectAllSubtitles();
  }, 5000);
  debugLog('Periodic scan started (5s interval)');
}

// ═══════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════

// If body already exists, set up immediately.
// Otherwise wait for DOMContentLoaded (document_start means <html> exists but not <body>).
if (document.body) {
  setupMutationObserver();
  startPeriodicScan();
} else {
  document.addEventListener('DOMContentLoaded', function () {
    setupMutationObserver();
    startPeriodicScan();
  });
}

// Final scan when page fully loads (catches late-loading <track> and HLS.js init)
window.addEventListener('load', function () {
  debugLog('Page fully loaded — final subtitle scan');
  detectAllSubtitles();
});

// Cleanup on page unload
window.addEventListener('beforeunload', function () {
  if (subtitleObserver) {
    subtitleObserver.disconnect();
    subtitleObserver = null;
  }
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  debugLog('Content script tore down');
});
