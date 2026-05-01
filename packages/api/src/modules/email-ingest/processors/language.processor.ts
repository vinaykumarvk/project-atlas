import { Injectable, Logger } from '@nestjs/common';

/**
 * Language detection processor (FR-005).
 *
 * Detects language: English (en), Hindi (hi), Hinglish (hi-Latn).
 * In production, would use fastText or cld3 bindings.
 * This implementation uses heuristic-based detection.
 */
@Injectable()
export class LanguageProcessor {
  private readonly logger = new Logger(LanguageProcessor.name);

  // Hindi Unicode range: Devanagari script
  private readonly hindiPattern = /[\u0900-\u097F]/;

  // Common Hindi words in Roman script (Hinglish indicators)
  private readonly hinglishWords = [
    'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein',
    'nahi', 'nahin', 'kya', 'aur', 'par', 'ye', 'wo', 'kuch',
    'bahut', 'agar', 'lekin', 'toh', 'bhi', 'abhi', 'yahan',
    'wahan', 'kaise', 'kyun', 'kab', 'kaun', 'kitna', 'thik',
    'accha', 'theek', 'sab', 'kaam', 'paisa', 'rupee', 'lakh',
    'crore', 'ji', 'sahab', 'bhai', 'didi', 'sir', 'madam',
    'karein', 'karo', 'dijiye', 'chahiye', 'hoga', 'tha',
  ];

  // Reference n-gram profiles for English and Hindi (Latin script).
  // These are common trigrams that characterise each language.
  private readonly englishReferenceNgrams = new Set([
    'the', 'he ', 'in ', 'and', 'nd ', 'ion', 'tio', 'ati',
    'for', 'tha', 'ter', 'hat', 'ere', 'ent', 'ing', 'es ',
    'her', 'ons', 'his', 'con', 'ted', 'ith', 'wit', 'is ',
    'all', 'are', 'not', 'rea', 'ear', 'eas', ' th', 'ed ',
    'ou ', 'of ', 'to ', ' to', ' an', ' in', ' of', 'an ',
  ]);

  private readonly hindiLatinReferenceNgrams = new Set([
    'hai', 'ain', ' ha', ' ka', ' ki', ' ke', ' ko', ' se',
    ' me', 'mei', 'ein', 'ahi', 'nah', 'kya', 'aur', ' au',
    ' pa', 'ahu', 'bah', 'hut', ' ba', ' ye', ' wo', 'kuc',
    'uch', ' ku', ' ag', 'aga', 'gar', ' le', 'lek', 'eki',
    'kin', 'toh', ' to', 'bhi', ' bh', 'abh', ' ab', 'cha',
  ]);

  /**
   * Detect the primary language of the given text.
   * Returns ISO 639-1 code with optional script subtag.
   */
  detect(text: string): { language: string; confidence: number } {
    if (!text || text.trim().length === 0) {
      return { language: 'en', confidence: 0.5 };
    }

    const cleanText = text.toLowerCase().trim();

    // Check for Devanagari script (Hindi)
    const hindiChars = (cleanText.match(/[\u0900-\u097F]/g) || []).length;
    const totalChars = cleanText.replace(/\s/g, '').length;

    if (totalChars > 0 && hindiChars / totalChars > 0.3) {
      return { language: 'hi', confidence: 0.9 };
    }

    // Check for Hinglish (Roman-script Hindi)
    const words = cleanText.split(/\s+/);
    const hinglishCount = words.filter((w) =>
      this.hinglishWords.includes(w.replace(/[.,!?;:]/g, '')),
    ).length;
    const hinglishRatio = hinglishCount / Math.max(words.length, 1);

    if (hinglishRatio > 0.15) {
      return { language: 'hi-Latn', confidence: 0.7 + hinglishRatio * 0.3 };
    }

    // Default: English
    // Higher confidence if text has common English patterns
    const englishIndicators = [
      /\b(the|is|are|was|were|have|has|been|will|would|could|should)\b/gi,
      /\b(please|kindly|regarding|attached|request|team)\b/gi,
    ];

    let englishScore = 0.6;
    for (const pattern of englishIndicators) {
      const matches = cleanText.match(pattern);
      if (matches && matches.length > 2) {
        englishScore = Math.min(englishScore + 0.1, 0.95);
      }
    }

    // FR-005.A1: Use n-gram scoring to boost/adjust confidence.
    // Compare the text's trigram profile against reference profiles
    // for English and Hindi-Latin to refine the heuristic score.
    const ngramBoost = this.computeNgramBoost(cleanText);
    englishScore = Math.min(Math.max(englishScore + ngramBoost, 0.5), 0.95);

    return { language: 'en', confidence: Math.round(englishScore * 100) / 100 };
  }

  /**
   * FR-005.A1: Extract character n-grams from text and compute their frequency scores.
   *
   * Character n-grams are useful for language identification because different
   * languages have different character combination frequencies.
   *
   * @param text - The input text
   * @param n    - The n-gram size (default 3 for trigrams)
   * @returns A Map of n-gram -> normalised frequency score (0-1)
   */
  ngramScore(text: string, n = 3): Map<string, number> {
    const result = new Map<string, number>();
    if (!text || text.length < n) {
      return result;
    }

    const cleaned = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const totalNgrams = Math.max(cleaned.length - n + 1, 1);
    const counts = new Map<string, number>();

    for (let i = 0; i <= cleaned.length - n; i++) {
      const ngram = cleaned.substring(i, i + n);
      counts.set(ngram, (counts.get(ngram) || 0) + 1);
    }

    // Normalise to frequency scores (0-1)
    for (const [ngram, count] of counts.entries()) {
      result.set(ngram, count / totalNgrams);
    }

    return result;
  }

  /**
   * FR-005.A1: Compute an n-gram-based confidence boost for English detection.
   *
   * Calculates the overlap between the text's trigram profile and reference
   * English/Hindi-Latin profiles. Returns a small positive boost if the text
   * strongly matches English n-grams, or a small negative adjustment if it
   * leans toward Hindi-Latin patterns.
   *
   * @param text - Lowercased, trimmed input text
   * @returns A confidence adjustment between -0.05 and +0.05
   */
  private computeNgramBoost(text: string): number {
    const ngrams = this.ngramScore(text);
    if (ngrams.size === 0) return 0;

    let englishHits = 0;
    let hindiLatinHits = 0;

    for (const ngram of ngrams.keys()) {
      if (this.englishReferenceNgrams.has(ngram)) englishHits++;
      if (this.hindiLatinReferenceNgrams.has(ngram)) hindiLatinHits++;
    }

    const totalNgrams = ngrams.size;
    const englishOverlap = englishHits / totalNgrams;
    const hindiLatinOverlap = hindiLatinHits / totalNgrams;

    // If English n-grams dominate, give a small positive boost (up to +0.05).
    // If Hindi-Latin n-grams dominate, give a small negative adjustment (down to -0.05).
    // The range is intentionally small to complement, not override, the heuristic.
    const diff = englishOverlap - hindiLatinOverlap;
    return Math.max(-0.05, Math.min(0.05, diff));
  }

  /**
   * Check if the detected language is supported (v1 languages).
   */
  isSupported(language: string): boolean {
    const supported = ['en', 'en-IN', 'hi', 'hi-Latn'];
    return supported.includes(language);
  }
}
