import { describe, expect, it } from 'vitest';
import { buildPlacementAnalysisSnapshot, createPlacementModelPayload, getOpportunityReasons, getRiskReasons } from '../src/lib/placementAnalysis.js';

const row = (overrides = {}) => ({
  date: '2022-09-01', portfolio: 'P1', campaign: 'Campaign A', biddingStrategy: '固定竞价', placement: 'topOfSearch', currency: 'USD',
  impressions: 1000, clicks: 100, spend: 100, sales: 500, orders: 20, units: 20,
  ...overrides,
});

describe('广告位候选规则', () => {
  const summary = { spend: 200, clicks: 200, orders: 20, sales: 500, acos: 40, cvr: 10, cpc: 1, cpo: 10 };
  it('识别高点击无订单和明显偏离整体的风险', () => {
    expect(getRiskReasons({ spend: 50, clicks: 30, orders: 0, sales: 0, acos: null, cvr: 0, cpc: 1.67 }, summary)).toEqual(['点击≥30次且无订单', 'CVR低于整体25%以上', 'CPC高于整体25%以上']);
    expect(getRiskReasons({ spend: 100, clicks: 50, orders: 2, sales: 100, acos: 100, cvr: 4, cpc: 2 }, summary)).toContain('ACOS高于整体25%以上');
  });

  it('小样本不进入候选', () => {
    expect(getRiskReasons({ spend: 100, clicks: 29, orders: 0, acos: null, cvr: 0, cpc: 3 }, summary)).toEqual([]);
    expect(getOpportunityReasons({ spend: 100, clicks: 29, orders: 10, acos: 10, cvr: 20, cpo: 2 }, summary)).toEqual([]);
  });

  it('相对高效规则不依赖主观评分', () => {
    expect(getOpportunityReasons({ spend: 50, clicks: 50, orders: 10, sales: 250, acos: 20, cvr: 20, cpo: 5 }, summary)).toEqual(['ACOS低于整体且CVR不低于整体', 'CPO低于整体20%以上']);
  });
});

describe('广告位 AI 数据负载', () => {
  it('包含全部活动广告位组合、每日趋势和策略矩阵', () => {
    const rows = [
      row(),
      row({ campaign: 'Campaign B', placement: 'productPages', clicks: 40, spend: 100, sales: 0, orders: 0, units: 0, cpc: undefined }),
      row({ date: '2022-09-02', campaign: 'Campaign C', biddingStrategy: '动态竞价 – 只降低', placement: 'restOfSearch', clicks: 50, spend: 50, sales: 250, orders: 10, units: 10 }),
    ];
    const snapshot = buildPlacementAnalysisSnapshot(rows);
    const payload = createPlacementModelPayload(snapshot, { startDate: '2022-09-01', endDate: '2022-09-02' });
    expect(payload.reportType).toBe('placement');
    expect(payload.allPlacements.rows).toHaveLength(3);
    expect(payload.allCampaigns.rows).toHaveLength(3);
    expect(payload.allDaily.rows).toHaveLength(3);
    expect(payload.allStrategies.rows).toHaveLength(3);
    expect(payload.coverage.campaigns).toBe(3);
    expect(payload.coverage.note).toContain('不是表格当前页采样');
    expect(payload.risks.some((item) => item.campaign === 'Campaign B')).toBe(true);
    expect(payload.methodology.limitation).toContain('不代表盈利');
  });
});
