import { describe, expect, it } from 'vitest';
import {
  aggregateCampaigns,
  buildAnalysisSnapshot,
  createModelPayload,
  rankByInefficiency,
  selectCoreKeywords,
} from '../src/lib/analysis.js';
import { prepareData } from '../src/lib/data.js';

const row = (overrides = {}) => ({
  '日期': 'Sep 1, 2022',
  '客户搜索词': 'iphone case',
  '广告活动名称': 'Campaign A',
  '搜索词展示量排名': '2',
  '搜索词展示份额': '6.00%',
  '展示量': '100',
  '点击量': '10',
  '7天总订单数(#)': '2',
  '花费': '$20.00',
  '7天总销售额': '$100.00',
  ...overrides,
});

describe('campaign pivot', () => {
  it('aggregates raw campaign rows independently from keyword deduplication', () => {
    const data = prepareData([
      row(),
      row({ '客户搜索词': 'clear case', '展示量': '200', '点击量': '20', '7天总订单数(#)': '4', '花费': '$30.00', '7天总销售额': '$200.00' }),
      row({ '广告活动名称': 'Campaign B', '日期': 'Sep 2, 2022', '展示量': '50', '点击量': '5', '花费': '$10.00' }),
    ]);
    const campaigns = aggregateCampaigns(data.campaignRows);
    expect(data.entries).toHaveLength(3);
    expect(data.campaignRows).toHaveLength(3);
    expect(campaigns).toHaveLength(2);
    expect(campaigns[0]).toMatchObject({ campaign: 'Campaign A', impressions: 300, clicks: 30, orders: 6, cost: 50, sales: 300, activeDays: 1, keywordCount: 2 });
    expect(campaigns[0].conversionRate).toBe(20);
    expect(campaigns[0].acos).toBeCloseTo(16.6667, 3);
  });
});

describe('inefficiency scoring', () => {
  const items = [
    { keyword: 'efficient', cost: 100, clicks: 10, orders: 2, conversionRate: 20, sales: 500, acos: 20 },
    { keyword: 'no sales', cost: 50, clicks: 0, orders: 0, conversionRate: null, sales: 0, acos: null },
    { keyword: 'zero spend', cost: 0, clicks: 0, orders: 0, conversionRate: null, sales: 0, acos: null },
  ];

  it('applies the 50/30/20 weights and excludes zero-spend rows', () => {
    const ranked = rankByInefficiency(items);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].keyword).toBe('no sales');
    expect(ranked[0].scoreParts).toEqual({ cost: 25, conversionRate: 30, acos: 20 });
    expect(ranked[0].inefficiencyScore).toBe(75);
    expect(ranked[1].scoreParts).toEqual({ cost: 50, conversionRate: 0, acos: 20 });
    expect(ranked[1].inefficiencyScore).toBe(70);
  });

  it('assigns full CVR risk when every eligible row has zero conversion', () => {
    const ranked = rankByInefficiency([{ keyword: 'a', cost: 1, conversionRate: null, acos: 10 }]);
    expect(ranked[0].scoreParts.conversionRate).toBe(30);
    expect(ranked[0].scoreParts.cost).toBe(50);
    expect(ranked[0].scoreParts.acos).toBe(20);
  });

  it('honors limits and deterministic tie breaking', () => {
    const tied = ['b', 'a'].map((keyword) => ({ keyword, cost: 10, conversionRate: 10, acos: 10 }));
    expect(rankByInefficiency(tied, 'keyword', 1)[0].keyword).toBe('a');
  });
});

describe('analysis snapshot', () => {
  it('keeps all keywords and campaigns in the model payload', () => {
    const data = prepareData([
      row(),
      row({ '客户搜索词': 'clear case', '广告活动名称': 'Campaign B', '7天总销售额': '$200.00', '7天总订单数(#)': '4' }),
      row({ '日期': 'Sep 2, 2022', '点击量': '0', '7天总订单数(#)': '0', '花费': '$5.00', '7天总销售额': '$0.00' }),
    ]);
    const keywords = [
      { keyword: 'iphone case', impressions: 200, clicks: 10, orders: 2, cost: 25, sales: 100, share: 6, ctr: 5, conversionRate: 20, acos: 25 },
      { keyword: 'clear case', impressions: 100, clicks: 10, orders: 4, cost: 20, sales: 200, share: 6, ctr: 10, conversionRate: 40, acos: 10 },
    ];
    const snapshot = buildAnalysisSnapshot({
      entries: data.entries,
      campaignRows: data.campaignRows,
      summary: { keywordCount: 2 },
      keywords,
      dates: data.dates,
      topKeywords: ['iphone case'],
    });
    const payload = createModelPayload(snapshot, { startDate: '2022-09-01', endDate: '2022-09-02' });
    expect(payload.allKeywords.rows).toHaveLength(2);
    expect(payload.allCampaigns.rows).toHaveLength(2);
    expect(payload.coverage.note).toContain('不是表格当前页采样');
    expect(payload.worstKeywords).toHaveLength(2);
    expect(payload.daily[1].conversionRate).toBeNull();
    expect(selectCoreKeywords(keywords, 1)[0].keyword).toBe('clear case');
  });
});
