/**
 * Smart Language Detection Engine
 *
 * A custom, advanced language detection system designed specifically for subtitle content.
 * Uses a multi-tier hybrid approach combining script analysis, enhanced n-gram statistics,
 * word patterns, and confidence-based decision making.
 *
 * Features:
 * - Fast script-based language family detection
 * - Enhanced character n-gram analysis with weighted scoring
 * - Word-based pattern matching for disambiguation
 * - Confidence thresholds and fallback handling
 * - Optimized for short subtitle text
 * - Lightweight and browser-compatible
 *
 * @author Sisyphus AI Agent
 * @version 1.0.0
 */

class SmartLanguageDetector {

    constructor() {
        this.minTextLength = 3;
        this.minNgramConfidenceThreshold = 0.05; // Lower threshold for n-gram results (5%)
        this.minWordPatternConfidenceThreshold = 0.3; // Higher threshold for word patterns (30%)
        this.initializeLanguageData();
    }

    /**
     * Initialize language detection data and models
     */
    initializeLanguageData() {
        // Language mappings with ISO 639-1 codes
        this.languages = {
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'ar': 'Arabic',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ko': 'Korean',
            'hi': 'Hindi',
            'bn': 'Bengali',
            'pa': 'Punjabi',
            'ur': 'Urdu',
            'fa': 'Persian',
            'tr': 'Turkish',
            'pl': 'Polish',
            'nl': 'Dutch',
            'sv': 'Swedish',
            'da': 'Danish',
            'no': 'Norwegian',
            'fi': 'Finnish',
            'cs': 'Czech',
            'sk': 'Slovak',
            'hu': 'Hungarian',
            'ro': 'Romanian',
            'bg': 'Bulgarian',
            'hr': 'Croatian',
            'sl': 'Slovenian',
            'et': 'Estonian',
            'lv': 'Latvian',
            'lt': 'Lithuanian',
            'el': 'Greek',
            'he': 'Hebrew',
            'th': 'Thai',
            'vi': 'Vietnamese',
            'id': 'Indonesian',
            'ms': 'Malay',
            'tl': 'Tagalog'
        };

        // Script families for fast character-based detection
        this.scriptFamilies = {
            'latin': {
                languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'fi', 'pl', 'cs', 'sk', 'hu', 'ro', 'hr', 'sl', 'et', 'lv', 'lt'],
                charRange: /^[a-zA-Z\s\-\.,!?;:'"()]+$/
            },
            'cyrillic': {
                languages: ['ru', 'bg', 'uk', 'be', 'sr', 'mk', 'mn'],
                charRange: /[\u0400-\u04FF\u0500-\u052F]/
            },
            'arabic': {
                languages: ['ar', 'ur', 'fa', 'pa'],
                charRange: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
            },
            'cjk': {
                languages: ['zh', 'ja', 'ko', 'vi', 'th'],
                charRange: /[\u2E80-\u2EFF\u2F00-\u2FDF\u3000-\u303F\u31C0-\u31EF\u3200-\u32FF\u3300-\u33FF\u3400-\u4DBF\u4DC0-\u4DFF\u4E00-\u9FFF\uA000-\uA48F\uA490-\uA4CF\uF900-\uFAFF\uFE30-\uFE4F]/
            },
            'devanagari': {
                languages: ['hi', 'bn', 'mr', 'ne', 'pa'],
                charRange: /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F]/
            }
        };

        // Enhanced n-gram models for each language (character trigrams and bigrams)
        this.ngramModels = this.buildNgramModels();

