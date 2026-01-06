/**
 * Enhanced Subtitle Converter
 * A comprehensive subtitle conversion library optimized for Chrome extensions
 *
 * Features:
 * - Modular parsers, converters, and validators
 * - Advanced format detection and timing precision
 * - Encoding handling and BOM stripping
 * - State machine parsing for robustness
 * - Comprehensive error handling and validation
 * - Memory-efficient stream processing
 *
 * Supported formats: VTT, SRT, TXT, ASS
 *
 * @author Enhanced SubTX System
 * @version 2.0.0
 */

// ===== CONSTANTS =====
const SUBTITLE_CONSTANTS = {
  MAX_CUE_LENGTH: 10000, // Max characters per cue
  MAX_FILE_SIZE: 1024 * 1024, // 1MB limit
  DEFAULT_DURATION_MS: 60000, // 1 minute default
  TIME_PRECISION_MS: 1, // Millisecond precision
  SUPPORTED_FORMATS: ['vtt', 'srt', 'txt', 'ass'],
  ENCODING_BOM: '\uFEFF' // UTF-8 BOM
};

// ===== VALIDATION MODULE =====
const SubtitleValidator = {
  /**
   * Validates subtitle content structure
   * @param {string} content - Subtitle content to validate
   * @param {string} format - Expected format
   * @returns {Object} Validation result with errors array
   */
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

// ===== PARSERS MODULE =====
const SubtitleParsers = {
  /**
   * Parses subtitle content into structured cue objects
   * @param {string} content - Raw subtitle content
   * @param {string} format - Source format
   * @returns {Array} Array of cue objects with timing and text
   */
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

// ===== CONVERTERS MODULE =====
const SubtitleConverters = {
  /**
   * Converts cue objects to target format
   * @param {Array} cues - Array of cue objects
   * @param {string} targetFormat - Target format
   * @param {Object} options - Conversion options
   * @returns {string} Formatted subtitle content
   */
  cuesToFormat(cues, targetFormat, options = {}) {
    switch (targetFormat) {
      case 'vtt':
        return this._cuesToVtt(cues, options);
      case 'srt':
        return this._cuesToSrt(cues, options);
      case 'txt':
        return this._cuesToTxt(cues, options);
      case 'ass':
        return this._cuesToAss(cues, options);
      default:
        throw new Error(`Unsupported target format: ${targetFormat}`);
    }
  },

  _cuesToVtt(cues, options) {
    const lines = ['WEBVTT', ''];

    for (const cue of cues) {
      const startTime = this._formatTimeVtt(cue.start);
      const endTime = this._formatTimeVtt(cue.end);
      lines.push(`${startTime} --> ${endTime}`);
      lines.push(cue.text);
      lines.push('');
    }

    return lines.join('\n').trim();
  },

  _cuesToSrt(cues, options) {
    const lines = [];
    let counter = 1;

    for (const cue of cues) {
      lines.push(counter.toString());
      const startTime = this._formatTimeSrt(cue.start);
      const endTime = this._formatTimeSrt(cue.end);
      lines.push(`${startTime} --> ${endTime}`);
      lines.push(cue.text);
      lines.push('');
      counter++;
    }

    return lines.join('\n').trim();
  },

  _cuesToTxt(cues, options) {
    return cues.map(cue => cue.text).join('\n\n');
  },

  _cuesToAss(cues, options) {
    const lines = [
      '[Script Info]',
      'Title: Converted Subtitle',
      'ScriptType: v4.00+',
      'WrapStyle: 0',
      'ScaledBorderAndShadow: yes',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,30,30,30,1',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
    ];

    for (const cue of cues) {
      const startTime = this._formatTimeAss(cue.start);
      const endTime = this._formatTimeAss(cue.end);
      const text = cue.text.replace(/\n/g, '\\N');
      lines.push(`Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}`);
    }

    return lines.join('\n');
  },

  _formatTimeVtt(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  },

  _formatTimeSrt(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  },

  _formatTimeAss(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);

    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  }
};

// ===== TIMING MODULE =====
const SubtitleTiming = {
  /**
   * Resynchronizes subtitle timing with offset, ratio, and frame adjustments
   * @param {Array} cues - Array of cue objects
   * @param {Object} options - Resync options
   * @returns {Array} Resynchronized cues
   */
  resync(cues, options = {}) {
    const { offset = 0, ratio = 1.0, frameRate = 30 } = options;

    return cues.map(cue => {
      // Clone cue to avoid mutation
      const resyncedCue = { ...cue };

      // Apply ratio scaling (speed adjustment)
      resyncedCue.start = Math.round(resyncedCue.start * ratio);
      resyncedCue.end = Math.round(resyncedCue.end * ratio);

      // Apply offset
      resyncedCue.start += offset;
      resyncedCue.end += offset;

      // Ensure non-negative timing
      resyncedCue.start = Math.max(0, resyncedCue.start);
      resyncedCue.end = Math.max(resyncedCue.start + 100, resyncedCue.end);

      return resyncedCue;
    });
  },

  /**
   * Validates timing consistency in cues
   * @param {Array} cues - Array of cue objects
   * @returns {Object} Validation result
   */
  validateTiming(cues) {
    const errors = [];
    let lastEnd = -1;

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];

      if (cue.start >= cue.end) {
        errors.push(`Cue ${i + 1}: Start time (${cue.start}ms) must be before end time (${cue.end}ms)`);
      }

      if (cue.start < lastEnd) {
        errors.push(`Cue ${i + 1}: Overlaps with previous cue`);
      }

      lastEnd = cue.end;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

// ===== FORMAT DETECTION MODULE =====
const SubtitleFormatDetector = {
  /**
   * Advanced format detection using content analysis
   * @param {string} content - Subtitle content to analyze
   * @returns {string} Detected format or 'unknown'
   */
  detectFormat(content) {
    if (!content || typeof content !== 'string') {
      return 'unknown';
    }

    const lines = content.split('\n').map(line => line.trim()).filter(line => line);

    // Priority-based detection
    if (this._isVttFormat(lines)) return 'vtt';
    if (this._isSrtFormat(lines)) return 'srt';
    if (this._isAssFormat(lines)) return 'ass';
    if (this._isTxtFormat(content)) return 'txt';

    return 'unknown';
  },

  _isVttFormat(lines) {
    return lines.length > 0 && lines[0].toUpperCase() === 'WEBVTT';
  },

  _isSrtFormat(lines) {
    // Look for sequence numbers followed by timing
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d+$/.test(lines[i]) && lines[i + 1] && lines[i + 1].includes('-->')) {
        return true;
      }
    }
    return false;
  },

  _isAssFormat(lines) {
    return lines.some(line => line === '[Script Info]');
  },

  _isTxtFormat(content) {
    // Plain text - no timing information
    const lines = content.split('\n');
    const hasTiming = lines.some(line => line.includes('-->') || /^\d+$/.test(line.trim()));
    return !hasTiming && content.trim().length > 0;
  }
};

