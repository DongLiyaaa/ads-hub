export const WORD_CLOUD_VIEWBOX = { width: 800, height: 500 };

const PADDING = 18;
const COLUMN_GAP = 14;
const ROW_GAP = 7;
const MIN_FONT_SIZE = 13;
const FONT_SIZE_RANGE = 25;
const COLORS = ['#4b7fb5', '#2a78d6', '#175b9f'];

const displayName = (keyword) => keyword.length > 28
  ? `${keyword.slice(0, 27)}…`
  : keyword;

function placeWords(words, scale) {
  const { width, height } = WORD_CLOUD_VIEWBOX;
  const positions = [];
  let x = PADDING;
  let y = PADDING;
  let rowHeight = 0;

  for (const word of words) {
    const fontSize = word.fontSize * scale;
    const wordWidth = word.name.length * fontSize * 0.53;
    if (x > PADDING && x + wordWidth > width - PADDING) {
      x = PADDING;
      y += rowHeight + ROW_GAP;
      rowHeight = 0;
    }

    positions.push({
      ...word,
      x: x + wordWidth / 2,
      y: y + fontSize / 2,
      fontSize,
    });
    x += wordWidth + COLUMN_GAP;
    rowHeight = Math.max(rowHeight, fontSize);
  }

  return y + rowHeight <= height - PADDING ? positions : null;
}

export function layoutWordCloud(keywords, count = 100) {
  const selected = [...keywords]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, count);
  if (!selected.length) return [];

  const values = selected.map((item) => Math.log1p(Math.max(0, item.impressions)));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const words = selected.map((item, index) => {
    const weight = (values[index] - min) / range;
    return {
      name: displayName(item.keyword),
      fullName: item.keyword,
      value: item.impressions,
      fontSize: MIN_FONT_SIZE + weight * FONT_SIZE_RANGE,
      color: COLORS[Math.min(2, Math.floor(weight * 3))],
    };
  });

  let low = 0.05;
  let high = 1;
  let best = null;
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const scale = (low + high) / 2;
    const positions = placeWords(words, scale);
    if (positions) {
      best = positions;
      low = scale;
    } else {
      high = scale;
    }
  }
  return best ?? placeWords(words, 0.05);
}