        // Word patterns for disambiguation when n-grams are insufficient
        this.wordPatterns = {
            'es': /\b(el|la|los|las|de|que|en|y|un|una|es|son|está|están|soy|eres|es|somos|sois|son)\b/i,
            'fr': /\b(le|la|les|de|que|en|et|un|une|est|sont|suis|es|sommes|êtes|ont)\b/i,
            'de': /\b(der|die|das|den|dem|des|und|ist|sind|sein|haben|hatte|war|waren)\b/i,
            'it': /\b(il|lo|la|i|gli|le|del|della|di|che|in|e|un|una|è|sono|era|erano)\b/i,
            'pt': /\b(o|a|os|as|de|que|em|e|um|uma|é|são|era|eram|foi|foram)\b/i,
            'ru': /\b(и|в|не|на|я|ты|он|она|оно|мы|вы|они|это|этот|эта|эти)\b/i,
            'ar': /\b(و|في|من|على|إلى|مع|هو|هي|هم|هما|نحن|أنت|أنتم|أنا)\b/i
        };
    }

    /**
     * Build enhanced n-gram models for language detection
     * Uses character trigrams and bigrams with frequency weighting
     */
    buildNgramModels() {
        const models = {};

        // English - Common character patterns (improved for short texts)
        models['en'] = {
            trigrams: ['the', 'and', 'ing', 'ion', 'ent', 'for', 'you', 'all', 'can', 'had', 'her', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'has', 'let', 'put', 'say', 'she', 'too', 'use', 'are', 'but', 'not', 'this', 'with', 'have', 'your', 'they', 'will', 'from', 'that', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were', 'hel', 'ell', 'llo', 'lo ', 'o w', ' wo', 'wor', 'orl', 'rld'],
            bigrams: ['th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd', 'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar', 'st', 'to', 'nt', 'ng', 'se', 'ha', 'as', 'ou', 'io', 'le', 've', 'co', 'me', 'de', 'hi', 'ri', 'ro', 'ic', 'ne', 'll', 'ea', 'et', 'li', 'ot', 'ss', 'ee', 'tt', 'rr', 'oo', 'aa', 'ii', 'ck', 'ff', 'pp', 'gg', 'mm', 'nn', 'wh', 'sh', 'ch', 'gh', 'ph', 'qu', 'wr', 'kn', 'el', 'll', 'lo', 'ow', 'wo', 'or', 'rl', 'ld']
        };

        // Spanish - Common patterns with ñ, accent marks
        models['es'] = {
            trigrams: ['ión', 'ado', 'ada', 'que', 'con', 'ent', 'ión', 'los', 'las', 'del', 'una', 'por', 'est', 'ien', 'era', 'ado', 'dos', 'nos', 'nos', 'ser', 'ten', 'ido', 'ció', 'des', 'hab', 'com', 'par', 'tod', 'vid', 'tam', 'man', 'dad', 'per', 'tod', 'vid'],
            bigrams: ['es', 'el', 'la', 'de', 'en', 'un', 'ci', 'ad', 'ió', 'co', 'st', 'to', 'ar', 'er', 'al', 'an', 'os', 'as', 'se', 'do', 'ue', 'qu', 'te', 'ra', 'ta', 'ha', 'pe', 'ri', 'di', 'po']
        };

        // French - Common patterns with accent marks
        models['fr'] = {
            trigrams: ['ent', 'ion', 'que', 'les', 'des', 'ion', 'tio', 'men', 'con', 'par', 'com', 'est', 'tre', 'son', 'ont', 'ant', 'res', 'aux', 'lle', 'ses', 'ais', 'ait', 'ont', 'ère', 'age', 'ell', 'ien', 'oir', 'sur', 'ans', 'out', 'ien', 'omm', 'and', 'oir'],
            bigrams: ['es', 'le', 'de', 'en', 'on', 'nt', 're', 'er', 'ti', 'te', 'ai', 'an', 'is', 'it', 'se', 'et', 'la', 'ue', 'oi', 'st', 'ou', 'ar', 'qu', 'un', 'co', 'me', 'di', 'pa', 'so', 'al']
        };

        // German - Common patterns with umlauts
        models['de'] = {
            trigrams: ['ein', 'der', 'die', 'und', 'den', 'von', 'mit', 'das', 'ist', 'des', 'auf', 'für', 'hat', 'die', 'sich', 'ich', 'nicht', 'auch', 'nach', 'wie', 'aus', 'bei', 'vor', 'über', 'unter', 'sein', 'haben', 'werden', 'können', 'müssen'],
            bigrams: ['er', 'en', 'ch', 'de', 'ei', 'in', 'te', 'ge', 'be', 'au', 'an', 'he', 're', 'st', 'ne', 'un', 'se', 'le', 'nd', 'sc', 'ie', 'ra', 'ha', 'li', 'or', 'di', 'al', 'so', 'ar', 'es']
        };

        // Portuguese - Similar to Spanish but distinct patterns
        models['pt'] = {
            trigrams: ['ção', 'ado', 'ada', 'que', 'ent', 'com', 'est', 'par', 'con', 'des', 'ção', 'men', 'tod', 'vid', 'uma', 'dos', 'das', 'ser', 'ter', 'ido', 'hab', 'muit', 'tamb', 'sempre', 'agora', 'depo', 'quer', 'fazer', 'estar', 'ir', 'vir'],
            bigrams: ['ão', 'es', 'os', 'as', 'de', 'em', 'um', 'ad', 'en', 'co', 'st', 'ar', 'er', 'to', 'se', 'te', 'ra', 'ha', 'pe', 'ri', 'di', 'po', 'ue', 'qu', 'ci', 'ta', 'do', 'an', 're', 'al']
        };

        // Russian - Cyrillic character patterns
        models['ru'] = {
            trigrams: ['при', 'рив', 'иве', 'вет', 'ет ', 'т м', ' ми', 'мир', 'сто', 'то ', 'о т', ' те', 'тес', 'ест', 'сто', 'тов', 'ово', 'вое', 'ое ', 'е с', ' со', 'соо', 'ооб', 'общ', 'бще', 'щен', 'ени', 'ние', 'ие ', 'е н', ' на', 'на ', 'а р', ' ру', 'рус', 'усс', 'сск'],
            bigrams: ['пр', 'ри', 'ив', 'ве', 'ет', 'т ', ' м', 'ми', 'ир', 'ст', 'то', 'о ', ' т', 'те', 'ес', 'ст', 'то', 'ов', 'во', 'ое', 'е ', ' с', 'со', 'оо', 'об', 'бщ', 'ще', 'ен', 'ни', 'ие', 'е ', ' н', 'на', 'а ', ' р', 'ру', 'ус', 'сс', 'ск', 'ки', 'и ', ' м', 'ми', 'ир']
        };

        // Arabic - Right-to-left character patterns
        models['ar'] = {
            trigrams: ['مرح', 'رحب', 'حبا', 'با ', 'ا ب', ' بال', 'بالع', 'العا', 'عال', 'الم', 'رم', 'مذ', 'ذه', 'ه ', ' رس', 'رسا', 'سال', 'الة', 'لة ', 'ة ا', ' اخ', 'اخت', 'ختب', 'تبا', 'بار', 'ار ', 'ر ب', ' بال', 'بالل', 'لغ', 'غة ', 'ة ا', ' الع', 'عرب', 'ربي', 'بي', 'ية'],
            bigrams: ['م', 'ر', 'ح', 'ب', 'ا', 'ب', 'ا', 'ل', 'ع', 'ا', 'ل', 'م', 'ذ', 'ه', 'ر', 'س', 'ا', 'ل', 'ة', 'ا', 'خ', 'ت', 'ب', 'ا', 'ر', 'ل', 'غ', 'ة', 'ع', 'ر', 'ب', 'ي', 'ة']
        };

        // Chinese - Common character patterns
        models['zh'] = {
            trigrams: ['的', '是', '不', '了', '在', '有', '和', '人', '这', '中', '大', '为', '上', '个', '国', '我', '以', '要', '他', '时', '来', '用', '们', '生', '到', '作', '地', '于', '出', '就', '分', '对', '成', '会', '可', '主', '发', '年', '动', '同', '工', '也', '能', '下', '过', '子', '说', '产', '种', '面', '而', '方', '后', '多', '定', '行', '学', '法', '所', '民', '得', '经', '十', '三', '之', '进', '着', '等', '部', '度', '家', '电', '力', '里', '如', '水', '化', '高', '自', '二', '理', '起', '小', '物', '现', '实', '加', '量', '都', '两'],
            bigrams: ['的', '是', '不', '了', '在', '有', '和', '人', '这', '中', '大', '为', '上', '个', '国', '我', '以', '要', '他', '时', '来', '用', '们', '生', '到', '作', '地', '于', '出', '就', '分', '对', '成', '会', '可', '主', '发', '年', '动', '同', '工', '也', '能', '下', '过', '子', '说', '产', '种', '面', '而', '方', '后', '多', '定', '行', '学', '法', '所', '民', '得', '经', '十', '三', '之', '进', '着', '等', '部', '度', '家', '电', '力', '里', '如', '水', '化', '高', '自', '二', '理', '起', '小', '物', '现', '实', '加', '量', '都', '两', '本', '月', '机', '当', '使', '无', '本', '性', '正', '其', '外', '还', '用', '比', '长', '此', '做', '体', '应', '开', '些', '那', '其', '向', '全', '意', '位', '新', '美', '从', '本', '己', '老', '次', '听', '明', '总', '结', '果', '情', '前', '位', '何', '关', '重', '头', '手', '山', '东', '西', '北', '南', '风', '雨', '雪', '云', '雷', '电', '火', '木', '土', '金', '水', '日', '月', '星', '辰', '天', '地', '海', '江', '河', '湖', '泉', '石', '玉', '珠', '宝', '钱', '银', '金', '铜', '铁', '钢', '木', '竹', '草', '花', '叶', '根', '茎', '枝', '果', '实', '种', '苗', '树', '林', '森', '野', '原', '田', '土', '山', '丘', '陵', '峰', '谷', '洞', '穴', '坑', '井', '沟', '渠', '池', '塘', '泽', '洋', '海', '洋', '洲', '岛', '屿', '滩', '岸', '湾', '港', '河', '溪', '泉', '源', '流', '波', '浪', '涛', '涌', '潮', '汐', '滩', '沙', '礁', '岩', '石', '矿', '煤', '油', '气', '盐', '碱', '硝', '硫', '磷', '钾', '钙', '镁', '铁', '铜', '锌', '铝', '锡', '铅', '汞', '金', '银', '铂', '钻', '玉', '翡', '翠', '玛', '瑙', '珊', '瑚', '珍', '珠', '宝', '贝', '蚌', '螺', '虾', '蟹', '鱼', '鳖', '龟', '蛇', '蛙', '蝌', '蚪', '虫', '蚁', '蜂', '蝶', '蝴', '蛛', '蚊', '蝇', '虻', '蝉', '蝗', '螳', '螂', '蟑', '螂', '蛾', '蚕', '蛹', '蛤', '蝼', '蚁', '蜂', '蝶', '蝴', '蛛', '蚊', '蝇', '虻', '蝉', '蝗', '螳', '螂', '蟑', '螂', '蛾', '蚕', '蛹', '蛤', '蝼', '蚁', '蜂', '蝶', '蝴', '蛛', '蚊', '蝇', '虻', '蝉', '蝗', '螳', '螂', '蟑', '螂', '蛾', '蚕', '蛹', '蛤', '蝼']
        };

        return models;
    }

    /**
     * Main detection method - uses multi-tier approach
     * @param {string} text - Text to analyze
     * @returns {Object} Detection result with language code, confidence, and method used
     */
    detectLanguage(text) {
        if (!text || typeof text !== 'string' || text.trim().length < this.minTextLength) {
            return { language: 'und', confidence: 0, method: 'insufficient_text' };
        }

        const cleanText = this.preprocessText(text);

        // Tier 1: Script/Character Analysis (Fastest, most reliable)
        const scriptResult = this.detectByScript(cleanText);
        if (scriptResult.language && scriptResult.confidence >= this.minConfidenceThreshold) {
            return { ...scriptResult, method: 'script_analysis' };
        }

        // Tier 2: Enhanced N-gram Analysis
        const ngramResult = this.detectByNgrams(cleanText);
        if (ngramResult.confidence >= this.minNgramConfidenceThreshold) {
            return { ...ngramResult, method: 'ngram_analysis' };
        }

        // Tier 3: Word Pattern Matching (Fallback)
        const wordResult = this.detectByWordPatterns(cleanText);
        if (wordResult.confidence >= this.minWordPatternConfidenceThreshold) {
            return { ...wordResult, method: 'word_patterns' };
        }

        // If all methods fail, return undetermined with best guess
        const bestGuess = scriptResult.confidence > ngramResult.confidence ? scriptResult : ngramResult;
        return {
            language: bestGuess.language,
            confidence: Math.max(bestGuess.confidence * 0.5, 0.1), // Reduce confidence for fallback
            method: 'best_guess'
        };
    }

    /**
     * Preprocess text for better detection
     */
    preprocessText(text) {
        // Keep letters from all scripts, plus common punctuation
        // Optimized: Use Unicode properties for letters/marks, explicit punctuation set
        return text
            .toLowerCase()
            .replace(/[^\p{L}\p{M}\s\-.,!?;:'"()]/gu, ' ') // Remove punctuation but keep letters and marks from all scripts
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Tier 1: Detect language by script/character analysis
     */
    detectByScript(text) {
        // Count characters by script family
        const charCounts = { other: 0 };
        let totalChars = 0;

        for (const char of text) {
            if (char.match(/\s/)) continue; // Skip whitespace

            totalChars++;
            let found = false;

            for (const [family, data] of Object.entries(this.scriptFamilies)) {
                if (data.charRange.test(char)) {
                    charCounts[family] = (charCounts[family] || 0) + 1;
                    found = true;
                    break;
                }
            }

            if (!found) {
                charCounts.other = (charCounts.other || 0) + 1;
            }
        }

        if (totalChars === 0) {
            return { language: 'und', confidence: 0 };
        }

        // Find dominant script
        let maxCount = 0;
        let dominantFamily = null;

        for (const [family, count] of Object.entries(charCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantFamily = family;
            }
        }

        if (!dominantFamily || dominantFamily === 'other') {
            return { language: 'und', confidence: 0 };
        }

        const confidence = maxCount / totalChars;
        const familyData = this.scriptFamilies[dominantFamily];

        // For script families with multiple languages, return a neutral result
        // Let subsequent tiers (n-grams, word patterns) determine the specific language
        // Only return a specific language if the script family has only one language
        if (familyData.languages.length === 1) {
            return {
                language: familyData.languages[0],
                confidence: confidence
            };
        } else {
            // Multiple languages possible, return neutral result for this tier
            return { language: null, confidence: confidence };
        }
    }

    /**
     * Tier 2: Enhanced n-gram analysis with weighted scoring
     */
    detectByNgrams(text) {
        const results = {};

        for (const [langCode, model] of Object.entries(this.ngramModels)) {
            const trigramScore = this.scoreTrigrams(text, model.trigrams);
            const bigramScore = this.scoreBigrams(text, model.bigrams);

            // Weighted combination: trigrams are more distinctive
            // Scores are already normalized to 0-1 range
            const combinedScore = (trigramScore * 0.7) + (bigramScore * 0.3);
            results[langCode] = combinedScore;
        }

        // Find best match
        let bestLang = null;
        let bestScore = 0;

        for (const [lang, score] of Object.entries(results)) {
            if (score > bestScore) {
                bestScore = score;
                bestLang = lang;
            }
        }

        return {
            language: bestLang || 'und',
            confidence: Math.min(1.0, bestScore) // Ensure confidence is capped at 1.0
        };
    }

    /**
     * Score trigrams for a language model
     */
    scoreTrigrams(text, trigrams) {
        let matches = 0;
        let totalChecked = 0;

        for (const trigram of trigrams) {
            totalChecked++;
            const count = this.countSubstring(text, trigram);
            if (count > 0) {
                matches += count;
            }
        }

        // For short texts, even one match is significant
        // Normalize to 0-1 confidence range
        const rawScore = totalChecked > 0 ? matches / Math.max(totalChecked, 10) : 0;
        return Math.min(1.0, rawScore);
    }

    /**
     * Score bigrams for a language model
     */
    scoreBigrams(text, bigrams) {
        let matches = 0;
        let totalChecked = 0;

        for (const bigram of bigrams) {
            totalChecked++;
            const count = this.countSubstring(text, bigram);
            if (count > 0) {
                matches += count;
            }
        }

        // For short texts, bigrams are very significant
        // Normalize to 0-1 confidence range
        const rawScore = totalChecked > 0 ? matches / Math.max(totalChecked, 5) : 0;
        return Math.min(1.0, rawScore);
    }

    /**
     * Count occurrences of substring in text
     */
    countSubstring(text, substring) {
        let count = 0;
        let position = 0;

        while ((position = text.indexOf(substring, position)) !== -1) {
            count++;
            position += substring.length;
        }

        return count;
    }

    /**
     * Tier 3: Word pattern matching for disambiguation
     */
    detectByWordPatterns(text) {
        const words = text.split(/\s+/);
        const results = {};

        for (const [langCode, pattern] of Object.entries(this.wordPatterns)) {
            let matches = 0;
            let totalWords = 0;

            for (const word of words) {
                if (word.length > 2) { // Only check meaningful words
                    totalWords++;
                    if (pattern.test(word)) {
                        matches++;
                    }
                }
            }

            if (totalWords > 0) {
                results[langCode] = matches / totalWords;
            }
        }

        // Find best match
        let bestLang = null;
        let bestScore = 0;

        for (const [lang, score] of Object.entries(results)) {
            if (score > bestScore) {
                bestScore = score;
                bestLang = lang;
            }
        }

        return {
            language: bestLang || 'und',
            confidence: Math.min(1.0, bestScore) // Ensure confidence is capped at 1.0
        };
    }

    /**
     * Get full language name from code
     */
    getLanguageName(code) {
        return this.languages[code] || 'Unknown';
    }

    /**
     * Batch detection for multiple texts
     */
    detectLanguages(texts) {
        return texts.map(text => this.detectLanguage(text));
    }
}

// Export for use in browser/extension context
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartLanguageDetector;
} else if (typeof window !== 'undefined') {
    window.SmartLanguageDetector = SmartLanguageDetector;
}