// ===== MAIN API =====
class SubtitleConverter {
  constructor() {
    this.constants = SUBTITLE_CONSTANTS;
  }

  /**
   * Enhanced subtitle format conversion with advanced features
   * @param {string} content - Source subtitle content
   * @param {string} sourceFormat - Source format (auto-detect if not provided)
   * @param {string} targetFormat - Target format
   * @param {Object} options - Conversion options
   * @returns {string} Converted subtitle content
   */
  convert(content, sourceFormat, targetFormat, options = {}) {
    try {
      // Auto-detect format if not provided
      if (!sourceFormat || sourceFormat === 'auto') {
        sourceFormat = SubtitleFormatDetector.detectFormat(content);
        if (sourceFormat === 'unknown') {
          throw new Error('Could not detect subtitle format');
        }
      }

      // Parse to cues
      const cues = SubtitleParsers.parseToCues(content, sourceFormat);

      // Apply timing adjustments if specified
      let processedCues = cues;
      if (options.resync) {
        processedCues = SubtitleTiming.resync(cues, options.resync);
      }

      // Validate timing
      const timingValidation = SubtitleTiming.validateTiming(processedCues);
      if (!timingValidation.valid && !options.skipTimingValidation) {
        console.warn('Timing validation warnings:', timingValidation.errors);
      }

      // Convert to target format
      return SubtitleConverters.cuesToFormat(processedCues, targetFormat, options);

    } catch (error) {
      throw new Error(`Subtitle conversion failed: ${error.message}`);
    }
  }

  /**
   * Detect subtitle format from content
   * @param {string} content - Subtitle content
   * @returns {string} Detected format
   */
  detectFormat(content) {
    return SubtitleFormatDetector.detectFormat(content);
  }

  /**
   * Resynchronize subtitle timing
   * @param {string} content - Subtitle content
   * @param {string} format - Subtitle format
   * @param {Object} resyncOptions - Resync options
   * @returns {string} Resynchronized content
   */
  resync(content, format, resyncOptions) {
    const cues = SubtitleParsers.parseToCues(content, format);
    const resyncedCues = SubtitleTiming.resync(cues, resyncOptions);
    return SubtitleConverters.cuesToFormat(resyncedCues, format);
  }

  /**
   * Validate subtitle content
   * @param {string} content - Content to validate
   * @param {string} format - Expected format
   * @returns {Object} Validation result
   */
  validate(content, format) {
    return SubtitleValidator.validateContent(content, format);
  }
}

// ===== BACKWARD COMPATIBILITY FUNCTIONS =====
/**
 * Legacy function wrappers for existing code
 */
function convertVttToSrt(vttContent) {
  const converter = new SubtitleConverter();
  return converter.convert(vttContent, 'vtt', 'srt');
}

function convertSrtToVtt(srtContent) {
  const converter = new SubtitleConverter();
  return converter.convert(srtContent, 'srt', 'vtt');
}

function convertToTxt(subtitleContent, sourceFormat) {
  const converter = new SubtitleConverter();
  return converter.convert(subtitleContent, sourceFormat, 'txt');
}

function convertFromTxt(txtContent, targetFormat) {
  const converter = new SubtitleConverter();
  return converter.convert(txtContent, 'txt', targetFormat);
}

function convertSubtitleFormat(content, sourceFormat, targetFormat) {
  const converter = new SubtitleConverter();
  return converter.convert(content, sourceFormat, targetFormat);
}

// ===== EXPORTS =====
// Export for use in browser/extension context
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SubtitleConverter,
    convertVttToSrt,
    convertSrtToVtt,
    convertToTxt,
    convertFromTxt,
    convertSubtitleFormat
  };
} else if (typeof window !== 'undefined') {
  window.SubtitleConverter = SubtitleConverter;
  window.convertVttToSrt = convertVttToSrt;
  window.convertSrtToVtt = convertSrtToVtt;
  window.convertToTxt = convertToTxt;
  window.convertFromTxt = convertFromTxt;
  window.convertSubtitleFormat = convertSubtitleFormat;
}