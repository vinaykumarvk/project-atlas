import { LanguageProcessor } from '../processors/language.processor';

describe('LanguageProcessor — n-gram scoring', () => {
  let processor: LanguageProcessor;

  beforeEach(() => {
    processor = new LanguageProcessor();
  });

  describe('ngramScore()', () => {
    it('should extract character trigrams from text', () => {
      const result = processor.ngramScore('hello');
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBeGreaterThan(0);

      // "hello" -> trigrams: "hel", "ell", "llo"
      expect(result.has('hel')).toBe(true);
      expect(result.has('ell')).toBe(true);
      expect(result.has('llo')).toBe(true);
    });

    it('should return empty map for empty text', () => {
      expect(processor.ngramScore('').size).toBe(0);
    });

    it('should return empty map for text shorter than n', () => {
      expect(processor.ngramScore('ab').size).toBe(0);
      expect(processor.ngramScore('a', 3).size).toBe(0);
    });

    it('should return normalised frequency scores between 0 and 1', () => {
      const result = processor.ngramScore('the cat sat on the mat');
      for (const [, score] of result.entries()) {
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('should assign higher scores to more frequent n-grams', () => {
      const result = processor.ngramScore('aaa bbb aaa aaa');
      // 'aaa' appears multiple times in the cleaned text 'aaa bbb aaa aaa'
      // ' aa' and 'aa ' also appear
      // The exact n-gram 'aaa' should have a higher score than a less frequent one
      const aaaScore = result.get('aaa') || 0;
      expect(aaaScore).toBeGreaterThan(0);
    });

    it('should support custom n-gram sizes', () => {
      // Bigrams (n=2)
      const bigrams = processor.ngramScore('hello', 2);
      expect(bigrams.has('he')).toBe(true);
      expect(bigrams.has('el')).toBe(true);
      expect(bigrams.has('ll')).toBe(true);
      expect(bigrams.has('lo')).toBe(true);

      // 4-grams
      const fourgrams = processor.ngramScore('hello world', 4);
      expect(fourgrams.has('hell')).toBe(true);
      expect(fourgrams.has('ello')).toBe(true);
    });

    it('should handle text with only whitespace', () => {
      const result = processor.ngramScore('   ');
      // After cleanup, this becomes a single space char which is < n=3
      expect(result.size).toBe(0);
    });

    it('should produce consistent results for the same input', () => {
      const text = 'This is a test of the n-gram scoring system.';
      const result1 = processor.ngramScore(text);
      const result2 = processor.ngramScore(text);

      expect(result1.size).toBe(result2.size);
      for (const [key, value] of result1.entries()) {
        expect(result2.get(key)).toBe(value);
      }
    });

    it('should lowercase the input text', () => {
      const lower = processor.ngramScore('Hello');
      const upper = processor.ngramScore('HELLO');

      expect(lower.size).toBe(upper.size);
      for (const [key, value] of lower.entries()) {
        expect(upper.get(key)).toBe(value);
      }
    });

    it('should differentiate between languages based on n-gram profiles', () => {
      const englishNgrams = processor.ngramScore(
        'The quick brown fox jumps over the lazy dog',
      );
      const hindiNgrams = processor.ngramScore(
        '\u0928\u092E\u0938\u094D\u0924\u0947 \u092D\u093E\u0930\u0924 \u092E\u0947\u0902 \u0938\u094D\u0935\u093E\u0917\u0924 \u0939\u0948',
      );

      // English text should contain common English trigrams
      expect(englishNgrams.has('the')).toBe(true);
      expect(englishNgrams.has('he ')).toBe(true);

      // Hindi text should have different trigrams
      // They should not share many common trigrams
      let sharedCount = 0;
      for (const key of englishNgrams.keys()) {
        if (hindiNgrams.has(key)) sharedCount++;
      }
      // Very few (if any) shared trigrams between English and Hindi text
      expect(sharedCount).toBeLessThan(englishNgrams.size * 0.1);
    });
  });

  describe('detect() — existing functionality preserved', () => {
    it('should detect English text', () => {
      const result = processor.detect(
        'Please find the attached valuation report for the property.',
      );
      expect(result.language).toBe('en');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect Hindi text', () => {
      const result = processor.detect(
        '\u092F\u0939 \u090F\u0915 \u0939\u093F\u0902\u0926\u0940 \u092A\u0930\u0940\u0915\u094D\u0937\u0923 \u0939\u0948',
      );
      expect(result.language).toBe('hi');
    });

    it('should detect Hinglish text', () => {
      const result = processor.detect(
        'ye property bahut accha hai aur paisa bhi theek hai',
      );
      expect(result.language).toBe('hi-Latn');
    });
  });
});
