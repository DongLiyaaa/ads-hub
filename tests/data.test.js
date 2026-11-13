import { describe, expect, it } from 'vitest';
import {
  aggregateEntries,
  buildKeywordTrend,
  filterEntriesByDate,
  parseNumber,
  parseReportDate,
  prepareData,
  shiftDate,
} from '../src/lib/data.js';

const row = (overrides = {}) => ({
  '日期': 'Sep 1, 2022',
  '客户搜索词': 'iphone case',
  '搜索词展示量排名': '2',
  '搜索词展示份额': '6.00%',
  '展示量': '100',
  '点击量': '10',
  '7天总订单数(#)': '2',
  '花费': '$20.00',
  '7天总销售额': '$100.00',
  ...overrides,
});

describe('report parsing', () => {
  it('parses source dates and numeric formats', () => {
    expect(parseReportDate('Sep 1, 2022')).toBe('2022-09-01');
    expect(parseReportDate('invalid')).toBeNull();
    expect(parseNumber('$1,234.50')).toBe(1234.5);
    expect(parseNumber('6.01%')).toBe(6.01);
    expect(parseNumber('')).toBe(0);
  });

  it('deduplicates campaign rows without summing their shared share value', () => {
    const data = prepareData([
      row(),
      row({ '展示量': '300', '点击量': '20', '花费': '$40.00' }),
    ]);
    expect(data.entries).toHaveLength(1);
    expect(data.duplicateRows).toBe(1);
    expect(data.entries[0].share).toBe(6);
    expect(data.entries[0].impressions).toBe(400);
    expect(data.entries[0].clicks).toBe(30);
  });

  it('skips malformed rows', () => {
    const data = prepareData([row(), row({ '日期': 'bad' }), row({ '客户搜索词': '' })]);
    expect(data.entries).toHaveLength(1);
    expect(data.skippedRows).toBe(2);
  });
});

describe('aggregation', () => {
  const entries = prepareData([
    row(),
    row({ '日期': 'Sep 2, 2022', '搜索词展示份额': '10.00%', '展示量': '300' }),
    row({ '日期': 'Sep 2, 2022', '客户搜索词': 'clear case', '搜索词展示份额': '20.00%', '展示量': '100' }),
  ]).entries;

  it('weights share by impressions and derives rates from totals', () => {
    const { summary, keywords } = aggregateEntries(entries);
    expect(summary.share).toBeCloseTo(11.2);
    expect(summary.keywordCount).toBe(2);
    expect(summary.impressions).toBe(500);
    expect(summary.ctr).toBeCloseTo(6);
    expect(summary.acos).toBeCloseTo(20);
    expect(keywords.find((item) => item.keyword === 'iphone case').share).toBeCloseTo(9);
  });

  it('returns an average rather than NaN when impressions are zero', () => {
    const zero = prepareData([
      row({ '展示量': '0' }),
      row({ '日期': 'Sep 2, 2022', '搜索词展示份额': '10.00%', '展示量': '0' }),
    ]).entries;
    const { summary } = aggregateEntries(zero);
    expect(summary.share).toBe(8);
    expect(summary.ctr).toBeNull();
  });

  it('filters ISO date ranges inclusively', () => {
    expect(filterEntriesByDate(entries, '2022-09-02', '2022-09-02')).toHaveLength(2);
    expect(shiftDate('2022-09-30', -6)).toBe('2022-09-24');
  });

  it('keeps missing keyword dates as gaps in comparison series', () => {
    const trend = buildKeywordTrend(entries, ['2022-09-01', '2022-09-02'], ['clear case']);
    expect(trend.series[0].data).toEqual([null, 20]);
  });
});
