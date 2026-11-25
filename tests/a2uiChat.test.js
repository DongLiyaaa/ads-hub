import { describe, expect, it } from 'vitest';
import { processChatA2ui } from '../server/a2uiChat.js';
import { getPreviousChatRange } from '../server/chatData.js';
import { validateChatViewState } from '../server/chatViewState.js';

function report(type, prefix = '') {
  const search = type !== 'purchased-product';
  const totals = search
    ? { impressions: 100, clicks: 10, spend: 20, orders: 2, sales: 80, acos: 25 }
    : { units: 5, orders: 2, sales: 80 };
  const daily = [1, 2].map((day) => ({
    date: `2026-11-${String(day).padStart(2, '0')}`,
    ...(search ? { impressions: 50, clicks: 5, spend: 10, orders: 1, sales: 40 } : { units: day, orders: 1, sales: 40 }),
  }));
  const entity = { entityLabel: 'alpha' };
  return {
    available: true, sourceRowCount: 2, matchedRowCount: 2, totals, daily,
    keywords: [{ searchTerm: `${prefix}alpha`, ...totals }],
    campaigns: [{ campaign: `${prefix}campaign`, ...totals }],
    placements: [{ placement: `${prefix}placement`, ...totals }],
    campaignPlacements: [], strategyPlacements: [],
    purchasedProducts: [{ purchasedAsin: `${prefix}B001`, units: 5, orders: 2, sales: 80 }],
    advertisedProducts: [{ advertisedAsin: `${prefix}A001`, units: 5, orders: 2, sales: 80 }],
    productPaths: [{ advertisedAsin: `${prefix}A001`, purchasedAsin: `${prefix}B001`, units: 5, orders: 2, sales: 80 }],
    ...entity,
  };
}

const chatData = {
  store: { name: '测试店铺', marketplace: '美国站' },
  range: { startDate: '2026-11-01', endDate: '2026-11-02' },
  previousRange: { startDate: '2026-10-30', endDate: '2026-10-31' },
  reports: {
    'search-share': report('search-share'),
    placement: report('placement'),
    'purchased-product': report('purchased-product'),
  },
  previousReports: {
    'search-share': report('search-share', 'previous-'),
    placement: report('placement', 'previous-'),
    'purchased-product': report('purchased-product', 'previous-'),
  },
};

function response(sceneId = 'overview', extra = {}) {
  return JSON.stringify({
    sceneId, summary: '分析摘要：优先复核高花费对象。', recommendations: ['人工复核高花费搜索词并小预算验证。'], ...extra,
  });
}

function viewModel(result) {
  return result.ui.messages.find((message) => message.updateDataModel).updateDataModel.value;
}

function components(result) {
  return result.ui.messages.find((message) => message.updateComponents).updateComponents.components;
}

describe('广告 AI 对话场景化 A2UI', () => {
  it('综合诊断由服务端生成可信组件、双轴趋势和上一周期', () => {
    const result = processChatA2ui(response(), chatData);
    expect(result.ui.status).toBe('ready');
    expect(result.ui.sceneId).toBe('overview');
    expect(components(result).map((item) => item.component)).toEqual(expect.arrayContaining([
      'DataScope', 'MetricGroup', 'TrendChart', 'RankingBarChart', 'CompositionBarChart', 'MetricTable', 'RecommendationList',
    ]));
    expect(components(result).every((item) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item.id))).toBe(true);
    const model = viewModel(result);
    expect(model.metrics.find((item) => item.id === 'search-share.spend').value).toBe(20);
    expect(model.trends['search-share'].defaultMetrics).toEqual(['spend', 'acos']);
    expect(model.trends['search-share'].rows[0].previous_spend).toBe(10);
    expect(model.tables['search-share.keywords'].rows[0].searchTerm).toBe('alpha');
  });

  it.each([
    ['search-term-diagnosis', ['QuadrantScatterChart', 'ConversionFunnel', 'RankingBarChart']],
    ['placement-analysis', ['CompositionBarChart', 'RankingBarChart']],
    ['purchased-product-analysis', ['PurchasePathChart', 'RankingBarChart']],
  ])('%s 使用对应场景图表', (sceneId, expected) => {
    const result = processChatA2ui(response(sceneId), chatData);
    expect(result.ui.status).toBe('ready');
    expect(components(result).map((item) => item.component)).toEqual(expect.arrayContaining(expected));
    if (sceneId === 'purchased-product-analysis') {
      expect(viewModel(result).paths['purchased-product.productPaths'].links[0].source).toBe('A001');
      expect(viewModel(result).trends['purchased-product'].defaultMetrics).toEqual(['sales', 'units']);
    }
  });

  it('非法场景和缺失报表场景均降级到可用的综合诊断', () => {
    expect(processChatA2ui(response('unknown'), chatData).ui.sceneId).toBe('overview');
    const withoutPlacement = structuredClone(chatData);
    withoutPlacement.reports.placement = { available: false, sourceRowCount: 0, matchedRowCount: 0 };
    expect(processChatA2ui(response('placement-analysis'), withoutPlacement).ui.sceneId).toBe('overview');
  });

  it('忽略模型提供的数据模型、任意 option 和伪造业务数值', () => {
    const result = processChatA2ui(response('overview', {
      updateDataModel: { value: { metrics: [{ value: 999999 }] } },
      option: { yAxis: [{ max: 999999 }] },
      trustedValue: 999999,
    }), chatData);
    expect(result.ui.status).toBe('ready');
    expect(JSON.stringify(result.ui)).not.toContain('999999');
    expect(JSON.stringify(result.ui)).not.toContain('yAxis');
  });

  it('纯文字回答始终可保存', () => {
    const result = processChatA2ui('当前只有文字结论。', chatData);
    expect(result.answer).toBe('当前只有文字结论。');
    expect(result.ui.status).toBe('fallback');
  });
});

describe('上一等长周期与视图状态', () => {
  it('跨月计算上一等长周期', () => {
    expect(getPreviousChatRange({ startDate: '2026-11-01', endDate: '2026-11-02' }))
      .toEqual({ startDate: '2026-10-30', endDate: '2026-10-31' });
    expect(getPreviousChatRange({ startDate: '2026-03-01', endDate: '2026-03-01' }))
      .toEqual({ startDate: '2026-02-28', endDate: '2026-02-28' });
  });

  const result = processChatA2ui(response('search-term-diagnosis'), chatData);
  const payload = { messages: result.ui.messages };
  const valid = {
    metricByComponent: { 'trend_search_share': ['spend', 'sales'], 'ranking_search_share_keywords': 'clicks' },
    selectedEntity: { type: 'search-share.keywords', id: 'alpha' },
    comparePrevious: true,
    viewByComponent: { 'trend_search_share': 'table' },
  };

  it('只接受当前组件、指标白名单和可信对象', () => {
    expect(validateChatViewState(valid, payload)).toEqual(valid);
  });

  it.each([
    ['未知字段', { ...valid, isAdmin: true }],
    ['非法指标', { ...valid, metricByComponent: { 'trend_search_share': ['spend', 'not-allowed'] } }],
    ['三个趋势指标', { ...valid, metricByComponent: { 'trend_search_share': ['spend', 'sales', 'orders'] } }],
    ['伪造对象', { ...valid, selectedEntity: { type: 'search-share.keywords', id: 'not-in-data' } }],
    ['非法组件', { ...valid, viewByComponent: { root: 'table' } }],
  ])('拒绝%s', (_name, input) => {
    expect(() => validateChatViewState(input, payload)).toThrow();
  });
});
