/**
 * SubTX — Popup UI Controller
 * Terminal-themed subtitle detection & download UI for Manifest V3.
 *
 * DOM Contract: IDs/classes mirror popup.html panel structure.
 * No innerHTML for dynamic data. Delegation-only event handling.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // ===========================================================================
  // DOM References
  // ===========================================================================
  const subtitleList = document.getElementById('subtitle-list');
  const subtitleCount = document.getElementById('subtitle-count');
  const statusText = document.getElementById('status-text');
  const refreshBtn = document.getElementById('refresh-btn');
  const bulkFormat = document.getElementById('bulk-format');
  const bulkDownloadBtn = document.getElementById('download-selected-btn');

  // View states
  const viewLoading = document.getElementById('view-loading');
  const viewEmpty = document.getElementById('view-empty');
  const viewError = document.getElementById('view-error');
  const viewContent = document.getElementById('view-content');
  // Stats panel
  const statRequests = document.getElementById('stat-requests');
  const statSubtitles = document.getElementById('stat-subtitles');
  const subtitleCounter = document.getElementById('subtitle-counter');
  const selectedCount = document.getElementById('selected-count');

  // Buttons
  const copyLinksBtn = document.getElementById('copy-links-btn');
  const copyAllBtn = document.getElementById('copy-all-btn');
  const selectAllBtn = document.getElementById('select-all-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  const bulkFilename = document.getElementById('bulk-filename');
  const bulkAppendLang = document.getElementById('bulk-append-language');

  // Progress
  const downloadProgress = document.getElementById('download-progress');
  const progressContainer = document.getElementById('progress-container');

  // Filter checkboxes
  const langCheckboxes = document.querySelectorAll('#language-filters .terminal-checkbox');
  const formatCheckboxes = document.querySelectorAll('#format-filters .terminal-checkbox');

  // ===========================================================================
  // SVG Icons
  // ===========================================================================
  const ICONS = {
    refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"/></svg>`,
    copy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>`,
    copyAll: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>`,
    selectAll: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    deselectAll: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281zM15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
    clear: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>`,
    scan: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>`,
  };

  // ===========================================================================
  // State
  // ===========================================================================
  /** @type {Array<{language:string, url:string, format:string, confidence:number, source:string}>} */
  let currentSubtitles = [];
  let filteredSubtitles = [];
  let isDownloading = false;
  let totalIntercepted = 0;

  // ===========================================================================
  // State Management
  // ===========================================================================

  /**
   * Show one state view, hide all others.
   * @param {'loading'|'empty'|'error'|'content'} state
   */
  function showState(state) {
    viewLoading.classList.add('hidden');
    viewEmpty.classList.add('hidden');
    viewError.classList.add('hidden');
    viewContent.classList.add('hidden');
    switch (state) {
      case 'loading':
        viewLoading.classList.remove('hidden');
        statusText.textContent = 'Scanning...';
        break;
      case 'empty':
        viewEmpty.classList.remove('hidden');
        statusText.textContent = 'No subtitles';
        break;
      case 'error':
        viewError.classList.remove('hidden');
        statusText.textContent = 'Error';
        break;
      case 'content':
        viewContent.classList.remove('hidden');
        statusText.textContent = 'Ready';
        break;
    }
  }

  /**
   * Update stats panel values.
   */
  function updateStats() {
    const total = currentSubtitles.length;
    const visible = filteredSubtitles.length;
    const selected = filteredSubtitles.filter(s => s.selected).length;

    if (statRequests) statRequests.textContent = String(totalIntercepted);
    if (statSubtitles) statSubtitles.textContent = String(total);
    if (subtitleCounter) subtitleCounter.textContent = String(visible);
    if (selectedCount) selectedCount.textContent = String(selected);
    if (subtitleCount) subtitleCount.textContent = visible > 0 ? String(visible) : '';

    // Update bulk buttons state
    const hasSelection = selected > 0;
    if (bulkDownloadBtn) bulkDownloadBtn.disabled = !hasSelection;
    if (copyLinksBtn) copyLinksBtn.disabled = !hasSelection;
    if (bulkFilename) bulkFilename.disabled = !hasSelection;
    if (bulkAppendLang) bulkAppendLang.disabled = !hasSelection;

    const hasSubtitles = filteredSubtitles.length > 0;
    if (bulkFilename) {
      bulkFilename.classList.toggle('controls-disabled', !hasSubtitles);
    }
    if (bulkAppendLang) {
      bulkAppendLang.classList.toggle('controls-disabled', !hasSubtitles);
    }

    if (copyAllBtn) {
      copyAllBtn.title = hasSubtitles
        ? 'Copy All URLs (Ctrl+Shift+C)'
        : 'Select subtitles first';
    }
  }

  /**
   * Apply language and format filters to currentSubtitles.
   * @returns {Array} Filtered subtitle array with .selected flag.
   */
  function applyFilters() {
    const activeLangs = new Set();
    langCheckboxes.forEach(cb => {
      if (cb.checked) activeLangs.add(cb.dataset.lang);
    });

    const activeFormats = new Set();
    formatCheckboxes.forEach(cb => {
      if (cb.checked) activeFormats.add(cb.dataset.format);
    });

    filteredSubtitles = currentSubtitles.map(sub => {
      const langMatch = activeLangs.size === 0 || activeLangs.has((sub.language || '').toLowerCase().slice(0, 2));
      const fmtMatch = activeFormats.size === 0 || activeFormats.has((sub.format || 'vtt').toLowerCase());
      return { ...sub, visible: langMatch && fmtMatch, selected: sub.selected !== false };
    });

    renderFilteredCards();
    updateStats();
    return filteredSubtitles;
  }

  /**
   * Reset all language/format filters to their default (all checked) state.
   */
  function resetAllFilters() {
    langCheckboxes.forEach(cb => cb.checked = true);
    formatCheckboxes.forEach(cb => cb.checked = true);
    applyFilters();
  }

  // ===========================================================================
  // Subtitle Queries
  // ===========================================================================

  /**
   * Query subtitles from content script, fall back to background worker.
   * @returns {Promise<Array>} Array of subtitle objects or empty array.
   */
  async function querySubtitles() {
    // --- Attempt 1: Content script ---
    try {
      const tabs = await new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!result || result.length === 0) {
            reject(new Error('No active tab found'));
            return;
          }
          resolve(result);
        });
      });

      const tab = tabs[0];
      if (!tab || !tab.id) {
        throw new Error('Invalid tab');
      }

      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { action: 'getSubtitles' }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(res);
        });
      });

      if (response && Array.isArray(response.subtitles) && response.subtitles.length > 0) {
        const now = Date.now();
        totalIntercepted += response.subtitles.length;
        return response.subtitles.map((s, i) => ({
          ...s,
          source: s.source || 'content-script',
          timestamp: s.timestamp || now + i
        }));
      }
    } catch (_err) {
      // Content script unavailable — fall through to background
    }

    // --- Attempt 2: Background service worker ---
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getDetectedSubtitles' }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(res);
        });
      });

      if (Array.isArray(result) && result.length > 0) {
        const tabs = await new Promise((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (t) => resolve(t));
        });
        const currentTabId = tabs && tabs[0] ? tabs[0].id : null;

        let subtitles = result;
        if (currentTabId != null) {
          const filtered = result.filter((s) => s.tabId == null || s.tabId === currentTabId);
          if (filtered.length > 0) {
            subtitles = filtered;
          }
        }

        totalIntercepted += subtitles.length;
        return subtitles.map((s) => ({
          language: s.language || 'Unknown',
          url: s.url || '',
          format: s.format || 'vtt',
          confidence: typeof s.confidence === 'number' ? s.confidence : 0.7,
          source: s.source || 'webrequest',
          timestamp: s.timestamp || Date.now()
        }));
      }
    } catch (_err) {
      // Background also failed
    }

    return [];
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  /**
   * Render filtered subtitle cards into list.
   * createElement / textContent / appendChild — NO innerHTML for data.
   */
  function renderFilteredCards() {
    while (subtitleList.firstChild) {
      subtitleList.removeChild(subtitleList.firstChild);
    }

    const visible = filteredSubtitles.filter(s => s.visible);

    if (visible.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'terminal-text-muted';
      emptyMsg.textContent = 'No subtitles match current filters.';
      subtitleList.appendChild(emptyMsg);

      // Check if any filter checkbox is unchecked (filters are active)
      const filtersActive = Array.from(langCheckboxes).some(cb => !cb.checked) ||
                            Array.from(formatCheckboxes).some(cb => !cb.checked);
      if (filtersActive) {
        const resetLink = document.createElement('span');
        resetLink.className = 'text-link';
        resetLink.textContent = 'Reset Filters';
        resetLink.tabIndex = 0;
        resetLink.setAttribute('role', 'button');
        resetLink.addEventListener('click', resetAllFilters);
        subtitleList.appendChild(document.createTextNode(' '));
        subtitleList.appendChild(resetLink);
      }

      return;
    }

    visible.forEach((sub, displayIndex) => {
      const realIndex = currentSubtitles.indexOf(sub);
      const confidence = typeof sub.confidence === 'number' ? sub.confidence : 0;
      const source = (sub.source || '').split('-')[0] || 'unknown';
      const subtitleFormat = sub.format || 'vtt';
      const language = sub.language || 'Unknown';
      const url = sub.url || '';
      const safeLang = language.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'unknown';

      // Card container
      const card = document.createElement('div');
      card.className = 'subtitle-card';
      card.dataset.index = String(realIndex);
      card.dataset.url = url;

      // Selection checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'sub-checkbox';
      checkbox.checked = sub.selected !== false;
      card.appendChild(checkbox);

      // Language heading
      const langDiv = document.createElement('div');
      langDiv.className = 'subtitle-lang';
      langDiv.textContent = language;
      card.appendChild(langDiv);

      // Metadata row
      const metaDiv = document.createElement('div');
      metaDiv.className = 'subtitle-meta';
      metaDiv.textContent = `${safeLang}.${subtitleFormat} \u00B7 ${(confidence * 100).toFixed(0)}% \u00B7 ${source}`;
      card.appendChild(metaDiv);

      // Actions row
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'subtitle-actions';

      const formats = ['srt', 'vtt', 'txt'];
      formats.forEach((fmt) => {
        const btn = document.createElement('button');
        btn.className = 'btn-sm';
        btn.dataset.action = 'download';
        btn.dataset.format = fmt;
        btn.dataset.index = String(realIndex);
        btn.textContent = fmt.toUpperCase();
        btn.setAttribute('aria-label', `Download as ${fmt.toUpperCase()}`);
        btn.tabIndex = 0;
        actionsDiv.appendChild(btn);
      });

      // Copy link button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-sm';
      copyBtn.dataset.action = 'copy';
      copyBtn.innerHTML = ICONS.copy + ' ';
      copyBtn.setAttribute('aria-label', 'Copy subtitle URL');
      copyBtn.tabIndex = 0;
      actionsDiv.appendChild(copyBtn);

      card.appendChild(actionsDiv);
      subtitleList.appendChild(card);
    });
  }

  // ===========================================================================
  // Subtitle Content Fetching
  // ===========================================================================

  /**
   * Fetch subtitle content, supporting blob: URLs via content script delegation.
   * @param {string} url - Subtitle URL (may be blob:)
   * @returns {Promise<string>} Subtitle text content
   */
  async function fetchSubtitleContent(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const tabs = await new Promise(function (resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (t) {
        resolve(t);
      });
    });
    const tabId = tabs && tabs[0] ? tabs[0].id : null;

    if (tabId) {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 10000);
        });
        const messagePromise = new Promise(function (resolve, reject) {
          chrome.tabs.sendMessage(tabId, { action: 'fetchSubtitleContent', url: url }, function (res) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (res && res.error) {
              reject(new Error(res.error));
              return;
            }
            if (res && res.content) {
              resolve(res.content);
            } else {
              reject(new Error('Empty response'));
            }
          });
        });
        const result = await Promise.race([messagePromise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
      } catch (_msgErr) {
        // Timeout or error - fall through to fetch
      }
    }

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.text();
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') return null;
      throw fetchErr;
    }
  }

  // ===========================================================================
  // Download
  // ===========================================================================

  /**
   * Download a single subtitle: fetch -> convert -> anchor download
   */
  function triggerDownload(content, filename) {
    try {
      statusText.textContent = 'Downloading...';
      const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => { statusText.textContent = '\u2713 Done'; }, 200);
    } catch (err) {
      console.error('[SubTX] Download error:', err);
      statusText.textContent = 'Error';
    }
  }

  function handleDownload(url, format, index) {
    if (isDownloading) return;
    if (!url) {
      statusText.textContent = 'Invalid URL';
      return;
    }

    isDownloading = true;
    refreshBtn.disabled = true;
    if (bulkDownloadBtn) bulkDownloadBtn.disabled = true;
    statusText.textContent = 'Downloading...';

    const sub = currentSubtitles[index];
    const language = sub && sub.language ? sub.language : 'Unknown';

    fetchSubtitleContent(url)
      .then((rawContent) => {
        let converted;
        try {
          const converter = new SubtitleConverter();
          converted = converter.convert(rawContent, 'vtt', format);
        } catch (_convErr) {
          converted = rawContent;
        }

        const filename = `subtitle_${language}.${format}`;
        triggerDownload(converted, filename);
        statusText.textContent = 'Downloaded';
        setTimeout(() => resetDownloadState(), 2000);
      })
      .catch((error) => {
        console.error('[SubTX] Download error:', error);
        statusText.textContent = 'Error';
        setTimeout(() => resetDownloadState(), 2000);
      });
  }

  /**
   * Bulk download all visible subtitles sequentially.
   */
  async function handleBulkDownload() {
    if (isDownloading) return;

    const toDownload = filteredSubtitles.filter(s => s.visible && s.selected);
    if (toDownload.length === 0) return;

    isDownloading = true;
    refreshBtn.disabled = true;
    if (bulkDownloadBtn) bulkDownloadBtn.disabled = true;

    const targetFormat = bulkFormat ? bulkFormat.value : 'vtt';
    let success = 0;
    let failed = 0;
    const total = toDownload.length;

    // Show progress panel
    if (downloadProgress) downloadProgress.hidden = false;
    if (progressContainer) {
      while (progressContainer.firstChild) progressContainer.removeChild(progressContainer.firstChild);
      const progressBar = document.createElement('div');
      progressBar.className = 'terminal-progress-bar';
      const fill = document.createElement('div');
      fill.className = 'terminal-progress-bar-fill';
      fill.id = 'progress-fill';
      fill.style.width = '0%';
      progressBar.appendChild(fill);
      progressContainer.appendChild(progressBar);
    }

    statusText.textContent = `Downloading ${total}...`;

    for (let i = 0; i < total; i++) {
      const sub = toDownload[i];
      const url = sub.url;
      const language = sub.language || 'Unknown';

      if (!url) {
        failed++;
        updateProgressBar(i + 1, total);
        statusText.textContent = `Progress: ${success + failed}/${total}`;
        continue;
      }

      try {
        const rawContent = await fetchSubtitleContent(url);
        let converted;
        try {
          const converter = new SubtitleConverter();
          converted = converter.convert(rawContent, 'vtt', targetFormat);
        } catch (_convErr) {
          converted = rawContent;
        }

        const filename = `subtitle_${language}.${targetFormat}`;
        triggerDownload(converted, filename);
        success++;
      } catch (_err) {
        failed++;
      }

      updateProgressBar(i + 1, total);
      statusText.textContent = `Progress: ${success + failed}/${total}`;
    }

    statusText.textContent = `Done: ${success}/${total}`;
    if (downloadProgress) {
      setTimeout(() => { downloadProgress.hidden = true; }, 3000);
    }
    setTimeout(() => resetDownloadState(), 2000);
  }

  function updateProgressBar(current, total) {
    const fill = document.getElementById('progress-fill');
    if (fill) {
      const pct = Math.round((current / total) * 100);
      fill.style.width = pct + '%';
    }
  }

  /**
   * Copy subtitle URL to clipboard.
   * @param {string} url
   */
  async function handleCopy(url) {
    if (!url) {
      statusText.textContent = 'No URL';
      setTimeout(() => maybeResetStatus(), 1500);
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      statusText.textContent = 'Copied!';
    } catch (_clipErr) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        statusText.textContent = 'Copied!';
      } catch (_fallbackErr) {
        statusText.textContent = 'Copy failed';
      }
    }

    setTimeout(() => maybeResetStatus(), 1500);
  }

  /**
   * Copy all visible subtitle URLs.
   */
  function handleCopyAll() {
    const urls = filteredSubtitles
      .filter(s => s.visible)
      .map(s => s.url)
      .filter(Boolean);

    if (urls.length === 0) {
      statusText.textContent = 'No URLs';
      setTimeout(() => maybeResetStatus(), 1500);
      return;
    }

    const text = urls.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      statusText.textContent = `Copied ${urls.length} URLs`;
      setTimeout(() => maybeResetStatus(), 1500);
    }).catch(() => {
      statusText.textContent = 'Copy failed';
      setTimeout(() => maybeResetStatus(), 1500);
    });
  }

  /**
   * Toggle select all / deselect all for visible subtitles.
   */
  function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.subtitle-card .sub-checkbox');
    const checkedCount = [...checkboxes].filter(cb => cb.checked).length;
    const allChecked = checkedCount === checkboxes.length && checkboxes.length > 0;
    const newState = !allChecked;

    filteredSubtitles.forEach(s => {
      if (s.visible) s.selected = newState;
    });

    currentSubtitles.forEach(s => {
      s.selected = newState;
    });

    checkboxes.forEach(cb => { cb.checked = newState; });

    if (selectAllBtn) {
      selectAllBtn.innerHTML = newState ? (ICONS.deselectAll + ' Deselect All') : (ICONS.selectAll + ' Select All');
    }
    updateStats();
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  function resetDownloadState() {
    isDownloading = false;
    refreshBtn.disabled = false;
    if (bulkDownloadBtn) bulkDownloadBtn.disabled = false;
    maybeResetStatus();
  }

  function maybeResetStatus() {
    if (!isDownloading) {
      statusText.textContent = 'Ready';
    }
  }

  /**
   * Full refresh: re-query, re-filter, re-render.
   */
  async function refreshSubtitles() {
    showState('loading');
    currentSubtitles = [];

    try {
      const subtitles = await querySubtitles();

      if (subtitles.length > 0) {
        currentSubtitles = subtitles.map(s => ({ ...s, selected: true }));
        if (selectAllBtn) selectAllBtn.innerHTML = ICONS.selectAll + ' Select All';
        applyFilters();
        showState('content');
        statusText.textContent = 'Ready';
      } else {
        showState('empty');
        statusText.textContent = 'No subtitles found';
      }
    } catch (_err) {
      showState('error');
      statusText.textContent = 'Error scanning';
    }
  }

  // ===========================================================================
  // Event Listeners (Delegation Only)
  // ===========================================================================

  // --- Subtitle card action buttons ---
  subtitleList.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const card = actionBtn.closest('.subtitle-card');
    const url = card ? card.dataset.url : '';

    if (action === 'download') {
      const format = actionBtn.dataset.format;
      const index = parseInt(actionBtn.dataset.index, 10);
      if (!isNaN(index)) {
        handleDownload(url, format, index);
      }
    } else if (action === 'copy') {
      handleCopy(url);
    }
  });

  // --- Keyboard navigation for subtitle action buttons ---
  subtitleList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    e.preventDefault();

    const action = actionBtn.dataset.action;
    const card = actionBtn.closest('.subtitle-card');
    const url = card ? card.dataset.url : '';

    if (action === 'download') {
      const format = actionBtn.dataset.format;
      const index = parseInt(actionBtn.dataset.index, 10);
      if (!isNaN(index)) {
        handleDownload(url, format, index);
      }
    } else if (action === 'copy') {
      handleCopy(url);
    }
  });

  // --- Refresh ---
  refreshBtn.addEventListener('click', () => {
    if (!isDownloading) {
      refreshSubtitles();
    }
  });

  // --- Bulk download selected ---
  if (bulkDownloadBtn) {
    bulkDownloadBtn.addEventListener('click', () => {
      handleBulkDownload();
    });
  }

  // --- Copy links (selected) ---
  if (copyLinksBtn) {
    copyLinksBtn.addEventListener('click', () => {
      const urls = filteredSubtitles
        .filter(s => s.visible && s.selected)
        .map(s => s.url)
        .filter(Boolean);

      if (urls.length === 0) {
        statusText.textContent = 'Nothing selected';
        setTimeout(() => maybeResetStatus(), 1500);
        return;
      }

      navigator.clipboard.writeText(urls.join('\n')).then(() => {
        statusText.textContent = `Copied ${urls.length} URLs`;
        setTimeout(() => maybeResetStatus(), 1500);
      });
    });
  }

  // --- Copy all links ---
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', handleCopyAll);
  }

  // --- Select All / Deselect All ---
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', toggleSelectAll);
  }

  // --- Settings ---
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (typeof chrome.runtime.openOptionsPage === 'function') {
        try {
          chrome.runtime.openOptionsPage();
        } catch (_e) {
          statusText.textContent = 'No options page available';
        }
      } else {
        statusText.textContent = 'No options page available';
      }
    });
  }

  // --- Clear Cache ---
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', () => {
      if (!confirm('Clear all cached subtitle data and settings? This cannot be undone.')) return;
      chrome.storage.local.clear(() => {
        statusText.textContent = 'Cache cleared';
        setTimeout(() => maybeResetStatus(), 2000);
      });
    });
  }

  // --- Filter checkboxes ---
  const allFilterCheckboxes = document.querySelectorAll('.terminal-checkbox');
  allFilterCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      if (currentSubtitles.length > 0) {
        applyFilters();
      }
    });
  });

  // --- Scan button (inside empty state) ---
  viewEmpty.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'scan-btn' || btn.dataset.action === 'scan') {
      refreshSubtitles();
    }
  });

  // --- Retry button (inside error state) ---
  viewError.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'retry-btn' || btn.dataset.action === 'retry') {
      refreshSubtitles();
    }
  });

  // ===========================================================================
  // Initialize
  // ===========================================================================
  refreshSubtitles();
});
