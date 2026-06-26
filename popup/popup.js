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

        const activeNames = [];
        const checkedLangs = Array.from(langCheckboxes).filter(cb => cb.checked);
        if (checkedLangs.length > 0 && checkedLangs.length < langCheckboxes.length) {
          const labels = checkedLangs.map(function (cb) {
            return cb.nextElementSibling ? cb.nextElementSibling.textContent : cb.dataset.lang;
          });
          activeNames.push(labels.join(', '));
        }
        const checkedFormats = Array.from(formatCheckboxes).filter(cb => cb.checked);
        if (checkedFormats.length > 0 && checkedFormats.length < formatCheckboxes.length) {
          const labels = checkedFormats.map(function (cb) {
            return cb.nextElementSibling ? cb.nextElementSibling.textContent : cb.dataset.format;
          });
          activeNames.push(labels.join(', '));
        }
        if (activeNames.length > 0) {
          const filterInfo = document.createElement('div');
          filterInfo.className = 'terminal-text-muted';
          filterInfo.style.marginTop = '8px';
          filterInfo.textContent = 'Active filters: ' + activeNames.join(' / ');
          subtitleList.appendChild(filterInfo);
        }
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

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'sub-checkbox';
      checkbox.checked = sub.selected !== false;
      card.appendChild(checkbox);

      const infoDiv = document.createElement('div');
      infoDiv.className = 'subtitle-info';

      const langDiv = document.createElement('div');
      langDiv.className = 'subtitle-lang';
      langDiv.textContent = language;
      infoDiv.appendChild(langDiv);

      const metaDiv = document.createElement('div');
      metaDiv.className = 'subtitle-meta';
      metaDiv.textContent = `${safeLang}.${subtitleFormat} \u00B7 ${(confidence * 100).toFixed(0)}% \u00B7 ${source}`;
      infoDiv.appendChild(metaDiv);

      card.appendChild(infoDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'subtitle-actions';

      const formatSelect = document.createElement('select');
      formatSelect.className = 'card-format-select';
      ['vtt', 'srt', 'txt', 'ass', 'sbv', 'ssa', 'ttml'].forEach((fmt) => {
        const opt = document.createElement('option');
        opt.value = fmt;
        opt.textContent = fmt.toUpperCase();
        formatSelect.appendChild(opt);
      });
      actionsDiv.appendChild(formatSelect);

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'btn-sm card-download-btn';
      downloadBtn.dataset.action = 'download';
      downloadBtn.dataset.index = String(realIndex);
      downloadBtn.textContent = 'Download';
      downloadBtn.setAttribute('aria-label', 'Download subtitle');
      downloadBtn.tabIndex = 0;
      actionsDiv.appendChild(downloadBtn);

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
    let currentFile;
    if (progressContainer) {
      if (progressContainer.querySelector('.terminal-progress-bar')) {
        const fill = document.getElementById('progress-fill');
        if (fill) fill.style.width = '0%';
        const old = progressContainer.querySelector('.current-file');
        if (old) old.remove();
      } else {
        const progressBar = document.createElement('div');
        progressBar.className = 'terminal-progress-bar';
        const fill = document.createElement('div');
        fill.className = 'terminal-progress-bar-fill';
        fill.id = 'progress-fill';
        fill.style.width = '0%';
        progressBar.appendChild(fill);
        progressContainer.appendChild(progressBar);
      }
      currentFile = document.createElement('div');
      currentFile.className = 'current-file';
      progressContainer.appendChild(currentFile);
    }

    statusText.textContent = `Downloading ${total}...`;

    for (let i = 0; i < total; i++) {
      const sub = toDownload[i];
      const url = sub.url;
      const language = sub.language || 'Unknown';
      const filename = `subtitle_${language}.${targetFormat}`;

      if (currentFile) {
        currentFile.textContent = `Downloading: ${filename} (${i + 1} of ${total})`;
      }

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

        triggerDownload(converted, filename);
        success++;
      } catch (_err) {
        failed++;
      }

      updateProgressBar(i + 1, total);
      statusText.textContent = `Progress: ${success + failed}/${total}`;
    }

    if (currentFile) currentFile.textContent = '';
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
      selectAllBtn.textContent = newState ? 'Deselect All' : 'Select All';
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
        if (selectAllBtn) selectAllBtn.textContent = 'Select All';
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
      const select = card ? card.querySelector('.card-format-select') : null;
      const format = select ? select.value : 'vtt';
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
      const select = card ? card.querySelector('.card-format-select') : null;
      const format = select ? select.value : 'vtt';
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
