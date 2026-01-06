// Debug flag - set to false for production builds
const DEBUG_MODE = false;

// Application constants
const APP_CONSTANTS = {
  DOWNLOAD_TIMEOUT_MS: 30000, // 30 seconds
  SUBTITLE_UPDATE_DEBOUNCE_MS: 300, // 300ms debounce for UI updates
  LANGUAGE_DETECTION_MAX_LENGTH: 2048, // Max content length for language detection
  CLIPBOARD_LINK_LIMIT: 100, // Maximum links to copy to clipboard
  SUBTITLE_FILE_SIZE_LIMIT: 1024 * 1024 // 1MB limit for subtitle files
};

function debugLog(...args) {
  // Disabled for production performance
  // if (DEBUG_MODE) {
  //   console.log(...args);
  // }
}

// Keep error logging for critical errors always enabled
function errorLog(...args) {
  console.error(...args); // Always log errors for debugging
}

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
  errorLog('Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent default browser error logging
});

let currentSubtitles = [];
let activeDownloads = 0;

  // Filter state
  let languageFilters = new Set();
  let formatFilters = new Set();



  // Language name to code mapping for proper filtering
  const languageNameToCode = {
    'arabic': 'ar',
    'portuguese': 'pt',
    'french': 'fr',
    'spanish': 'es',
    'english': 'en',
    'german': 'de',
    'italian': 'it',
    'russian': 'ru',
    'chinese': 'zh',
    'japanese': 'ja',
    'korean': 'ko',
    'dutch': 'nl',
    'czech': 'cs',
    'serbian': 'sr'
  };

// Debouncing for UI updates
let subtitleUpdateTimeout = null;

// Download progress tracking
let downloadProgress = new Map();
let activeDownloadItems = new Map(); // Track DOM elements for downloads

// Initialize Smart Language Detector
let smartLanguageDetector = null;

try {
  smartLanguageDetector = new SmartLanguageDetector();
} catch (error) {
  errorLog('Smart Language Detector initialization failed');
}

