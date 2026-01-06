// Debug flag for background script
const DEBUG_MODE = false;

debugLog('SubTX background script starting...');

function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

function errorLog(...args) {
  console.error(...args);
}

// Synchronization primitives to prevent race conditions - defined at top level
var subtitleProcessingLocks = new Set(); // Track URLs being processed
var storageLocks = new Map(); // Prevent concurrent storage operations per tab

// Import franc for advanced language detection (optional)
let franc = null;
let francLoading = false;

// Try to load franc asynchronously - this may fail in extension context due to CSP
function loadFranc() {
  if (francLoading) return; // Already attempting to load
  francLoading = true;

  try {
    // Dynamic import may not work in extension service workers due to CSP
    import('franc').then(module => {
      franc = module.franc;
      debugLog('Franc language detection loaded successfully');
    }).catch(error => {
      debugLog('Franc import failed (expected in extension context):', error.message);
      franc = null; // Ensure it's null if import fails
    });
    } catch (e) {
      debugLog('Franc import not supported in this context:', e.message);
      franc = null;
    }
}

// Attempt to load franc on startup
loadFranc();

debugLog('SubTX background script loaded successfully');

const SUBTITLE_CONFIG = {
  extensions: ['vtt', 'srt', 'ass', 'ssa', 'txt'],
  keywords: ['subtitle', 'caption', 'timedtext', 'texttrack'],
  minFileSize: 100, // bytes
  blacklist: [
    'analytics', 'tracking', 'beacon', 'pixel', 'collect', 'cdn-cgi',
    'google-analytics', 'googletagmanager', 'doubleclick', 'facebook.com/tr',
    'googlesyndication', 'amazon-adsystem.com', 'hotjar.com', 'l.sharethis.com',
    'sharethis.com', 'mc.yandex.ru', 'cdn-cgi/rum', 'cdn-cgi/trace',
    'cdn-cgi/challenge-platform', 'js', 'css', 'json', '/api/', 'polyfills'
  ]
};

// ===== SUBTITLE CONVERTER CONSTANTS =====
const SUBTITLE_CONSTANTS = {
  MAX_CUE_LENGTH: 10000, // Max characters per cue
  MAX_FILE_SIZE: 1024 * 1024, // 1MB limit
  DEFAULT_DURATION_MS: 60000, // 1 minute default
  TIME_PRECISION_MS: 1, // Millisecond precision
  SUPPORTED_FORMATS: ['vtt', 'srt', 'txt', 'ass'],
  ENCODING_BOM: '\uFEFF' // UTF-8 BOM
};

const subtitleStore = new Map();
let requestCount = 0;
let subtitleCount = 0;
const verificationCache = new Map(); // Cache verification results to prevent duplicate fetches

// ===== SUBTITLE VALIDATOR =====
const SubtitleValidator = {
  validateContent(content, format) {
    const errors = [];
    const warnings = [];

    if (!content || typeof content !== 'string') {
      errors.push('Content must be a non-empty string');
      return { valid: false, errors, warnings };
    }

    if (content.length > SUBTITLE_CONSTANTS.MAX_FILE_SIZE) {
      errors.push(`Content exceeds maximum size of ${SUBTITLE_CONSTANTS.MAX_FILE_SIZE} bytes`);
    }

    const lines = content.split('\n');

    // Format-specific validation
    switch (format) {
      case 'vtt':
        this._validateVttStructure(lines, errors, warnings);
        break;
      case 'srt':
        this._validateSrtStructure(lines, errors, warnings);
        break;
      case 'ass':
        this._validateAssStructure(lines, errors, warnings);
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  _validateVttStructure(lines, errors, warnings) {
    if (!lines[0] || lines[0].trim().toUpperCase() !== 'WEBVTT') {
      errors.push('VTT file must start with WEBVTT header');
    }
  },

  _validateSrtStructure(lines, errors, warnings) {
    let hasTiming = false;
    for (const line of lines) {
      if (line.includes('-->')) {
        hasTiming = true;
        break;
      }
    }
    if (!hasTiming) {
      errors.push('SRT file must contain timing information');
    }
  },

  _validateAssStructure(lines, errors, warnings) {
    const hasScriptInfo = lines.some(line => line.trim() === '[Script Info]');
    if (!hasScriptInfo) {
      errors.push('ASS file must contain [Script Info] section');
    }
  }
};

// ===== SUBTITLE PARSERS =====
const SubtitleParsers = {
  parseToCues(content, format) {
    // Strip BOM if present
    content = content.replace(SUBTITLE_CONSTANTS.ENCODING_BOM, '');

    const validation = SubtitleValidator.validateContent(content, format);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    switch (format) {
      case 'vtt':
        return this._parseVttToCues(content);
      case 'srt':
        return this._parseSrtToCues(content);
      case 'ass':
        return this._parseAssToCues(content);
      case 'txt':
        return this._parseTxtToCues(content);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  },

  _parseVttToCues(content) {
    const cues = [];
    const lines = content.split('\n');
    let i = 0;

    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const timingLine = lines[i].trim();
      if (!timingLine.includes('-->')) {
        i++;
        continue;
      }

      const cue = this._parseTimingLine(timingLine);
      if (!cue) {
        i++;
        continue;
      }

      // Collect text lines
      const textLines = [];
      i++;
      while (i < lines.length && lines[i] && lines[i].trim() !== '' && !lines[i].includes('-->')) {
        let textLine = lines[i].trim();
        // Remove HTML tags
        textLine = textLine.replace(/<[^>]*>/g, '');
        if (textLine) {
          textLines.push(textLine);
        }
        i++;
      }

      cue.text = textLines.join('\n');
      if (cue.text) {
        cues.push(cue);
      }
    }

    return cues;
  },

  _parseSrtToCues(content) {
    const cues = [];
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
      // Skip sequence number
      while (i < lines.length && !lines[i].includes('-->')) {
        i++;
      }

      if (i >= lines.length) break;

      const timingLine = lines[i].trim();
      const cue = this._parseTimingLine(timingLine);
      if (!cue) {
        i++;
        continue;
      }

      // Collect text lines
      const textLines = [];
      i++;
      while (i < lines.length && lines[i] && lines[i].trim() !== '' && !/^\d+$/.test(lines[i].trim())) {
        let textLine = lines[i].trim();
        if (textLine) {
          textLines.push(textLine);
        }
        i++;
      }

      cue.text = textLines.join('\n');
      if (cue.text) {
        cues.push(cue);
      }
    }

    return cues;
  },

  _parseAssToCues(content) {
    const cues = [];
    const lines = content.split('\n');
    let inEventsSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '[Events]') {
        inEventsSection = true;
        continue;
      }

      if (!inEventsSection || !trimmed.startsWith('Dialogue:')) {
        continue;
      }

      // Parse ASS dialogue line
      const parts = trimmed.substring(9).split(',');
      if (parts.length >= 10) {
        const startTime = this._parseAssTime(parts[1]);
        const endTime = this._parseAssTime(parts[2]);
        const text = parts.slice(9).join(',').replace(/\\N/g, '\n');

        if (startTime !== null && endTime !== null) {
          cues.push({
            start: startTime,
            end: endTime,
            text: text
          });
        }
      }
    }

    return cues;
  },

  _parseTxtToCues(content) {
    // For TXT, create a single cue with default timing
    return [{
      start: 0,
      end: SUBTITLE_CONSTANTS.DEFAULT_DURATION_MS,
      text: content.trim()
    }];
  },

  _parseTimingLine(timingLine) {
    // Parse timing line like "00:00:01.500 --> 00:00:04.000"
    const timingMatch = timingLine.match(/(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/);
    if (!timingMatch) return null;

    return {
      start: this._parseTimeToMs(timingMatch[1]),
      end: this._parseTimeToMs(timingMatch[2])
    };
  },

  _parseTimeToMs(timeStr) {
    // Parse "HH:MM:SS.mmm" or "HH:MM:SS,mmm" to milliseconds
    const cleanTime = timeStr.replace(',', '.');
    const match = cleanTime.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (!match) return 0;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const milliseconds = parseInt(match[4], 10);

    return ((hours * 3600) + (minutes * 60) + seconds) * 1000 + milliseconds;
  },

  _parseAssTime(timeStr) {
    // Parse ASS time format "0:00:01.50"
    const match = timeStr.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
    if (!match) return null;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const centiseconds = parseInt(match[4], 10);

    return ((hours * 3600) + (minutes * 60) + seconds) * 1000 + (centiseconds * 10);
  }
};


