// =============================================================================
// SubTX — MAIN-World injected script
// Intercepts fetch/XHR to detect subtitle URLs and bridges to content script
// via window.postMessage(). Runs in page context — NO chrome.* APIs available.
// =============================================================================
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Guard — prevent double injection
  // ---------------------------------------------------------------------------
  if (window.__subtxInjected) return;
  try { Object.defineProperty(window, '__subtxInjected', { value: true, writable: false, configurable: false }); } catch (e) { /* ignore */ }

  // ---------------------------------------------------------------------------
  // 2. Constants
  // ---------------------------------------------------------------------------
  var SUBTITLE_URL_REGEX = /\.(vtt|srt|ass|ssa|sbv|smi|sami|scc|dfxp|ttml|xml)(\?|$)|[/](caption|subtitle|timedtext|track)[/]|fmt=vtt|fmt=srt|fmt=json3/i;

  var MAX_BODY_SIZE = 50 * 1024; // 50 KB cap for response bodies

  var MSG_TYPES = {
    SUBTITLE:    'SUBTX_SUBTITLE_DETECTED',
    YT_TRACKS:   'SUBTX_YOUTUBE_TRACKS',
    JW_TRACKS:   'SUBTX_JWPLAYER_TRACKS'
  };

  // ---------------------------------------------------------------------------
  // 3. Helper — postMessage bridge to content script
  // ---------------------------------------------------------------------------
  function postToContent(data) {
    try {
      // Add source marker so content.js can verify origin
      data._source = 'subtx-injected';
      window.postMessage(data, '*');
    } catch (_) { /* silent */ }
  }

  // ---------------------------------------------------------------------------
  // 4. Helper — check if URL matches subtitle pattern
  // ---------------------------------------------------------------------------
  function isSubtitleUrl(url) {
    if (typeof url !== 'string') return false;
    if (url.startsWith('data:') || url.startsWith('blob:')) return false;
    return SUBTITLE_URL_REGEX.test(url);
  }

  // ---------------------------------------------------------------------------
  // 5. window.fetch() override
  // ---------------------------------------------------------------------------
  function installFetchOverride() {
    if (window.__subtxFetchPatched) return;
    try {
      var originalFetch = window.fetch;

      window.fetch = function subtxFetch(input, init) {
        // Resolve request URL
        var requestUrl = '';
        try {
          if (typeof input === 'string') {
            requestUrl = input;
          } else if (input instanceof Request) {
            requestUrl = input.url;
          } else if (input && typeof input === 'object' && input.url) {
            requestUrl = input.url;
          }
        } catch (_) { /* ignore param inspection */ }

        // Forward to original fetch immediately — do NOT block
        var fetchPromise = originalFetch.call(window, input, init);

        // If URL matches, inspect the response asynchronously
        if (requestUrl && isSubtitleUrl(requestUrl)) {
          fetchPromise = fetchPromise.then(function (response) {
            // Clone so we don't consume the original body
            var cloned = response.clone();
            var contentType = cloned.headers ? (cloned.headers.get('content-type') || '') : '';

            cloned.text().then(function (body) {
              // Cap at 50 KB
              if (body.length > MAX_BODY_SIZE) {
                body = body.substring(0, MAX_BODY_SIZE);
              }
              postToContent({
                type: MSG_TYPES.SUBTITLE,
                url: requestUrl,
                body: body,
                contentType: contentType
              });
            }).catch(function () {
              // Response body could not be read — silently ignore
            });

            return response;
          }).catch(function () {
            // Original fetch failed — nothing we can do
            return originalFetch.call(window, input, init);
          });
        }

        return fetchPromise;
      };

      Object.defineProperty(window, '__subtxFetchPatched', { value: true, writable: false, configurable: false });
    } catch (_) { /* fetch override failed — page may be preventing redefinition */ }
  }

  // ---------------------------------------------------------------------------
  // 6. XMLHttpRequest override
  // ---------------------------------------------------------------------------
  function installXhrOverride() {
    if (window.__subtxXhrPatched) return;
    try {
      var origOpen  = XMLHttpRequest.prototype.open;
      var origSend  = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function subtxOpen(method, url) {
        // Store URL for later use in send()
        this.__subtxUrl = typeof url === 'string' ? url : (url ? String(url) : '');
        return origOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function subtxSend(body) {
        var xhr = this;
        var url = xhr.__subtxUrl || '';

        if (url && isSubtitleUrl(url)) {
          xhr.addEventListener('load', function subtxOnLoad() {
            try {
              var responseText = xhr.responseText;
              if (responseText && responseText.length > 0) {
                if (responseText.length > MAX_BODY_SIZE) {
                  responseText = responseText.substring(0, MAX_BODY_SIZE);
                }
                postToContent({
                  type: MSG_TYPES.SUBTITLE,
                  url: url,
                  body: responseText,
                  contentType: xhr.getResponseHeader('content-type') || ''
                });
              }
            } catch (_) { /* XHR response read failed */ }
          });
        }

        return origSend.apply(xhr, arguments);
      };

      Object.defineProperty(window, '__subtxXhrPatched', { value: true, writable: false, configurable: false });
    } catch (_) { /* XHR override failed */ }
  }

  // ---------------------------------------------------------------------------
  // 7. YouTube — ytInitialPlayerResponse capture via setter trap
  // ---------------------------------------------------------------------------
  function installYtPlayerResponseTrap() {
    try {
      var capturedValue;
      var originalDescriptor = Object.getOwnPropertyDescriptor(window, 'ytInitialPlayerResponse');

      // If it already exists, process it immediately
      if (window.ytInitialPlayerResponse) {
        processYtResponse(window.ytInitialPlayerResponse);
        // Still install the trap for subsequent mutations
      }

      Object.defineProperty(window, 'ytInitialPlayerResponse', {
        enumerable: true,
        configurable: true,
        get: function () {
          return capturedValue;
        },
        set: function (val) {
          capturedValue = val;
          if (val) {
            try { processYtResponse(val); } catch (_) { /* YT response processing failed */ }
          }
        }
      });

      // If original descriptor had a value but it was already set before trap
      if (originalDescriptor && originalDescriptor.value) {
        processYtResponse(originalDescriptor.value);
      }
    } catch (_) { /* ytInitialPlayerResponse trap failed */ }
  }

  function processYtResponse(data) {
    if (!data || typeof data !== 'object') return;

    var captions = data.captions;
    if (!captions || typeof captions !== 'object') return;

    var renderer = captions.playerCaptionsTracklistRenderer;
    if (!renderer || !renderer.captionTracks || !Array.isArray(renderer.captionTracks)) return;

    var tracks = [];
    var seenUrls = {};

    for (var i = 0; i < renderer.captionTracks.length; i++) {
      var track = renderer.captionTracks[i];
      if (!track || !track.baseUrl) continue;

      var trackUrl = track.baseUrl;
      // Deduplicate by URL
      if (seenUrls[trackUrl]) continue;
      seenUrls[trackUrl] = true;

      tracks.push({
        language: track.languageCode || track.name || track.vssId || 'Unknown',
        url:      trackUrl,
        name:     (track.name && track.name.simpleText) || track.languageCode || ''
      });
    }

    if (tracks.length > 0) {
      postToContent({
        type: MSG_TYPES.YT_TRACKS,
        tracks: tracks
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 8. JW Player — capture captions from window.jwplayer()
  // ---------------------------------------------------------------------------
  function captureJwPlayerTracks() {
    try {
      if (typeof window.jwplayer !== 'function') return;

      var players;
      try {
        players = window.jwplayer().getPlayers();
      } catch (_) {
        // getPlayers() may not exist in older JW Player versions
        players = null;
      }

      if (!players || players.length === 0) {
        // Try single player instance
        try {
          var single = window.jwplayer(0);
          if (single && typeof single.getCaptionsList === 'function') {
            players = [single];
          }
        } catch (_) { /* single player check */ }
      }

      if (!players || players.length === 0) return;

      var tracks = [];
      var seenUrls = {};

      for (var p = 0; p < players.length; p++) {
        try {
          var player = players[p];
          if (typeof player.getCaptionsList !== 'function') continue;

          var captionsList = player.getCaptionsList();
          if (!captionsList || !Array.isArray(captionsList)) continue;

          for (var c = 0; c < captionsList.length; c++) {
            var caption = captionsList[c];
            if (!caption || !caption.file) continue;

            var captionUrl = caption.file;
            if (seenUrls[captionUrl]) continue;
            seenUrls[captionUrl] = true;

            tracks.push({
              language: caption.label || caption.language || 'Unknown',
              url:      captionUrl,
              name:     caption.label || ''
            });
          }
        } catch (_) { /* individual player access failed */ }
      }

      if (tracks.length > 0) {
        postToContent({
          type: MSG_TYPES.JW_TRACKS,
          tracks: tracks
        });
      }
    } catch (_) { /* JW Player capture failed */ }
  }

  // ---------------------------------------------------------------------------
  // 9. Initialization
  // ---------------------------------------------------------------------------
  function initialize() {
    // Install network interceptors immediately
    installFetchOverride();
    installXhrOverride();

    // Trap YouTube player response as early as possible
    installYtPlayerResponseTrap();

    // Defer JW Player check to after DOM is ready (player may not be instantiated yet)
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      try { captureJwPlayerTracks(); } catch (_) { /* deferred */ }
    } else {
      try {
        document.addEventListener('DOMContentLoaded', function () {
          try { captureJwPlayerTracks(); } catch (_) { /* deferred */ }
        });
      } catch (_) { /* listener registration */ }
    }

    // Periodic check for JW Player (fires after player may be dynamically created)
    try {
      setTimeout(function () {
        try { captureJwPlayerTracks(); } catch (_) { /* periodic check */ }
      }, 3000);
    } catch (_) { /* timer */ }
  }

  initialize();
})();
