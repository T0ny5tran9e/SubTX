/**
 * SubTX — Popup UI Controller
 * State management, async subtitle queries, event delegation, keyboard nav.
 * Manifest V3 — Microsoft Edge subtitle extractor.
 *
 * DOM Contract: Uses exact IDs/classes/data-attributes from the spec.
 * No innerHTML for dynamic data. No per-button listeners (delegation only).
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // ===========================================================================
  // DOM References (exact IDs from contract)
  // ===========================================================================
  const subtitleList = document.getElementById('subtitle-list');
  const subtitleCount = document.getElementById('subtitle-count');
  const statusText = document.getElementById('status-text');
  const refreshBtn = document.getElementById('refresh-btn');
  const bulkFormat = document.getElementById('bulk-format');
  const bulkDownloadBtn = document.getElementById('bulk-download-btn');
  const viewLoading = document.getElementById('view-loading');
  const viewEmpty = document.getElementById('view-empty');
  const viewError = document.getElementById('view-error');
  const viewContent = document.getElementById('view-content');

  // ===========================================================================
  // State
  // ===========================================================================
  /** @type {Array<{language:string, url:string, format:string, confidence:number, source:string}>} */
  let currentSubtitles = [];
  let isDownloading = false;

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
        break;
      case 'error':
        viewError.classList.remove('hidden');
        break;
      case 'content':
        viewContent.classList.remove('hidden');
        controls.classList.remove('hidden');
        break;
    }
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
        // Filter to only subtitles matching the current tab
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
   * Render subtitle cards into the list.
   * Uses createElement / textContent / appendChild — NO innerHTML for data.
   * @param {Array} subtitles
   */
  function renderCards(subtitles) {
    // Clear previous content
    while (subtitleList.firstChild) {
      subtitleList.removeChild(subtitleList.firstChild);
    }

    currentSubtitles = subtitles;

    subtitles.forEach((sub, index) => {
      const confidence = typeof sub.confidence === 'number' ? sub.confidence : 0;
      const source = (sub.source || '').split('-')[0] || 'unknown';
      const subtitleFormat = sub.format || 'vtt';
      const language = sub.language || 'Unknown';
      const url = sub.url || '';
      const safeLang = language.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'unknown';

      // --- Card container ---
      const card = document.createElement('div');
      card.className = 'subtitle-card';

      // --- Language heading ---
      const langDiv = document.createElement('div');
      langDiv.className = 'subtitle-lang';
      langDiv.textContent = language;
      card.appendChild(langDiv);

      // --- Metadata row ---
      const metaDiv = document.createElement('div');
      metaDiv.className = 'subtitle-meta';
      metaDiv.textContent = `${safeLang}.${subtitleFormat} \u00B7 ${(confidence * 100).toFixed(0)}% \u00B7 ${source}`;
      card.appendChild(metaDiv);

      // --- Actions row ---
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'subtitle-actions';

      // Format buttons: SRT, VTT, TXT
      const formats = ['srt', 'vtt', 'txt'];
      formats.forEach((fmt) => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.dataset.action = 'download';
        btn.dataset.format = fmt;
        btn.dataset.index = String(index);
        btn.dataset.url = url;
        btn.textContent = fmt.toUpperCase();
        btn.setAttribute('aria-label', `Download as ${fmt.toUpperCase()}`);
        btn.tabIndex = 0;
        actionsDiv.appendChild(btn);
      });

      // Copy link button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-sm btn-icon';
      copyBtn.dataset.action = 'copy';
      copyBtn.dataset.url = url;
      copyBtn.textContent = '\u2398'; // ⎘
      copyBtn.setAttribute('aria-label', 'Copy subtitle URL');
      copyBtn.tabIndex = 0;
      actionsDiv.appendChild(copyBtn);

      card.appendChild(actionsDiv);
      subtitleList.appendChild(card);
    });

    // Update count badge
    subtitleCount.textContent = `${subtitles.length} found`;
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  /**
   * Download a single subtitle: fetch -> convert -> blob -> chrome.downloads
   * @param {string} url     Subtitle URL to fetch
   * @param {string} format  Target format: 'srt' | 'vtt' | 'txt'
   * @param {number} index   Index into currentSubtitles
   */
  function handleDownload(url, format, index) {
    if (isDownloading) return;
    if (!url) {
      statusText.textContent = 'Invalid URL';
      return;
    }

    isDownloading = true;
    refreshBtn.disabled = true;
    bulkDownloadBtn.disabled = true;
    statusText.textContent = 'Downloading...';

    const sub = currentSubtitles[index];
    const language = sub && sub.language ? sub.language : 'Unknown';

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return response.text();
      })
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
   * Bulk download all current subtitles sequentially.
   * Sequential (not parallel) to avoid Chrome downloads API throttling.
   */
  async function handleBulkDownload() {
    if (isDownloading || currentSubtitles.length === 0) return;

    isDownloading = true;
    refreshBtn.disabled = true;
    bulkDownloadBtn.disabled = true;

    const targetFormat = bulkFormat.value;
    let success = 0;
    let failed = 0;
    const total = currentSubtitles.length;

    statusText.textContent = `Downloading ${total} subtitles...`;

    for (let i = 0; i < total; i++) {
      const sub = currentSubtitles[i];
      const url = sub.url;
      const language = sub.language || 'Unknown';

      if (!url) {
        failed++;
        statusText.textContent = `Downloading... ${success + failed}/${total}`;
        continue;
      }

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const rawContent = await response.text();

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

      statusText.textContent = `Downloading... ${success + failed}/${total}`;
    }

    statusText.textContent = `Downloaded ${success}/${total}`;
    setTimeout(() => resetDownloadState(), 2000);
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
      // Fallback: execCommand for older contexts
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

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /** Reset download state and re-enable controls. */
  function resetDownloadState() {
    isDownloading = false;
    refreshBtn.disabled = false;
    bulkDownloadBtn.disabled = false;
    maybeResetStatus();
  }

  /** Reset status text to 'Ready' if not in an active operation. */
  function maybeResetStatus() {
    if (!isDownloading) {
      statusText.textContent = 'Ready';
    }
  }

  /**
   * Full refresh: re-query content + background, re-render.
   */
  async function refreshSubtitles() {
    showState('loading');
    currentSubtitles = [];

    try {
      const subtitles = await querySubtitles();

      if (subtitles.length > 0) {
        renderCards(subtitles);
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
  // Event Listeners (delegation pattern — no per-button listeners)
  // ===========================================================================

  // --- Subtitle card action buttons via delegation ---
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

  // --- Refresh button ---
  refreshBtn.addEventListener('click', () => {
    if (!isDownloading) {
      refreshSubtitles();
    }
  });

  // --- Bulk download button ---
  bulkDownloadBtn.addEventListener('click', () => {
    handleBulkDownload();
  });

  // --- Scan Page button (inside #view-empty) ---
  viewEmpty.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'scan-btn' || btn.dataset.action === 'scan') {
      refreshSubtitles();
    }
  });

  // --- Retry button (inside #view-error) ---
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