document.addEventListener('DOMContentLoaded', function() {
  const subtitleList = document.getElementById('subtitle-list');
  const statusInfo = document.getElementById('status');
  const subtitleCounter = document.getElementById('subtitle-counter');
  const refreshBtn = document.getElementById('refresh-btn');
  const copyAllBtn = document.getElementById('copy-all-btn');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const debugRequests = document.getElementById('debug-requests');
  const debugSubtitles = document.getElementById('debug-subtitles');
  const formatSelect = document.getElementById('format-select');
  const downloadSelectedBtn = document.getElementById('download-selected-btn');
  const copySelectedBtn = document.getElementById('copy-selected-btn');
  const bulkFilenameInput = document.getElementById('bulk-filename');
  const bulkAppendLanguageCheckbox = document.getElementById('bulk-append-language');

   statusInfo.textContent = 'Scanning...';

   function loadDebugInfo() {
    try {
    chrome.runtime.sendMessage({action: 'getDebugInfo'}, function(response) {
        if (chrome.runtime.lastError) {
          debugLog('Failed to get debug info:', chrome.runtime.lastError);
          return;
        }
        if (response && typeof response.requestCount === 'number') {
          debugRequests.textContent = response.requestCount;
          debugSubtitles.textContent = currentSubtitles.length;
        }
      });
    } catch (error) {
      // Ignore debug info errors
    }
  }

  function updateSubtitlePanel(message, isError = false) {
    let panelContent = subtitleList.querySelector('.webtui-panel-content');
    if (!panelContent) {
      subtitleList.innerHTML = `
        <div class="webtui-panel-header">Subtitle Results</div>
        <div class="webtui-panel-content">
          <div class="webtui-text">${message}</div>
        </div>
      `;
    } else {
      panelContent.innerHTML = `<div class="webtui-text${isError ? ' webtui-error' : ''}">${message}</div>`;
    }
  }

  function loadSubtitles() {
    statusInfo.textContent = 'Scanning for subtitles...';
    statusInfo.classList.add('webtui-loading');

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (chrome.runtime.lastError) {
        errorLog('Tabs access error');
        statusInfo.textContent = 'Error: Cannot access current tab';
        statusInfo.classList.remove('webtui-loading');
        return;
      }

      if (!tabs || tabs.length === 0) {
        statusInfo.textContent = 'Error: No active tab found';
        statusInfo.classList.remove('webtui-loading');
        return;
      }

      const tab = tabs[0];

        chrome.runtime.sendMessage({action: 'getSubtitles', tabId: tab.id}, function(response) {
         if (chrome.runtime.lastError) {
           errorLog('Failed to get subtitles:', chrome.runtime.lastError);
           statusInfo.textContent = 'Error: Could not load subtitles. Try refreshing.';
           statusInfo.classList.remove('webtui-loading');
           currentSubtitles = [];
            updateSubtitlePanel('Failed to load subtitles. Please try again.', true);
           return;
         }

         statusInfo.textContent = 'Ready';
         statusInfo.classList.remove('webtui-loading');

          if (response && response.subtitles && Array.isArray(response.subtitles)) {
            currentSubtitles = response.subtitles;
            if (currentSubtitles.length > 0) {
              displaySubtitles(currentSubtitles);
            } else {
               updateSubtitlePanel('No subtitles detected on this page yet. Try refreshing or navigating to a video with subtitles.');
            }
          } else {
            // For testing: don't overwrite currentSubtitles if already populated from DOM
            if (currentSubtitles.length === 0) {
              currentSubtitles = [];
               updateSubtitlePanel('No subtitle data available. The page may not have embedded subtitles.');
            }
          }

          loadDebugInfo();
       });
    });
  }

  chrome.runtime.onMessage.addListener(function(message) {
    debugLog('📨 Popup received message:', message.action, message.subtitles ? message.subtitles.length + ' subtitles' : 'no subtitles');
    if (message.action === 'updateSubtitles' && message.subtitles) {
      debugLog('📨 Updating subtitles in popup:', message.subtitles.length);
      currentSubtitles = message.subtitles;

      // Debounced UI update to prevent excessive updates during rapid subtitle detection
      if (subtitleUpdateTimeout) {
        clearTimeout(subtitleUpdateTimeout);
      }
      subtitleUpdateTimeout = setTimeout(() => {
        displaySubtitles(currentSubtitles);
        statusInfo.textContent = 'Ready';
        loadDebugInfo();
      }, APP_CONSTANTS.SUBTITLE_UPDATE_DEBOUNCE_MS);
    }
  });

  refreshBtn.addEventListener('click', function() {
    loadSubtitles();
  });

  // Selection state management
  let selectedSubtitles = new Set();

  function updateSelectionUI() {
    try {
      const selectedCount = selectedSubtitles.size;
      const selectedCountEl = document.getElementById('selected-count');
      const selectAllBtn = document.getElementById('select-all-btn');
      const panelContent = subtitleList.querySelector('.webtui-panel-content');

    // Update selected count in the unified status panel
    if (selectedCountEl) {
      selectedCountEl.textContent = selectedCount;
    }

    // Update select all button text based on current state
    if (selectAllBtn && panelContent) {
      const totalCheckboxes = panelContent.querySelectorAll('.webtui-checkbox').length;
      const checkedCheckboxes = panelContent.querySelectorAll('.webtui-checkbox:checked').length;

      if (checkedCheckboxes === 0) {
        selectAllBtn.innerHTML = '<span class="webtui-button-icon">☑️</span>Select All';
      } else if (checkedCheckboxes === totalCheckboxes) {
        selectAllBtn.innerHTML = '<span class="webtui-button-icon">☐</span>Deselect All';
      } else {
        selectAllBtn.innerHTML = '<span class="webtui-button-icon">☑️</span>Select All';
      }
    }

     const hasSelection = selectedCount > 0;
     if (formatSelect) formatSelect.disabled = !hasSelection;
     if (downloadSelectedBtn) downloadSelectedBtn.disabled = !hasSelection;
     if (copySelectedBtn) copySelectedBtn.disabled = !hasSelection;
     if (bulkFilenameInput) bulkFilenameInput.disabled = !hasSelection;
     if (bulkAppendLanguageCheckbox) bulkAppendLanguageCheckbox.disabled = !hasSelection;
     
     // Set default filename when selection changes
     if (hasSelection && bulkFilenameInput) {
       updateBulkFilename();
     }
    } catch (error) {
      errorLog('Error updating selection UI:', error.message);
     }
   }

   /**
    * Updates the bulk filename input with a default value based on page title and selected languages
    */
   function updateBulkFilename() {
     if (!bulkFilenameInput || selectedSubtitles.size === 0) return;
     
     chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
       const tab = tabs[0];
       const pageTitle = tab?.title || 'subtitles';
       
       const sanitizedTitle = pageTitle
         .replace(/[^a-zA-Z0-9\s]/g, '')
         .replace(/\s+/g, '_')
         .toLowerCase();
       
       const selectedLanguages = new Set();
       selectedSubtitles.forEach(subtitleId => {
         const subtitle = currentSubtitles[subtitleId];
         if (subtitle?.language && subtitle.language !== 'Unknown') {
           const langCode = languageNameToCode[subtitle.language.toLowerCase()] || 
                           subtitle.language.substring(0, 2).toLowerCase();
           selectedLanguages.add(langCode);
         }
       });
       
       let filename = sanitizedTitle;
       if (selectedLanguages.size > 0 && bulkAppendLanguageCheckbox?.checked) {
         const langSuffix = Array.from(selectedLanguages).sort().join('_');
         filename += `_${langSuffix}`;
       }
       
       bulkFilenameInput.value = filename;
     });
   }

   // Select all button event listener
  const selectAllBtn = document.getElementById('select-all-btn');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', function() {
      const allCheckboxes = subtitleList.querySelectorAll('.webtui-checkbox');
      const checkedBoxes = subtitleList.querySelectorAll('.webtui-checkbox:checked');
      const shouldSelectAll = checkedBoxes.length < allCheckboxes.length;

      allCheckboxes.forEach(checkbox => {
        const subtitleId = parseInt(checkbox.getAttribute('data-subtitle-id'));
        const subtitleItem = checkbox.closest('.webtui-subtitle-item');

        if (shouldSelectAll) {
          checkbox.checked = true;
          selectedSubtitles.add(subtitleId);
          subtitleItem.classList.add('selected');
        } else {
          checkbox.checked = false;
          selectedSubtitles.delete(subtitleId);
          subtitleItem.classList.remove('selected');
        }
      });

   updateSelectionUI();

   updateSelectionUI();
     });
    }



     // Download selected button
   if (downloadSelectedBtn) {
     downloadSelectedBtn.addEventListener('click', function() {
       if (selectedSubtitles.size === 0) {
         alert('Please select at least one subtitle to download.');
         return;
       }

        const format = formatSelect.value;
        const baseFilename = bulkFilenameInput?.value?.trim() || 'subtitles';
        const appendLanguage = bulkAppendLanguageCheckbox?.checked;
        
        // Get selected languages for consistent suffix generation
        const selectedLanguages = new Set();
        if (appendLanguage) {
          selectedSubtitles.forEach(subtitleId => {
            const subtitle = currentSubtitles[subtitleId];
            if (subtitle?.language && subtitle.language !== 'Unknown') {
              const langCode = languageNameToCode[subtitle.language.toLowerCase()] || 
                              subtitle.language.substring(0, 2).toLowerCase();
              selectedLanguages.add(langCode);
            }
          });
        }
        
        const languageSuffix = selectedLanguages.size > 0 
          ? `_${Array.from(selectedLanguages).sort().join('_')}` 
          : '';
        
        selectedSubtitles.forEach(subtitleId => {
          const subtitle = currentSubtitles[subtitleId];
          if (subtitle) {
            const customFilename = `${baseFilename}${languageSuffix}.${format}`;
            downloadSubtitle(subtitle.url, format, subtitle.language, customFilename);
          }
        });

      statusInfo.textContent = 'Download started';
      setTimeout(() => statusInfo.textContent = 'Ready', 2000);
    });
  }

  // Append language checkbox event listener
  if (bulkAppendLanguageCheckbox) {
    bulkAppendLanguageCheckbox.addEventListener('change', function() {
      // Update visual state
      const label = document.querySelector('label[for="bulk-append-language"]');
      if (label) {
        if (this.checked) {
          label.classList.add('checked');
        } else {
          label.classList.remove('checked');
        }
      }

      if (selectedSubtitles.size > 0) {
        updateBulkFilename();
      }
    });

    // Initialize visual state
    const label = document.querySelector('label[for="bulk-append-language"]');
    if (label && bulkAppendLanguageCheckbox.checked) {
      label.classList.add('checked');
    }
  }

  // Copy selected links button
  if (copySelectedBtn) {
  copySelectedBtn.addEventListener('click', function() {
    if (selectedSubtitles.size === 0) {
      alert('Please select at least one subtitle to copy.');
      return;
    }

    // Validate and filter URLs before copying
    const links = Array.from(selectedSubtitles)
      .map(subtitleId => currentSubtitles[subtitleId]?.url)
      .filter(url => url && typeof url === 'string' && url.startsWith('http'))
      .slice(0, APP_CONSTANTS.CLIPBOARD_LINK_LIMIT);

    if (links.length === 0) {
      alert('No valid subtitle URLs to copy.');
      return;
    }

    const linksText = links.join('\n');

      navigator.clipboard.writeText(linksText).then(function() {
        statusInfo.textContent = 'Links copied to clipboard';
        setTimeout(() => statusInfo.textContent = 'Ready', 2000);
      }).catch(function(err) {
        console.error('Failed to copy links:', err);
        statusInfo.textContent = 'Copy failed';
      });
    });
  }

  // Copy all visible links button
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', function() {
      // Get all visible subtitle URLs
      const visibleItems = document.querySelectorAll('.webtui-subtitle-item[style*="block"]');
      const links = Array.from(visibleItems)
        .map(item => {
          const subtitleId = parseInt(item.getAttribute('data-subtitle-id'));
          return currentSubtitles[subtitleId]?.url;
        })
        .filter(url => url && typeof url === 'string' && url.startsWith('http'))
    .slice(0, APP_CONSTANTS.CLIPBOARD_LINK_LIMIT);

      const linksText = links.join('\n');

      navigator.clipboard.writeText(linksText).then(function() {
        statusInfo.textContent = 'All links copied to clipboard';
        setTimeout(() => statusInfo.textContent = 'Ready', 2000);
      }).catch(function(err) {
        console.error('Failed to copy links:', err);
        statusInfo.textContent = 'Copy failed';
      });
    });
  }

  clearCacheBtn.addEventListener('click', function() {
    if (confirm('Clear all cached subtitle data? This will reset detection results.')) {
      // Clear chrome storage
      chrome.storage.local.clear(function() {
        // Cache cleared
      });

      // Clear memory cache
      chrome.runtime.sendMessage({action: 'clearMemoryCache'}, function(response) {
        if (chrome.runtime.lastError) {
          statusInfo.textContent = 'Warning: Could not clear cache completely';
        }
      });

      // Refresh the current display
      loadSubtitles();

      statusInfo.textContent = 'Cache cleared successfully';
          setTimeout(function() {
            statusInfo.textContent = 'Ready';
          }, 3000);
    }
  });



  // Filter functionality
  function initializeFilters() {
    // Language filter checkboxes
    const languageCheckboxes = document.querySelectorAll('.webtui-checkbox[data-lang]');
    languageCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        const lang = this.getAttribute('data-lang');
        if (this.checked) {
          languageFilters.add(lang);
        } else {
          languageFilters.delete(lang);
        }
        applyFilters();
      });
    });

    // Format filter checkboxes
    const formatCheckboxes = document.querySelectorAll('.webtui-checkbox[data-format]');
    formatCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        const format = this.getAttribute('data-format');
        if (this.checked) {
          formatFilters.add(format);
        } else {
          formatFilters.delete(format);
        }
        applyFilters();
      });
    });
  }

  function applyFilters() {
    const subtitleItems = document.querySelectorAll('.webtui-subtitle-item');
    let visibleCount = 0;
    let selectedVisibleCount = 0;

    subtitleItems.forEach(item => {
      const subtitleIndex = parseInt(item.getAttribute('data-subtitle-id'));
      const subtitle = currentSubtitles[subtitleIndex];

      if (!subtitle) return;

      let shouldShow = true;

      // Language filter
      if (languageFilters.size > 0) {
        const langName = subtitle.language ? subtitle.language.toLowerCase() : 'unknown';
        const subtitleLang = languageNameToCode[langName] || langName.substring(0, 2);
        shouldShow = shouldShow && languageFilters.has(subtitleLang);
      }

      // Format filter
      if (formatFilters.size > 0) {
        const subtitleFormat = subtitle.format ? subtitle.format.toLowerCase() : 'unknown';
        shouldShow = shouldShow && formatFilters.has(subtitleFormat);
      }

      // Show/hide item
      item.style.display = shouldShow ? 'block' : 'none';

      if (shouldShow) {
        visibleCount++;
        // Check if this visible item is selected
        const checkbox = item.querySelector('.webtui-checkbox');
        if (checkbox && checkbox.checked) {
          selectedVisibleCount++;
        }
      }
    });

    // Update the subtitle counter to show filtered count
    const subtitleCounter = document.getElementById('subtitle-counter');
    if (subtitleCounter) {
      subtitleCounter.textContent = visibleCount;
    }

    // Update selected count (total selected, not just visible)
    const selectedCountEl = document.getElementById('selected-count');
    if (selectedCountEl) {
      selectedCountEl.textContent = selectedSubtitles.size;
    }

    updateSelectionUI();
  }

  function updateDownloadStatus() {
    if (activeDownloads === 0) {
      statusInfo.textContent = 'Ready';
      hideDownloadProgress();
    } else if (activeDownloads === 1) {
      statusInfo.textContent = 'Downloading 1 file...';
    } else {
      statusInfo.textContent = `Downloading ${activeDownloads} files...`;
    }
  }

  function showDownloadProgress() {
    const progressEl = document.getElementById('download-progress');
    if (progressEl) {
      progressEl.style.display = 'block';
    }
  }

  function hideDownloadProgress() {
    const progressEl = document.getElementById('download-progress');
    if (progressEl) {
      progressEl.style.display = 'none';
    }
    // Clear all progress items
    activeDownloadItems.clear();
    const container = document.getElementById('progress-container');
    if (container) {
      container.innerHTML = '';
    }
  }

  function addDownloadProgress(url, filename) {
    const container = document.getElementById('progress-container');
    if (!container) return;

    const progressItem = document.createElement('div');
    progressItem.className = 'webtui-progress-item';
    progressItem.id = `progress-${Date.now()}`;

    const shortName = filename || url.split('/').pop() || 'Unknown file';
    const truncatedName = shortName.length > 30 ? shortName.substring(0, 27) + '...' : shortName;

    progressItem.innerHTML = `
      <div class="webtui-progress-text">${truncatedName}</div>
      <div class="webtui-progress-bar">
        <div class="webtui-progress-fill" style="width: 0%"></div>
      </div>
      <div class="webtui-progress-status">Starting download...</div>
    `;

    container.appendChild(progressItem);
    activeDownloadItems.set(url, progressItem);

    showDownloadProgress();
    return progressItem;
  }

  function updateDownloadProgress(url, progress, status) {
    const progressItem = activeDownloadItems.get(url);
    if (!progressItem) return;

    const fillEl = progressItem.querySelector('.webtui-progress-fill');
    const statusEl = progressItem.querySelector('.webtui-progress-status');

    if (fillEl && typeof progress === 'number') {
      fillEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }

    if (statusEl && status) {
      statusEl.textContent = status;
    }
  }

  function removeDownloadProgress(url) {
    const progressItem = activeDownloadItems.get(url);
    if (progressItem) {
      progressItem.remove();
      activeDownloadItems.delete(url);
    }

    // Hide progress area if no more downloads
    if (activeDownloadItems.size === 0) {
      setTimeout(hideDownloadProgress, 2000); // Hide after 2 seconds
    }
  }

  /**
   * Renders the subtitle list in the UI with language detection
   * @param {Array} subtitles - Array of subtitle objects to display
   */
  function displaySubtitles(subtitles) {
    // Add visual indicator that language detection is in progress
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = 'Detecting subtitle languages...';
    }

    // Clear previous selection state
    selectedSubtitles.clear();

    // Get or create the panel content container
    let panelContent = subtitleList.querySelector('.webtui-panel-content');
    if (!panelContent) {
      // Recreate the panel structure if it was removed
      subtitleList.innerHTML = `
        <div class="webtui-panel-header">Subtitle Results</div>
        <div class="webtui-panel-content">
          <div class="webtui-text">Scanning for subtitles...</div>
        </div>
      `;
      panelContent = subtitleList.querySelector('.webtui-panel-content');
    }

    // Clear only the panel content
    panelContent.innerHTML = '';

    if (subtitles.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'webtui-empty-state';
      emptyDiv.textContent = 'No subtitles detected yet.';
      const br = document.createElement('br');
      const tryDiv = document.createElement('span');
      tryDiv.textContent = 'Try refreshing or visiting a video page with embedded subtitles.';
      emptyDiv.appendChild(br);
      emptyDiv.appendChild(tryDiv);
      panelContent.appendChild(emptyDiv);
      return;
    }

    // Display subtitles with language detection
    subtitles.forEach(function(sub, index) {
      try {
        const language = sanitizeText(sub.language || 'Unknown');
        const format = sanitizeText(sub.format ? sub.format.toUpperCase() : 'VTT');
        const confidence = sub.confidence ? ' (' + Math.round(sub.confidence * 100) + '%)' : '';
        const urlDisplay = sanitizeText(sub.url); // Show full URL, no truncation

        // Create elements securely using DOM API
        const itemDiv = document.createElement('div');
        itemDiv.className = 'webtui-subtitle-item';
        itemDiv.setAttribute('data-subtitle-id', index.toString());

        const selectionDiv = document.createElement('div');
        selectionDiv.className = 'webtui-subtitle-selection';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'webtui-checkbox';
        checkbox.id = 'subtitle-' + index;
        checkbox.setAttribute('data-subtitle-id', index.toString());

        const label = document.createElement('label');
        label.className = 'webtui-checkbox-label';
        label.setAttribute('for', 'subtitle-' + index);

        selectionDiv.appendChild(checkbox);
        selectionDiv.appendChild(label);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'webtui-subtitle-info';

        const languageDiv = document.createElement('div');
        languageDiv.className = 'webtui-text webtui-subtitle-language';
        // Format as "Language:Confidence% Format:100%"
        const confidenceNum = confidence ? confidence.replace(/[()]/g, '').trim() : '100%';
        languageDiv.textContent = language + ':' + confidenceNum + ' ' + format + ':100%';

        // Store reference for async updates
        languageDiv.dataset.subtitleIndex = index.toString();
        languageDiv.dataset.originalText = languageDiv.textContent;

        const urlDiv = document.createElement('div');
        urlDiv.className = 'webtui-text webtui-subtitle-url';
        urlDiv.textContent = urlDisplay;

        infoDiv.appendChild(languageDiv);
        infoDiv.appendChild(urlDiv);

        itemDiv.appendChild(selectionDiv);
        itemDiv.appendChild(infoDiv);

        panelContent.appendChild(itemDiv);
        debugLog(`Rendered subtitle item ${index}: ${language} - ${urlDisplay.substring(0, 50)}...`);

        // Detect language asynchronously if not already known (non-blocking)
        if (sub.needsLanguageDetection && sub.language === 'Unknown') {
          // Show "Detecting..." initially instead of blocking
          languageDiv.textContent = 'Detecting... ' + format + ':100%';

          // Start detection in background (won't block UI if it fails)
          setTimeout(() => {
            detectLanguageForSubtitle(sub.url, languageDiv, index, format)
              .catch(error => {
                debugLog(`Language detection failed for ${sub.url}:`, error.message);
                // Fallback to filename-based detection
                const fallbackLanguage = detectLanguageFromFilename(sub.url);
                if (fallbackLanguage !== 'Unknown') {
                  languageDiv.textContent = fallbackLanguage + ':50% ' + format + ':100%';
                  // Update stored data
                  if (currentSubtitles && currentSubtitles[index]) {
                    currentSubtitles[index].language = fallbackLanguage;
                    currentSubtitles[index].confidence = 0.5;
                  }
                } else {
                  languageDiv.textContent = 'Unknown:0% ' + format + ':100%';
                }
              });
          }, 100); // Small delay to allow UI to render first
        }
      } catch (error) {
        errorLog(`Failed to render subtitle item ${index}:`, error);
        errorLog(`Subtitle data:`, sub);
      }
    });

      // Reset status after language detection starts
      setTimeout(() => {
        if (statusElement) {
          statusElement.textContent = 'Ready';
        }
      }, 1000);

      // Apply current filters
      applyFilters();
  }

  function sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';
    // Basic sanitization to prevent XSS
    return text.replace(/[<>]/g, '').trim();
  }

  // Smart Language Detection using advanced multi-tier approach
  function detectLanguageFromContent(content) {
    try {
    if (!smartLanguageDetector) {
      return { language: 'Unknown', confidence: 0 };
    }

    if (!content || content.length < 10) {
      return { language: 'Unknown', confidence: 0 };
    }

      // Preprocess subtitle content to extract actual translated dialogue
      const cleanContent = preprocessSubtitleContent(content);

      // Use Smart Language Detector
      const result = smartLanguageDetector.detectLanguage(cleanContent);

      if (!result || typeof result.language !== 'string') {
        return { language: 'Unknown', confidence: 0 };
      }

      const languageName = smartLanguageDetector.getLanguageName(result.language) || result.language;

      return {
        language: languageName,
        confidence: result.confidence
      };

    } catch (error) {
      errorLog('Error in detectLanguageFromContent:', error);
      return { language: 'Unknown', confidence: 0 };
    }
  }

  // Preprocess subtitle content (copied from background.js)
  function preprocessSubtitleContent(content) {
    if (!content) return '';

    // Split into lines
    const lines = content.split('\n');

    // Filter out unwanted lines
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;

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
    result = result.replace(/&[^;]+;/g, ' '); // Decode HTML entities
    result = result.replace(/\s+/g, ' ').trim();

    return result;
  }

  /**
   * Detects the language of a subtitle file asynchronously
   * @param {string} url - The subtitle file URL to analyze
   * @param {HTMLElement} languageDiv - DOM element to update with results
   * @param {number} subtitleIndex - Index in currentSubtitles array
   * @param {string} format - Subtitle format (vtt/srt/txt)
   * @returns {Promise<Object>} Language detection result with confidence
   */
  function detectLanguageForSubtitle(url, languageDiv, subtitleIndex, format) {
    return new Promise((resolve, reject) => {
      debugLog(`Starting language detection for ${url}`);

      // Prevent multiple concurrent requests for the same element
      if (languageDiv.dataset.detecting === 'true') {
        debugLog(`Language detection already in progress for ${url}, skipping`);
        resolve(); // Don't reject, just resolve
        return;
      }

      languageDiv.dataset.detecting = 'true';

      // Use background script to fetch content (avoids CORS issues in popup)
      chrome.runtime.sendMessage({
        action: 'fetchSubtitleContent',
        url: url,
        maxLength: APP_CONSTANTS.LANGUAGE_DETECTION_MAX_LENGTH
      }, function(response) {
        debugLog(`POPUP: Received response for ${url}:`, response ? 'success' : 'no response');

        // Clear the detecting flag
        languageDiv.dataset.detecting = 'false';

        if (chrome.runtime.lastError) {
          errorLog(`Chrome runtime error for ${url}:`, chrome.runtime.lastError);
          reject(new Error(`Runtime error: ${chrome.runtime.lastError.message}`));
          return;
        }

        if (!response || !response.success) {
          const errorMsg = response?.error || 'Unknown fetch error';
          errorLog(`Failed to fetch content for ${url}:`, errorMsg);
          reject(new Error(`Fetch failed: ${errorMsg}`));
          return;
        }

        try {
          // Detect language from content
          const languageInfo = detectLanguageFromContent(response.content);

          // Always update the UI, even with low confidence (better than "Unknown")
          const confidenceNum = Math.round(languageInfo.confidence * 100) + '%';
          const formatDisplay = format + ':100%';
          languageDiv.textContent = languageInfo.language + ':' + confidenceNum + ' ' + formatDisplay;

          // Update stored subtitle data
          if (currentSubtitles && currentSubtitles[subtitleIndex]) {
            currentSubtitles[subtitleIndex].language = languageInfo.language;
            currentSubtitles[subtitleIndex].confidence = languageInfo.confidence;
          }

          resolve(languageInfo);

        } catch (error) {
          errorLog(`Language detection processing error for ${url}:`, error);
          // Show error in UI but don't crash
          const formatDisplay = format + ':100%';
          languageDiv.textContent = 'Error:0% ' + formatDisplay;
          reject(error);
        }
      });
    });
  }

  // Fallback language detection from filename
  function detectLanguageFromFilename(url) {
    try {
      const filename = url.split('/').pop().split('?')[0].toLowerCase();

      // Look for language codes in filename (e.g., _en.vtt, -fr.srt, .de.vtt)
      const langPatterns = [
        /_([a-z]{2,3})\./,  // _en.vtt
        /-([a-z]{2,3})\./,  // -fr.srt
        /\.([a-z]{2,3})\./, // .de.vtt (less common)
      ];

      for (const pattern of langPatterns) {
        const match = filename.match(pattern);
        if (match) {
          const langCode = match[1];
          // Map common language codes to full names
          const langMap = {
            'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
            'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'ar': 'Arabic',
            'zh': 'Chinese', 'ja': 'Japanese', 'ko': 'Korean', 'hi': 'Hindi'
          };
          return langMap[langCode] || langCode.toUpperCase();
        }
      }
    } catch (error) {
      debugLog('Error in filename language detection:', error);
    }

    return 'Unknown';
  }

  // Validation functions
  function validateFormat(format) {
    const validFormats = ['vtt', 'srt', 'txt'];
    return validFormats.includes(format);
  }

  function validateLanguage(language) {
    if (!language || typeof language !== 'string') {
      return 'Unknown';
    }
    // Sanitize language name
    return language.replace(/[^a-zA-Z\s]/g, '').trim() || 'Unknown';
  }

   /**
    * Downloads a subtitle file with format conversion
    * @param {string} url - Subtitle file URL
    * @param {string} format - Target format (vtt/srt/txt)
    * @param {string} language - Detected language for filename
    * @param {string} customFilename - Optional custom filename (defaults to auto-generated)
    */
   function downloadSubtitle(url, format, language, customFilename) {
    // Validate inputs
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      errorLog('Invalid URL provided for download:', url);
      statusInfo.textContent = 'Error: Invalid subtitle URL';
      setTimeout(() => statusInfo.textContent = 'Ready', 2000);
      return;
    }

    if (!validateFormat(format)) {
      errorLog('Invalid format provided:', format);
      statusInfo.textContent = 'Error: Invalid format selected';
      setTimeout(() => statusInfo.textContent = 'Ready', 2000);
      return;
    }

    // Sanitize language
    language = validateLanguage(language);

    // Create filename
    const safeLanguage = (language || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = customFilename || `subtitles_${safeLanguage}.${format}`;

    // Add progress tracking
    addDownloadProgress(url, filename);
    updateDownloadProgress(url, 10, 'Fetching content...');

    activeDownloads++;
    updateDownloadStatus();

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      updateDownloadProgress(url, 0, 'Timeout - operation cancelled');
      setTimeout(() => removeDownloadProgress(url), 3000);
    }, APP_CONSTANTS.DOWNLOAD_TIMEOUT_MS);

    chrome.runtime.sendMessage({
      action: 'fetchSubtitleContent',
      url: url,
      maxLength: APP_CONSTANTS.SUBTITLE_FILE_SIZE_LIMIT,
      targetFormat: format // Pass the desired output format
    }, function(response) {
      clearTimeout(timeoutId);

      if (chrome.runtime.lastError) {
        errorLog('Download error:', chrome.runtime.lastError);
        updateDownloadProgress(url, 0, 'Error: ' + chrome.runtime.lastError.message);
        setTimeout(() => removeDownloadProgress(url), 5000);
        activeDownloads--;
        updateDownloadStatus();
        return;
      }

      if (!response || !response.success) {
        const errorMsg = response && response.error ? response.error : 'Unknown download error';
        errorLog('Download failed:', errorMsg);
        updateDownloadProgress(url, 0, 'Error: ' + errorMsg);
        setTimeout(() => removeDownloadProgress(url), 5000);
        activeDownloads--;
        updateDownloadStatus();
        return;
      }

      updateDownloadProgress(url, 50, 'Processing content...');

       // Use the converted content if available, otherwise use original
       const finalContent = response.convertedContent || response.content;
       let finalFormat = response.actualFormat || format;

       updateDownloadProgress(url, 80, 'Preparing download...');

       // Don't change filename to .txt if conversion failed - keep requested format
       if (finalFormat === 'txt' && format !== 'txt') {
         finalFormat = format;
       }

        const finalFilename = finalFormat !== format && !customFilename ?
          filename.replace(`.${format}`, `.${finalFormat}`) : filename;

       // Create blob with correct MIME type based on format
       const mimeTypes = {
         'vtt': 'text/vtt',
         'srt': 'application/x-subrip',
         'txt': 'text/plain',
         'ass': 'text/plain'
       };
       const mimeType = mimeTypes[finalFormat] || 'text/plain';
       const blob = new Blob([finalContent], { type: mimeType });
       const downloadUrl = URL.createObjectURL(blob);

      chrome.downloads.download({
        url: downloadUrl,
        filename: finalFilename,
        saveAs: false
      }, function(downloadId) {
        if (chrome.runtime.lastError) {
          errorLog('Download creation error:', chrome.runtime.lastError);
          updateDownloadProgress(url, 0, 'Error: ' + chrome.runtime.lastError.message);
          setTimeout(() => removeDownloadProgress(url), 5000);
        } else {
          updateDownloadProgress(url, 100, `Downloaded as ${finalFormat.toUpperCase()}`);
          setTimeout(() => removeDownloadProgress(url), 2000);
        }

        // Clean up
        URL.revokeObjectURL(downloadUrl);
        activeDownloads--;
        updateDownloadStatus();
      });
    });
  }

  // Auto-resize popup window based on content


  loadSubtitles();
  loadDebugInfo();
  initializeFilters();

  // For testing: populate currentSubtitles from DOM if empty
  if (currentSubtitles.length === 0) {
    const subtitleItems = document.querySelectorAll('.webtui-subtitle-item');
    subtitleItems.forEach((item, index) => {
      const langElement = item.querySelector('.webtui-subtitle-language');
      const urlElement = item.querySelector('.webtui-subtitle-url');

      if (langElement && urlElement) {
        const langText = langElement.textContent;
        const url = urlElement.textContent;

        // Parse language and confidence from display text like "Arabic:33805% VTT:100%"
        const langMatch = langText.match(/^([^:]+):/);
        const formatMatch = langText.match(/([A-Z]+):100%$/);

        const language = langMatch ? langMatch[1] : 'Unknown';
        const format = formatMatch ? formatMatch[1] : 'VTT';

        currentSubtitles.push({
          url: url,
          language: language,
          format: format,
          confidence: 0.8 // Default confidence
        });
      }
    });
    debugLog('Populated currentSubtitles from DOM:', currentSubtitles.length, 'items');

    // Apply filters to show/hide items based on current state
    applyFilters();

    // Attach event listeners to subtitle checkboxes using event delegation
    if (subtitleList) {
      subtitleList.addEventListener('change', function(event) {
        const target = event.target;
        if (target.classList.contains('webtui-checkbox') && target.hasAttribute('data-subtitle-id')) {
          try {
            const subtitleId = parseInt(target.getAttribute('data-subtitle-id'));
            const subtitleItem = target.closest('.webtui-subtitle-item');

            if (target.checked) {
              selectedSubtitles.add(subtitleId);
              if (subtitleItem) subtitleItem.classList.add('selected');
            } else {
              selectedSubtitles.delete(subtitleId);
              if (subtitleItem) subtitleItem.classList.remove('selected');
            }

            updateSelectionUI();
          } catch (error) {
            console.error('Error handling subtitle checkbox change:', error);
          }
        }
      });
    }
  }

  // Keyboard shortcuts for accessibility
  document.addEventListener('keydown', function(event) {
    // Don't trigger shortcuts when user is typing in inputs
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'r':
        // Refresh subtitles
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          refreshBtn.click();
        }
        break;
      case 'c':
        // Copy all links
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          copyAllBtn.click();
        }
        break;
      case 'd':
        // Download selected
        if (!event.ctrlKey && !event.metaKey && !downloadSelectedBtn.disabled) {
          event.preventDefault();
          downloadSelectedBtn.click();
        }
        break;
      case 's':
        // Select all / deselect all
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          selectAllBtn.click();
        }
        break;
      case 'escape':
        // Close popup (browser handles this, but good for consistency)
        window.close();
        break;
    }
  });

  // Enhanced focus management for accessibility
  document.addEventListener('focusin', function(event) {
    const target = event.target;
    if (target.classList.contains('webtui-checkbox')) {
      // Ensure checkbox container is visible when focused
      target.closest('.webtui-subtitle-item')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  });
});