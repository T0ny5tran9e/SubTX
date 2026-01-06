// Debug flag for content script
const DEBUG_MODE = false;

function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

function errorLog(...args) {
  console.error(...args);
}

debugLog('SubTX content script loaded on:', window.location.hostname);

let detectedSubtitles = [];

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // Validate message
  if (!request || typeof request !== 'object' || request.action !== 'getSubtitles') {
    return true;
  }

  if (request.action === 'getSubtitles') {
    sendResponse({subtitles: detectedSubtitles});
    return true;
  }
  return true;
});

function detectSubtitlesFromDOM() {
  detectedSubtitles = [];
  const hostname = window.location.hostname;

  try {
    if (hostname.includes('youtube.com')) {
      detectYouTubeSubtitles();
    } else if (hostname.includes('vimeo.com')) {
      detectVimeoSubtitles();
    }
  } catch (error) {
    errorLog('Content script subtitle detection error:', error);
  }
}

function isValidSubtitleUrl(url) {
  // Basic validation for subtitle URLs
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  // Skip data URLs and blob URLs
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return false;
  }
  
  // Must be a valid URL
  try {
    new URL(url);
  } catch (e) {
    return false;
  }
  
  return true;
}

function detectYouTubeSubtitles() {
  try {
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
        if (script.textContent && script.textContent.includes('captionTracks')) {
          const captionMatch = script.textContent.match(/"captionTracks":\s*(\[[^\]]*\])/);
          if (captionMatch && captionMatch[1]) {
            try {
              const jsonString = captionMatch[1].trim();
              // Less strict validation - just ensure it's not empty and reasonable length
              if (jsonString.length > 2 && jsonString.length < 50000) {
                const captionData = JSON.parse(jsonString);
                // Ensure it's an array and has content
                if (Array.isArray(captionData) && captionData.length > 0) {
                  captionData.forEach(track => {
                    // Basic validation for required fields
                    if (track && typeof track === 'object' && track.baseUrl) {
                      detectedSubtitles.push({
                        language: track.languageCode || track.name || 'Unknown',
                        url: track.baseUrl,
                        format: 'vtt',
                        confidence: 0.9, // High confidence for YouTube subtitles
                        source: 'youtube-script'
                      });
                    }
                  });
                }
              }
            } catch (e) {
              errorLog('YouTube caption JSON parsing failed:', e.message);
            }
          }
        }
    });
  } catch (error) {
    console.warn('YouTube subtitle detection failed:', error);
  }
}

function detectVimeoSubtitles() {
  try {
    const vimeoPlayers = document.querySelectorAll('[data-vimeo-id], .vimeo-player, iframe[src*="vimeo.com"]');
    
    vimeoPlayers.forEach(player => {
      try {
        if (window.Vimeo && window.Vimeo.Player) {
          const vimeoPlayer = new window.Vimeo.Player(player);
          vimeoPlayer.getTextTracks().then(tracks => {
            tracks.forEach(track => {
              // Validate track URL before adding
              if (track.url && isValidSubtitleUrl(track.url)) {
                detectedSubtitles.push({
                  language: track.language || track.label || 'Unknown',
                  url: track.url,
                  format: 'vtt',
                  confidence: 0.8, // Good confidence for Vimeo subtitles
                  source: 'vimeo-api'
                });
              }
            });
          }).catch(() => {
            debugLog('Vimeo API error - ignoring');
          });
        }
      } catch (e) {
        debugLog('Vimeo player creation error - ignoring');
      }
    });
  } catch (error) {
    errorLog('Vimeo subtitle detection failed:', error);
  }
}

function sendSubtitlesToBackground() {
  if (detectedSubtitles.length > 0) {
    chrome.runtime.sendMessage({
      action: 'contentScriptSubtitles',
      subtitles: detectedSubtitles
    });
  }
}

// Hybrid approach: MutationObserver + periodic check for reliability
let subtitleObserver = null;
let detectionInterval = null;
let lastDetectionTime = 0;
const DETECTION_THROTTLE_MS = 1000; // Minimum time between detections
const PERIODIC_CHECK_MS = 5000; // Fallback periodic check every 5 seconds

function startSubtitleDetection() {
  // Initial detection
  detectSubtitlesFromDOM();
  sendSubtitlesToBackground();

  // Set up MutationObserver for immediate detection
  if (subtitleObserver) {
    subtitleObserver.disconnect();
  }

  subtitleObserver = new MutationObserver((mutations) => {
    const now = Date.now();
    if (now - lastDetectionTime < DETECTION_THROTTLE_MS) {
      return; // Throttle detections
    }

    // Trigger detection on any DOM change (less selective for reliability)
    lastDetectionTime = now;
    detectSubtitlesFromDOM();
    sendSubtitlesToBackground();
  });

  // Observe changes to the document body (broader observation)
  if (document.body) {
    subtitleObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }

  // Fallback periodic check to ensure we don't miss anything
  if (detectionInterval) {
    clearInterval(detectionInterval);
  }
  detectionInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastDetectionTime >= PERIODIC_CHECK_MS) {
      lastDetectionTime = now;
      detectSubtitlesFromDOM();
      sendSubtitlesToBackground();
    }
  }, PERIODIC_CHECK_MS);
}

window.addEventListener('load', startSubtitleDetection);

// Clean up observer and interval on page unload
window.addEventListener('beforeunload', function() {
  if (subtitleObserver) {
    subtitleObserver.disconnect();
    subtitleObserver = null;
  }
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
});