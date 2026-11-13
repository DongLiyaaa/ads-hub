import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildCampaignHierarchy,
  buildCampaignPlacementRows,
  buildPlacementTrend,
  buildDailyPlacementRows,
  buildStrategyPlacementRows,
  filterPlacementRows,
  preparePlacementData,
  summarizePlacements,
} from '../src/lib/placementData.js';

const row = (overrides = {}) => ({
  date: '2022-09-01',
  portfolio: 'Portfolio A',
  campaign: 'Campaign A',
  biddingStrategy: '固定竞价',
  placement: 'topOfSearch',
  currency: 'USD',
  impressions: 100,
  clicks: 10,
  spend: 20,
  sales: 100,
  orders: 2,
  units: 2,
  ...overrides,
});

const rows = [
  row(),
  row({ date: '2022-09-02', impressions: 200, clicks: 20, spend: 40, sales: 200, orders: 4, units: 4 }),
  row({ date: '2022-09-02', placement: 'productPages', impressions: 400, clicks: 20, spend: 40, sales: 100, orders: 1, units: 1 }),
];

describe('广告位汇总', () => {
  it('从汇总基础字段重算比率与贡献结构', () => {
    const { summary, placements } = summarizePlacements(rows);
    expect(summary).toMatchObject({ impressions: 700, clicks: 50, spend: 100, sales: 400, orders: 7, units: 7, campaignCount: 1 });
    expect(summary.ctr).toBeCloseTo(7.1429, 3);
    expect(summary.cpc).toBe(2);
    expect(summary.cvr).toBeCloseTo(14, 10);
    expect(summary.cpo).toBeCloseTo(14.2857, 3);
    expect(summary.acos).toBe(25);
    expect(summary.roas).toBe(4);
    const top = placements.find((item) => item.id === 'topOfSearch');
    const product = placements.find((item) => item.id === 'productPages');
    const rest = placements.find((item) => item.id === 'restOfSearch');
    expect(top).toMatchObject({ impressions: 300, clicks: 30, spend: 60, sales: 300, orders: 6, ctr: 10, cvr: 20, acos: 20, roas: 5, spendShare: 60, salesShare: 75 });
    expect(top.orderShare).toBeCloseTo(85.7143, 3);
    expect(product.acos).toBe(40);
    expect(rest.impressions).toBe(0);
    expect(rest.ctr).toBeNull();
    expect(rest.spendShare).toBe(0);
  });

  it('空数据和零分母返回 null，而不是伪造零比率', () => {
    const { summary, placements } = summarizePlacements([]);
    expect(summary.acos).toBeNull();
    expect(summary.cvr).toBeNull();
    expect(placements).toHaveLength(3);
    expect(placements[0].spendShare).toBeNull();
  });

  it('时间筛选使用闭区间', () => {
    expect(filterPlacementRows(rows, '2022-09-02', '2022-09-02')).toHaveLength(2);
    expect(filterPlacementRows(rows, '2022-09-03', '2022-09-04')).toHaveLength(0);
  });
});

describe('广告位透视和趋势', () => {
  it('活动下钻保留广告位并正确合并活动日期', () => {
    const details = buildCampaignPlacementRows(rows);
    expect(details).toHaveLength(2);
    const campaigns = buildCampaignHierarchy(details);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].activeDays).toBe(2);
    expect(campaigns[0].spend).toBe(100);
    expect(campaigns[0].placements.map((item) => item.placement)).toEqual(['topOfSearch', 'productPages']);
  });

  it('竞价策略矩阵保留活动数与原始样本行数', () => {
    const strategies = buildStrategyPlacementRows(rows);
    expect(strategies).toHaveLength(2);
    expect(strategies[0]).toMatchObject({ campaignCount: 1, rowCount: 2, spend: 60 });
    expect(strategies[1]).toMatchObject({ campaignCount: 1, rowCount: 1, spend: 40 });
  });

  it('趋势对缺失日期输出 null，不补成零', () => {
    const daily = buildDailyPlacementRows(rows);
    const trend = buildPlacementTrend(daily, ['2022-09-01', '2022-09-02', '2022-09-03'], 'acos');
    expect(trend.series.find((item) => item.placement === 'topOfSearch').data).toEqual([20, 20, null]);
    expect(trend.series.find((item) => item.placement === 'productPages').data).toEqual([null, 40, null]);
  });
});

describe('真实 Excel 转换结果对账', () => {
  it('与源文件核实总数一致', () => {
    const payload = JSON.parse(readFileSync(new URL('../public/data/placement-report.json', import.meta.url), 'utf8'));
    const data = preparePlacementData(payload);
    const { summary } = summarizePlacements(data.rows);
    expect(data.rows).toHaveLength(4129);
    expect(data.totalRows).toBe(4129);
    expect(data.skippedRows).toBe(0);
    expect(data.duplicateRows).toBe(0);
    expect(data.minDate).toBe('2022-09-01');
    expect(data.maxDate).toBe('2022-09-30');
    expect(summary.impressions).toBe(33105084);
    expect(summary.clicks).toBe(85900);
    expect(summary.spend).toBeCloseTo(259841.62, 2);
    expect(summary.sales).toBeCloseTo(383204.65, 2);
    expect(summary.orders).toBe(17792);
    expect(summary.units).toBe(18628);
    expect(summary.campaignCount).toBe(89);
    expect(summary.portfolioCount).toBe(21);
    const strategies = buildStrategyPlacementRows(data.rows);
    expect(strategies.filter((item) => item.biddingStrategy === '动态竞价 – 提高和降低').reduce((sum, item) => sum + item.rowCount, 0)).toBe(2);
  });
});
