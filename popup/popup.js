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
  const controls = document.getElementById('controls');

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
  let allSelected = true;

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
    controls.classList.add('hidden');

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

    if (statRequests) statRequests.textContent = String(total);
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
        btn.dataset.url = url;
        btn.textContent = fmt.toUpperCase();
        btn.setAttribute('aria-label', `Download as ${fmt.toUpperCase()}`);
        btn.tabIndex = 0;
        actionsDiv.appendChild(btn);
      });

      // Copy link button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-sm';
      copyBtn.dataset.action = 'copy';
      copyBtn.dataset.url = url;
      copyBtn.textContent = '\u2398';
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
    if (!url.startsWith('blob:')) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.text();
    }

    const tabs = await new Promise(function (resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (t) {
        resolve(t);
      });
    });
    const tabId = tabs && tabs[0] ? tabs[0].id : null;
    if (!tabId) throw new Error('No active tab');

    return await new Promise(function (resolve, reject) {
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
  }

  // ===========================================================================
  // Download
  // ===========================================================================

  /**
   * Download a single subtitle: fetch -> convert -> blob -> chrome.downloads
   */
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

        const blob = new Blob([converted], { type: 'text/plain;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const filename = `subtitle_${language}.${format}`;

        chrome.downloads.download(
          { url: blobUrl, filename: filename },
          () => {
            URL.revokeObjectURL(blobUrl);
            if (chrome.runtime.lastError) {
              statusText.textContent = 'Failed';
            } else {
              statusText.textContent = 'Downloaded';
            }
            setTimeout(() => resetDownloadState(), 2000);
          }
        );
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

        const blob = new Blob([converted], { type: 'text/plain;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const filename = `subtitle_${language}.${targetFormat}`;

        await new Promise((resolve, reject) => {
          chrome.downloads.download(
            { url: blobUrl, filename: filename },
            () => {
              URL.revokeObjectURL(blobUrl);
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            }
          );
        });

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
    allSelected = !allSelected;
    filteredSubtitles.forEach(s => {
      if (s.visible) s.selected = allSelected;
    });
    if (selectAllBtn) {
      selectAllBtn.textContent = allSelected ? '\u2611 Select All' : '\u2610 Deselect All';
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
        allSelected = true;
        if (selectAllBtn) selectAllBtn.textContent = '\u2611 Select All';
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
    const url = actionBtn.dataset.url;

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
    const url = actionBtn.dataset.url;

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
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    });
  }

  // --- Clear Cache ---
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', () => {
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
