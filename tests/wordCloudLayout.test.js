import { describe, expect, it } from 'vitest';
import { layoutWordCloud, WORD_CLOUD_VIEWBOX } from '../src/lib/wordCloudLayout.js';

const keywords = Array.from({ length: 250 }, (_, index) => ({
  keyword: `search term ${String(index + 1).padStart(3, '0')} with extra descriptive words`,
  impressions: 250 - index,
}));

describe('word cloud layout', () => {
  it('keeps the default 100 words inside the fixed viewBox', () => {
    const words = layoutWordCloud(keywords);
    expect(words).toHaveLength(100);
    expect(words[0].value).toBe(250);
    for (const word of words) {
      const halfWidth = word.name.length * word.fontSize * 0.53 / 2;
      expect(word.x - halfWidth).toBeGreaterThanOrEqual(0);
      expect(word.x + halfWidth).toBeLessThanOrEqual(WORD_CLOUD_VIEWBOX.width);
      expect(word.y - word.fontSize / 2).toBeGreaterThanOrEqual(0);
      expect(word.y + word.fontSize / 2).toBeLessThanOrEqual(WORD_CLOUD_VIEWBOX.height);
    }
  });

  it('lays out 200 words without dropping entries', () => {
    expect(layoutWordCloud(keywords, 200)).toHaveLength(200);
  });

  it('preserves full keyword text when the visible label is shortened', () => {
    const keyword = 'a very long customer search term that needs shortening';
    const [word] = layoutWordCloud([{ keyword, impressions: 10 }]);
    expect(word.name).toHaveLength(28);
    expect(word.name.endsWith('…')).toBe(true);
    expect(word.fullName).toBe(keyword);
  });
});