const verificationQueue = []; // Queue for rate limiting
let activeVerifications = 0;
const MAX_CONCURRENT_VERIFICATIONS = 3; // Limit concurrent requests
const storageQueues = new Map(); // Queue for subtitle storage operations per tab



// Fetch with retry logic and exponential backoff
function fetchWithRetry(url, maxLength, maxRetries = 3) {
  return new Promise((resolve) => {
    let attempt = 0;

    function attemptFetch() {
      attempt++;
      debugLog(`BACKGROUND: Fetch attempt ${attempt}/${maxRetries} for ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 8000); // 8 second timeout per attempt

      fetch(url, {
        method: 'GET',
        headers: {
          'Range': maxLength ? `bytes=0-${maxLength - 1}` : undefined,
          'Accept': 'text/plain,text/vtt,application/x-subrip,*/*'
        },
        signal: controller.signal
      })
      .then(response => {
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.text();
      })
      .then(content => {
        debugLog(`BACKGROUND: Fetch successful on attempt ${attempt}`);
        resolve({ success: true, content: content });
      })
      .catch(error => {
        clearTimeout(timeoutId);
        console.warn(`BACKGROUND: Fetch attempt ${attempt} failed:`, error.message);

        if (attempt >= maxRetries) {
          // All retries exhausted
          resolve({ success: false, error: `Failed after ${maxRetries} attempts: ${error.message}` });
        } else {
          // Exponential backoff: wait 1s, 2s, 4s...
          const delay = Math.pow(2, attempt - 1) * 1000;
          debugLog(`BACKGROUND: Retrying in ${delay}ms...`);
          setTimeout(attemptFetch, delay);
        }
      });
    }

    attemptFetch();
  });
}

// Verify subtitle content by fetching first 50 lines
async function verifySubtitleContent(url, contentType) {
  // Check cache first to prevent duplicate verification requests
  const cacheKey = url + '|' + contentType;
  if (verificationCache.has(cacheKey)) {
    return verificationCache.get(cacheKey);
  }

  // Rate limiting: wait if too many concurrent requests
  if (activeVerifications >= MAX_CONCURRENT_VERIFICATIONS) {
    return new Promise((resolve) => {
      verificationQueue.push(() => resolve(verifySubtitleContent(url, contentType)));
    });
  }

  activeVerifications++;
  try {
    // Fetch content to verify subtitle structure
    const response = await fetch(url, {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();

    // Limit content analysis to first 10KB to avoid processing large files
    const contentSample = content.substring(0, 10240);

    // Analyze the content
    const format = detectSubtitleFormat(contentSample);
    const languageInfo = detectLanguageFromContent(contentSample);

    // Calculate content-based confidence
    let contentConfidence = 0.1; // Base confidence

    if (format !== 'unknown') {
      contentConfidence += 0.6; // Strong confidence for recognized format
    }

    if (languageInfo.confidence > 0.1) {
      contentConfidence += 0.2; // Language detection boost
    }

  // Validate content has actual subtitle-like structure
  const hasSubtitleStructure = contentSample.includes('-->') ||
                               contentSample.trim().startsWith('WEBVTT') ||
                               /^\d+\s*$/.test(contentSample.trim().split('\n')[0]) ||
                               contentSample.includes('[Script Info]');

  // Filter out non-subtitle content (like thumbnails)
  const isThumbnailFile = url.toLowerCase().includes('thumbnail') ||
                          contentSample.toLowerCase().includes('thumbnails') ||
                          contentSample.toLowerCase().includes('thumb') ||
                          contentSample.toLowerCase().includes('#xywh=');

  if (!hasSubtitleStructure || isThumbnailFile) {
    return { isValid: false };
  }

    const extractedConfidence = extractSubtitleInfo(url, contentType).confidence;
    const result = {
      isValid: true,
      format: format,
      language: languageInfo.language,
      confidence: extractedConfidence
    };

    // Cache successful results for 5 minutes
    verificationCache.set(cacheKey, result);
    setTimeout(() => verificationCache.delete(cacheKey), 5 * 60 * 1000);

    activeVerifications--;
    // Process next item in queue
    if (verificationQueue.length > 0) {
      const next = verificationQueue.shift();
      next();
    }

    return result;

  } catch (error) {
    errorLog('Content verification failed:', error.message);
    const errorResult = { isValid: false };

    // Cache failed results for 1 minute to avoid repeated failures
    verificationCache.set(cacheKey, errorResult);
    setTimeout(() => verificationCache.delete(cacheKey), 60 * 1000);

    activeVerifications--;
    // Process next item in queue
    if (verificationQueue.length > 0) {
      const next = verificationQueue.shift();
      next();
    }

    return errorResult;
  }
}

// Function to validate and add subtitle with content verification
function validateSubtitleContent(url, tabId, format) {
  // Fetch a small sample of the content to validate it's actually a subtitle file
  fetch(url, {
    method: 'GET',
    headers: {
      'Range': 'bytes=0-2047' // Get first 2KB for validation
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0');
    if (contentLength > 1024 * 1024) { // Skip files larger than 1MB
      debugLog(`Skipping large file: ${url} (${contentLength} bytes)`);
      return;
    }

    return response.text();
  })
  .then(content => {
    if (!content) return;

    // Validate content based on format
    if (!isValidSubtitleContent(content, format)) {
      debugLog(`Content validation failed for ${url}`);
      return;
    }

    // Content is valid, add to store
    subtitleCount++;

    const subtitleInfo = {
      url: url,
      format: format,
      language: 'Unknown',
      confidence: 0.8,
      needsLanguageDetection: true
    };

    if (tabId > 0) {
      if (!subtitleStore.has(tabId)) {
        subtitleStore.set(tabId, []);
      }

      subtitleStore.get(tabId).push(subtitleInfo);

      const storageKey = `subtitles_${tabId}`;
      chrome.storage.local.set({
        [storageKey]: subtitleStore.get(tabId)
      }, function() {
        if (chrome.runtime.lastError) {
          errorLog('Storage error for validated subtitle:', chrome.runtime.lastError);
        } else {
          debugLog(`Added validated subtitle: ${url}`);
        }
      });
    }
  })
  .catch(error => {
    debugLog(`Content validation failed for ${url}:`, error.message);
  });
}

// Function to verify and add potential subtitle URLs (for non-standard formats)
function verifyAndAddSubtitle(url, tabId, contentType, contentLength) {
  // For other formats, we could add verification logic here
  // For now, just skip to avoid false positives
  debugLog(`Skipping potential subtitle URL: ${url} (format not VTT/SRT)`);
}

// Function to check if content is valid subtitle format
function isValidSubtitleContent(content, format) {
  if (!content || content.length < 10) return false;

  const trimmed = content.trim();

  if (format === 'VTT') {
    // VTT files should start with WEBVTT or have timing cues
    return trimmed.startsWith('WEBVTT') ||
           /\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/.test(trimmed);
  } else if (format === 'SRT') {
    // SRT files should have numbered cues with timing
    return /^\d+\s*$/m.test(trimmed) &&
           /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(trimmed);
  }

  return false;
}

function isBlacklistedUrl(url) {
  const lowerUrl = url.toLowerCase();
  return SUBTITLE_CONFIG.blacklist.some(pattern => lowerUrl.includes(pattern));
}

function isSubtitleUrl(url, contentType = '', contentLength = null) {
  const lowerUrl = url.toLowerCase();

  // Check if URL is blacklisted
  if (isBlacklistedUrl(url)) {
    debugLog(`Rejected (blacklisted): ${url}`);
    return false;
  }

  // Check file size minimum requirement
  if (contentLength !== null && contentLength < SUBTITLE_CONFIG.minFileSize) {
    debugLog(`Rejected (too small: ${contentLength} bytes): ${url}`);
    return false;
  }

  // Check for subtitle file extensions
  const hasExtension = SUBTITLE_CONFIG.extensions.some(ext =>
    lowerUrl.includes('.' + ext) || lowerUrl.endsWith('.' + ext)
  );

  // Check for subtitle keywords in URL path
  const hasKeyword = SUBTITLE_CONFIG.keywords.some(keyword =>
    lowerUrl.includes(keyword)
  );

  // Enhanced pattern matching for subtitle URLs
  const subtitlePatterns = [
    // Standard subtitle patterns
    /\/captions?\//,
    /\/subtitles?\//,
    /\/tracks?\//,
    /\/timedtext\//,
    /\/cc\//,
    // Language-specific patterns
    /_[a-z]{2,3}\.vtt$/,
    /_[a-z]{2,3}\.srt$/,
    /-[a-z]{2,3}\.vtt$/,
    /-[a-z]{2,3}\.srt$/,
    // Generic subtitle patterns
    /subtitle.*\.(vtt|srt|ass|ssa)$/,
    /caption.*\.(vtt|srt|ass|ssa)$/,
    // YouTube-specific patterns
    /\/api\/timedtext/,
    /\/youtubei\/v1\/get_transcript/
  ];

  const hasPattern = subtitlePatterns.some(pattern => pattern.test(lowerUrl));

  // Check content type for subtitle formats
  const isSubtitleContentType = contentType &&
    (contentType.includes('text/vtt') ||
     contentType.includes('text/plain') ||
     contentType.includes('application/x-subrip') ||
     contentType.includes('text/xml')); // For some subtitle formats

  const result = hasExtension || hasKeyword || hasPattern || isSubtitleContentType;

  if (result) {
    debugLog(`✅ Subtitle found: ${url}`);
  } else if (hasExtension || lowerUrl.includes('vtt') || lowerUrl.includes('srt') || lowerUrl.includes('caption') || lowerUrl.includes('subtitle')) {
    // Only log potentially interesting rejections
    debugLog(`❌ Rejected potential subtitle: ${url} (ext:${hasExtension}, key:${hasKeyword}, pat:${hasPattern}, ct:'${contentType}')`);
  }

  return result;
}

function getFileExtension(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const lastDot = pathname.lastIndexOf('.');
    return lastDot > 0 ? pathname.substring(lastDot + 1).toLowerCase() : '';
  } catch (e) {
    return '';
  }
}

function getContentType(headers) {
  if (!headers) return '';
  const contentTypeHeader = headers.find(h =>
    h.name && h.name.toLowerCase() === 'content-type'
  );
  return contentTypeHeader ? contentTypeHeader.value : '';
}

function getContentLength(headers) {
  if (!headers) return null;
  const contentLengthHeader = headers.find(h =>
    h.name && h.name.toLowerCase() === 'content-length'
  );
  return contentLengthHeader ? parseInt(contentLengthHeader.value) : null;
}

function isValidSubtitleUrl(url) {
  // Skip obviously non-subtitle URLs
  if (isBlacklistedUrl(url)) {
    return false;
  }
  
  const lowerUrl = url.toLowerCase();
  
  // Must have a subtitle extension
  const hasValidExtension = SUBTITLE_CONFIG.extensions.some(ext => 
    lowerUrl.endsWith('.' + ext)
  );
  
  // If it has a valid extension, it's likely a subtitle file
  if (hasValidExtension) {
    return true;
  }
  
  // For URLs without extensions, check for subtitle-related keywords
  const hasSubtitleKeyword = SUBTITLE_CONFIG.keywords.some(keyword => 
    lowerUrl.includes(keyword)
  );
  
  // URLs with subtitle keywords but no extensions are suspicious
  // Only allow them if they seem to be API endpoints for subtitles
  if (hasSubtitleKeyword && !hasValidExtension) {
    // Allow URLs that look like subtitle API endpoints
    return lowerUrl.includes('/subtitle') || 
           lowerUrl.includes('/caption') || 
           lowerUrl.includes('timedtext') ||
           lowerUrl.includes('texttrack');
  }
  
  return false;
}

// Preprocess subtitle content to improve language detection accuracy
function preprocessSubtitleContent(content) {
  if (!content) return '';

  const lines = content.split('\n');

  // Filter out unwanted lines and clean up content
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) return false;

    // Skip sequence numbers (pure numbers)
    if (/^\d+$/.test(trimmed)) return false;

    // Skip timestamps
    if (trimmed.includes('-->')) return false;

    // Skip common subtitle metadata
    if (trimmed.startsWith('WEBVTT') ||
        trimmed.includes('Tradução') ||
        trimmed.includes('překlad') ||
        trimmed.includes('korekce') ||
        trimmed.includes('www.') ||
        trimmed.includes('The Librarians') ||
        trimmed.includes('S03E02')) return false;

    // Skip HTML tags but keep content
    const withoutTags = trimmed.replace(/<[^>]*>/g, '').trim();
    if (!withoutTags) return false;

    return true;
  });

  // Join lines and clean up
  let result = filteredLines.join(' ');
  result = result.replace(/&[^;]+;/g, ' '); // Remove HTML entities
  result = result.replace(/\s+/g, ' ').trim(); // Normalize whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

// Character-based script analysis for language detection
function analyzeCharacterScripts(text) {
  if (!text || text.length < 10) {
    return { detectedLanguage: null, confidence: 0 };
  }

  // Count characters from different scripts
  const scripts = {
    arabic: (text.match(/[\u0600-\u06FF]/g) || []).length,
    cyrillic: (text.match(/[\u0400-\u04FF]/g) || []).length,
    chinese: (text.match(/[\u4e00-\u9fff]/g) || []).length,
    japanese: (text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length,
    korean: (text.match(/[\uac00-\ud7af]/g) || []).length,
    czech: (text.match(/[ěščřžýáíéóúůďťňĚŠČŘŽÝÁÍÉÓÚŮĎŤŇ]/g) || []).length,
    latin: (text.match(/[a-zA-Z]/g) || []).length
  };

  const totalChars = Object.values(scripts).reduce((a, b) => a + b, 0);
  if (totalChars === 0) {
    return { detectedLanguage: null, confidence: 0 };
  }

  // Calculate percentages
  const percentages = {};
  for (const [script, count] of Object.entries(scripts)) {
    percentages[script] = count / totalChars;
  }

  // Detection logic based on dominant script
  if (percentages.arabic > 0.3) {
    return { detectedLanguage: 'Arabic', confidence: Math.min(0.95, percentages.arabic + 0.1) };
  }
  if (percentages.cyrillic > 0.3) {
    return { detectedLanguage: 'Russian', confidence: Math.min(0.95, percentages.cyrillic + 0.1) };
  }
  if (percentages.chinese > 0.3) {
    return { detectedLanguage: 'Chinese', confidence: Math.min(0.95, percentages.chinese + 0.1) };
  }
  if (percentages.japanese > 0.3) {
    return { detectedLanguage: 'Japanese', confidence: Math.min(0.95, percentages.japanese + 0.1) };
  }
  if (percentages.korean > 0.3) {
    return { detectedLanguage: 'Korean', confidence: Math.min(0.95, percentages.korean + 0.1) };
  }
  if (percentages.czech > 0.1) {
    return { detectedLanguage: 'Czech', confidence: Math.min(0.9, percentages.czech * 5) };
  }

  // For Latin script, fall back to word-based detection
  return { detectedLanguage: null, confidence: 0 };
}

// Simple content-based format detection
function detectSubtitleFormat(content) {
  if (!content || content.length < 10) {
    return 'unknown';
  }
  
  const trimmedContent = content.trim();
  
  // VTT format detection (case-insensitive)
  if (trimmedContent.toUpperCase().startsWith('WEBVTT')) {
    return 'vtt';
  }
  
  // SRT format detection - starts with a number
  if (/^\d+\s*$/.test(trimmedContent.split('\n')[0])) {
    return 'srt';
  }
  
  // ASS/SSA format detection
  if (trimmedContent.includes('[Script Info]') && trimmedContent.includes('[V4+ Styles]')) {
    return trimmedContent.includes('[Events]') ? 'ass' : 'ssa';
  }
  
  // Plain text (basic subtitle content)
  if (trimmedContent.includes('-->')) {
    // Could be either VTT or SRT, check for commas in timestamps (SRT) vs dots (VTT)
    if (trimmedContent.includes(',')) {
      return 'srt';
    }
    return 'vtt';
  }
  
  return 'txt'; // Default to text if no clear format
}

// Advanced language detection using franc with intelligent preprocessing and fallback to custom regex
function detectLanguageFromContent(content) {
  if (!content || content.length < 20) {
    return { language: 'Unknown', confidence: 0 };
  }

  // Preprocess subtitle content to extract actual translated dialogue
  const cleanContent = preprocessSubtitleContent(content);

  debugLog(`Original content length: ${content.length}, Clean content length: ${cleanContent.length}`);
  debugLog(`Clean content sample: "${cleanContent.substring(0, 100)}"`);

  // Try character-based script detection first (more reliable for subtitles)
  const charAnalysis = analyzeCharacterScripts(cleanContent);
  if (charAnalysis.detectedLanguage && charAnalysis.confidence > 0.3) {
    debugLog(`Character analysis detected: ${charAnalysis.detectedLanguage} with confidence ${charAnalysis.confidence.toFixed(2)}`);
    return { language: charAnalysis.detectedLanguage, confidence: charAnalysis.confidence };
  }

  // Try franc if available and character analysis didn't work
  if (franc && cleanContent.length >= 30) {
    try {
      // Use franc for language detection on clean content
      const languageCode = franc(cleanContent, {minLength: 20});

      // Convert ISO 639-3 codes to readable language names
      const languageMap = {
        'por': 'Portuguese',
        'spa': 'Spanish',
        'fra': 'French',
        'deu': 'German',
        'ita': 'Italian',
        'eng': 'English',
          'ces': 'Czech',
          'srp': 'Serbian',
          'nld': 'Dutch',
        'rus': 'Russian',
        'ara': 'Arabic',
        'zho': 'Chinese',
        'jpn': 'Japanese',
        'kor': 'Korean',
        'swe': 'Swedish',
        'dan': 'Danish',
        'nor': 'Norwegian',
        'fin': 'Finnish',
        'pol': 'Polish',
        'tur': 'Turkish',
        'hin': 'Hindi',
        'ben': 'Bengali',
        'und': 'Unknown' // Undetermined
      };

      const languageName = languageMap[languageCode] || languageCode.toUpperCase();

      // Get confidence scores from francAll if available
      let confidence = 0.7; // Default confidence for franc detections
      try {
        const allResults = franc.all ? franc.all(cleanContent) : [];
        if (allResults.length > 0 && allResults[0][1] !== undefined) {
          // Convert franc's distance score to confidence (lower distance = higher confidence)
          const topScore = allResults[0][1];
          confidence = Math.max(0.1, Math.min(0.95, 1 - topScore));

          // Boost confidence if there's a clear winner
          if (allResults.length > 1 && topScore < allResults[1][1] * 0.7) {
            confidence = Math.min(0.95, confidence + 0.1);
          }
        }
      } catch (e) {
        // Keep default confidence if francAll fails
      }

      // Only trust franc if it's confident and not detecting English (which is often wrong for subtitles)
      if (languageCode !== 'und' && languageCode !== 'eng' && confidence > 0.4) {
        debugLog(`Franc detected: ${languageName} (${languageCode}) with confidence ${confidence.toFixed(2)}`);
        return { language: languageName, confidence: confidence };
      }

      // If franc detects English or undetermined, or low confidence, fall back to custom regex
      debugLog(`Franc uncertain (${languageCode}, confidence ${confidence.toFixed(2)}), using custom regex`);
    } catch (error) {
      debugLog('Franc detection failed, falling back to custom method:', error.message);
    }
  }

  // Fallback to custom regex detection if franc fails or is unavailable
  const trimmedContent = cleanContent.toLowerCase();

  // Common language character sets and patterns
  const languagePatterns = {
    'English': /\b(the|and|is|in|to|of|a|that|it|with|for|as|was|on|are|this|from|by|be|have|at|an|but|not|they|or|we|she|he|you|i|me|my|your|his|her|our|their)\b/gi,
    'Spanish': /\b(qué|cómo|cuándo|dónde|por|qué|tú|usted|ellos|ellas|está|están|fue|fueron|ser|estar|tener|hacer|querer|quiero|quieres|quiere|queremos|quieren|vamos|van|fui|fuiste|fue|fuimos|fuisteis|fueron)\b/gi,
    'French': /\b(quoi|comment|quand|où|pourquoi|tu|vous|ils|elles|est|sont|était|étaient|être|avoir|faire|vouloir|je|il|elle|nous|allons|allez|vont|suis|es|est|sommes|êtes|sont|étais|était|étions|étiez|étaient)\b/gi,
    'German': /\b(was|wie|wann|wo|warum|du|er|sie|es|wir|ihr|sie|sein|sind|war|waren|gewesen|haben|hatten|werden|wollen|will|willst|will|wollen|wollt|wollen|gehen|gehe|gehst|geht|gehen|kommen|komme|kommst|kommt|kommen)\b/gi,
    'Italian': /\b(che|cosa|come|quando|dove|perché|tu|lei|lui|loro|noi|voi|loro|è|siamo|siete|sono|ero|eri|era|eravamo|eravate|erano|essere|avere|fare|volere|voglio|vuoi|vuole|vogliamo|volete|vogliono|andiamo|andate|vanno|sono|sei|è|siamo|siete|sono)\b/gi,
    'Portuguese': /\b(não|também|agora|porque|você|nós|eles|elas|está|estão|foi|foram|ser|estar|ter|haver|quer|quero|queres|querem|vamos|vão|vim|viste|viu|viemos|vistes|viram)\b/gi,
    'Russian': /[\u0400-\u04FF]+/, // Cyrillic
    'Arabic': /[\u0600-\u06FF]+/, // Arabic
    'Chinese': /[\u4e00-\u9fff]+/, // Chinese
    'Japanese': /[\u3040-\u309f\u30a0-\u30ff]+/, // Hiragana/Katakana
    'Korean': /[\uac00-\ud7af]+/, // Hangul
    'Dutch': /\b(wat|hoe|wanneer|waar|waarom|jij|hij|zij|wij|jullie|zullen|zou|bent|ben|is|zijn|was|waren|geweest|hebben|hadden|zullen|willen|wil|wilt|wil|willen|willen|willen|gaan|ga|gaat|gaan|komen|kom|komt|komen)\b/gi,
    'Czech': /\b(a|v|se|na|je|s|že|to|jsem|jsme|byl|byla|byli|byly|bude|budou|má|mají|měl|měla|měli|měly|ten|ta|to|ti|ty|ta|český|česká|české)\b/gi,
    'Serbian': /\b(i|u|na|je|da|se|ne|to|su|od|za|sa|kao|ako|ali|ili|jer|zbog|prema|kroz|oko|iznad|ispod|između)\b/gi
  };

  let detectedLanguage = 'Unknown';
  let maxMatches = 0;
  let confidence = 0.1;

  // Count matches for each language pattern
  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    const matches = trimmedContent.match(pattern);
    if (matches && matches.length > maxMatches) {
      maxMatches = matches.length;
      detectedLanguage = lang;
      confidence = Math.min(0.9, matches.length / 20); // Normalize confidence
    }
  }

   debugLog(`Custom regex detected: ${detectedLanguage} with confidence ${confidence}`);
   return { language: detectedLanguage, confidence: confidence };
 }

// ===== SUBTITLE CONVERSION SYSTEM =====






function extractSubtitleInfo(url, contentType = '') {
  const urlObj = new URL(url);
  let language = 'Unknown';
  const langParams = ['lang', 'language', 'hl', 'lng'];

  // Only extract language from URL parameters if they seem like actual language codes
  for (const param of langParams) {
    if (urlObj.searchParams.has(param)) {
      const langValue = urlObj.searchParams.get(param);
      if (langValue && langValue.length <= 5 && /^[a-zA-Z_-]+$/.test(langValue)) {
        language = langValue;
        break;
      }
    }
  }

  // Determine format from URL extension
  const extension = getFileExtension(url);
  let format = 'vtt'; // default

  if (extension === 'srt') format = 'srt';
  else if (extension === 'ass' || extension === 'ssa') format = 'ass';
  else if (extension === 'txt') format = 'txt';
  else if (contentType.includes('text/vtt')) format = 'vtt';
  else if (contentType.includes('application/x-subrip')) format = 'srt';

  // Calculate confidence based on extension match
  let confidence = 0.5;
  if (extension && SUBTITLE_CONFIG.extensions.includes(extension)) {
    confidence = 0.9; // High confidence for known extensions
  } else if (SUBTITLE_CONFIG.keywords.some(k => url.includes(k))) {
    confidence = 0.7; // Medium confidence for keyword matches
  }

  // Increase confidence for URLs with extensions
  if (url.includes('.' + format)) {
    confidence += 0.4;
  }

  // Increase confidence for URLs with language info
  if (language !== 'Unknown') {
    confidence += 0.2;
  }

  // Increase confidence for URLs with subtitle keywords
  const lowerUrl = url.toLowerCase();
  if (SUBTITLE_CONFIG.keywords.some(keyword => lowerUrl.includes(keyword))) {
    confidence += 0.1;
  }

  // Cap confidence at 1.0
  confidence = Math.min(1.0, confidence);

  return { url, language, format, confidence };
}

try {
    debugLog('SubTX: Attempting to register webRequest listener...');
  chrome.webRequest.onHeadersReceived.addListener(
    function(details) {
      debugLog('SubTX: Request intercepted:', details.url.substring(0, 100));
      requestCount++;

    // Only process GET requests with successful status
    if (details.method !== 'GET' || details.statusCode < 200 || details.statusCode >= 300) {
      return;
    }

    const url = details.url;
    const tabId = details.tabId;
    const contentType = getContentType(details.responseHeaders);
    const contentLength = getContentLength(details.responseHeaders);

    debugLog(`[${requestCount}] Intercepted: ${url.substring(0, 100)} (Content-Type: ${contentType})`);

    // Check if this is a subtitle URL with improved filtering
    if (!isSubtitleUrl(url, contentType, contentLength)) {
      debugLog(`[${requestCount}] Rejected: ${url.substring(0, 100)} - not a subtitle URL`);
      return;
    }

    debugLog(`[${requestCount}] Potential subtitle: ${url.substring(0, 100)}`);

    // For known subtitle formats, add directly with synchronization
    const extension = getFileExtension(url);
    if (extension === 'vtt' || extension === 'srt') {
      debugLog(`🎬 SUBTITLE DETECTED: ${url} (extension: ${extension})`);
      debugLog(`Adding subtitle directly: ${url}`);

      const subtitleInfo = {
        url: url,
        format: getFileExtension(url).toUpperCase(),
        language: 'Unknown',
        confidence: 0.8,
        needsLanguageDetection: true,
        timestamp: Date.now() // Add timestamp for sorting
      };

      if (tabId > 0) {
        // Synchronize storage operations per tab
        const storageKey = `subtitles_${tabId}`;
        if (storageLocks.has(storageKey)) {
          debugLog(`Storage operation in progress for tab ${tabId}, queuing subtitle: ${url}`);
          // Queue the subtitle for later processing
          if (!storageQueues.has(tabId)) {
            storageQueues.set(tabId, []);
          }
          storageQueues.get(tabId).push(subtitleInfo);
          subtitleProcessingLocks.delete(url);
          return;
        }
        storageLocks.set(storageKey, true);

        if (!subtitleStore.has(tabId)) {
          subtitleStore.set(tabId, []);
        }

        subtitleStore.get(tabId).push(subtitleInfo);

        chrome.storage.local.set({
          [storageKey]: subtitleStore.get(tabId)
        }, function() {
          storageLocks.delete(storageKey);
          subtitleProcessingLocks.delete(url);

          if (chrome.runtime.lastError) {
            errorLog('Storage error for subtitle:', chrome.runtime.lastError);
          } else {
            subtitleCount++;
            debugLog(`Added subtitle ${subtitleCount}: ${url}`);

            // Notify popup of new subtitles
            chrome.runtime.sendMessage({
              action: 'updateSubtitles',
              subtitles: subtitleStore.get(tabId)
            }).then(() => {
              debugLog(`📤 Notified popup of ${subtitleStore.get(tabId).length} subtitles`);
            }).catch((error) => {
              debugLog('Popup notification failed (popup probably closed):', error.message);
            });

            // Process queued subtitles for this tab
            processQueuedSubtitles(tabId);
          }
        });
      } else {
        subtitleProcessingLocks.delete(url);
      }
    } else {
      // For other potential subtitles, attempt verification via fetch
      const extension = getFileExtension(url);
      debugLog(`Skipping non-subtitle URL: ${url} (extension: ${extension}, contentType: ${contentType})`);
      verifyAndAddSubtitle(url, tabId, contentType, contentLength);
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
  );
    debugLog('SubTX: webRequest listener registered successfully for supported domains');

// Process queued subtitles for a tab after storage operations complete
function processQueuedSubtitles(tabId) {
  const queue = storageQueues.get(tabId);
  if (!queue || queue.length === 0) {
    return;
  }

  const storageKey = `subtitles_${tabId}`;
  if (storageLocks.has(storageKey)) {
    debugLog(`Storage still locked for tab ${tabId}, cannot process queue yet`);
    return;
  }

  const nextSubtitle = queue.shift();
  if (!nextSubtitle) {
    return;
  }

  debugLog(`Processing queued subtitle for tab ${tabId}: ${nextSubtitle.url}`);
  storageLocks.set(storageKey, true);

  if (!subtitleStore.has(tabId)) {
    subtitleStore.set(tabId, []);
  }

  subtitleStore.get(tabId).push(nextSubtitle);

  chrome.storage.local.set({
    [storageKey]: subtitleStore.get(tabId)
  }, function() {
    storageLocks.delete(storageKey);

    if (chrome.runtime.lastError) {
      errorLog('Storage error for queued subtitle:', chrome.runtime.lastError);
    } else {
      subtitleCount++;
      debugLog(`Added queued subtitle ${subtitleCount}: ${nextSubtitle.url}`);

      // Notify popup of new subtitles
      chrome.runtime.sendMessage({
        action: 'updateSubtitles',
        subtitles: subtitleStore.get(tabId)
      }).then(() => {
        debugLog(`📤 Notified popup of ${subtitleStore.get(tabId).length} subtitles after queue processing`);
      }).catch((error) => {
        debugLog('Popup notification failed (popup probably closed):', error.message);
      });

      // Continue processing queue
      processQueuedSubtitles(tabId);
    }
  });
}
} catch (error) {
  console.error('SubTX: Failed to register webRequest listener:', error);
  console.error('SubTX: This may be due to missing permissions or invalid URL patterns');
}

// Clean up memory and locks when tabs are closed
chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
  if (subtitleStore.has(tabId)) {
    subtitleStore.delete(tabId);
    debugLog(`Cleaned up memory for closed tab ${tabId}`);
  }

  // Clean up storage locks for this tab
  const storageKey = `subtitles_${tabId}`;
  storageLocks.delete(storageKey);

  // Clean up any subtitle processing locks that might be related to this tab
  // (This is a simplified cleanup - in production might need more sophisticated tracking)
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // Validate message structure
  if (!request || typeof request !== 'object') {
    errorLog('Invalid message received:', request);
    sendResponse({success: false, error: 'Invalid message format'});
    return true;
  }

  // Add timeout for async responses
  let responded = false;
  const responseTimeout = setTimeout(() => {
    if (!responded) {
      errorLog('Message response timeout for action:', request.action);
      responded = true;
      sendResponse({success: false, error: 'Operation timeout'});
    }
  }, 10000); // 10 second timeout

  function safeSendResponse(response) {
    if (!responded) {
      responded = true;
      clearTimeout(responseTimeout);
      sendResponse(response);
    }
  }

  debugLog('Received message:', request);

  if (request.action === 'getDebugInfo') {
    debugLog('SubTX: getDebugInfo called - requests:', requestCount, 'subtitles:', subtitleCount);
    safeSendResponse({
      success: true,
      requestCount: requestCount,
      subtitleCount: subtitleCount
    });
    return true;
  } else if (request.action === 'clearMemoryCache') {
    subtitleStore.clear();
    debugLog('Memory cache cleared');
    safeSendResponse({success: true, message: 'Memory cache cleared'});
    return true;
  }
  
  if (request.action === 'getSubtitles') {
    const tabId = request.tabId;

    if (!tabId || tabId <= 0) {
      safeSendResponse({ success: false, error: 'Invalid tab ID' });
      return true;
    }

    const memorySubtitles = subtitleStore.get(tabId) || [];

    const storageKey = `subtitles_${tabId}`;

    chrome.storage.local.get([storageKey], function(result) {
      if (chrome.runtime.lastError) {
        errorLog('Storage error:', chrome.runtime.lastError);
        safeSendResponse({ success: false, error: 'Failed to load stored subtitles', subtitles: memorySubtitles });
        return;
      }

      const storedSubtitles = result[storageKey] || [];
      const allSubtitles = [...memorySubtitles, ...storedSubtitles];

      // Remove duplicates based on URL
      const uniqueSubtitles = allSubtitles.filter((subtitle, index, self) =>
        index === self.findIndex(s => s.url === subtitle.url)
      );

      safeSendResponse({ success: true, subtitles: uniqueSubtitles });
    });
  } else if (request.action === 'contentScriptSubtitles' && request.subtitles && sender.tab) {
    const tabId = sender.tab.id;
      debugLog('CONTENT SCRIPT subtitles for tab', tabId, request.subtitles);

    if (tabId > 0) {
      if (!subtitleStore.has(tabId)) {
        subtitleStore.set(tabId, []);
      }

      subtitleStore.get(tabId).push(...request.subtitles);

      const storageKey = `subtitles_${tabId}`;
      chrome.storage.local.set({
        [storageKey]: subtitleStore.get(tabId)
      });
    }
    return true;
  } else if (request.action === 'fetchSubtitleContent') {
    debugLog('BACKGROUND: Received fetchSubtitleContent request:', request);

    const { url, maxLength, targetFormat } = request;

    if (!url || typeof url !== 'string') {
      console.error('BACKGROUND: Invalid URL provided:', url);
      sendResponse({ success: false, error: 'Invalid URL provided' });
      return true;
    }

    debugLog('BACKGROUND: Fetching subtitle content from:', url, 'maxLength:', maxLength, 'targetFormat:', targetFormat);

    // Use retry logic instead of single fetch
    fetchWithRetry(url, maxLength, 3)
      .then(result => {
        if (result.success) {
          debugLog(`BACKGROUND: Successfully fetched ${result.content.length} bytes from ${url}`);

          let finalContent = result.content;
          let actualFormat = detectSubtitleFormat(result.content) || targetFormat;

          debugLog(`BACKGROUND: Content preview: "${finalContent.substring(0, 100)}..."`);
          safeSendResponse({
            success: true,
            content: result.content, // Original content
            convertedContent: finalContent, // Converted content (may be same as original)
            actualFormat: actualFormat, // Actual format of returned content
            url: url
          });
        } else {
          console.error(`BACKGROUND: All retry attempts failed for ${url}:`, result.error);
          safeSendResponse({
            success: false,
            error: result.error,
            url: url
          });
        }
      })
      .catch(error => {
        console.error(`BACKGROUND: Unexpected error fetching ${url}:`, error);
        safeSendResponse({
          success: false,
          error: 'Unexpected error: ' + error.message,
          url: url
        });
      });

    return true; // Keep message channel open for async response
  } else {
    safeSendResponse({success: false, error: 'Unknown action: ' + request.action});
  }
  return true;
});

chrome.tabs.onRemoved.addListener(function(tabId) {
  subtitleStore.delete(tabId);
  verificationCache.clear(); // Clear verification cache on tab close
  chrome.storage.local.remove(`subtitles_${tabId}`, function() {
    if (chrome.runtime.lastError) {
      errorLog('Storage remove error on tab close:', chrome.runtime.lastError);
    }
  });
});

debugLog('SubTX background script initialized successfully');

// ===== CLEANUP AND EVENT HANDLERS =====

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
  subtitleStore.delete(tabId);
  verificationCache.clear(); // Clear verification cache on tab close
  chrome.storage.local.remove(`subtitles_${tabId}`, function() {
    if (chrome.runtime.lastError) {
      errorLog('Storage remove error on tab close:', chrome.runtime.lastError);
    }
  });
});

// Clean up when windows are closed
chrome.windows.onRemoved.addListener(function(windowId) {
  // Clear any remaining data when window is closed
  verificationQueue.length = 0;
  activeVerifications = 0;
});