import { describe, expect, it } from 'vitest';
import { processChatA2ui } from '../server/a2uiChat.js';
import { SHARE_SCOPE_CATALOG_ID } from '../shared/a2uiCatalog.js';

const chatData = {
  store: { name: '测试店铺', marketplace: '美国站' },
  range: { startDate: '2026-11-01', endDate: '2026-11-02' },
  reports: {
    'search-share': {
      available: true, sourceRowCount: 2, matchedRowCount: 2,
      totals: { impressions: 100, clicks: 10, spend: 20, orders: 2, sales: 80, acos: 25 },
      daily: [
        { date: '2026-11-01', impressions: 60, clicks: 6, spend: 12, orders: 1, sales: 40, acos: 30 },
        { date: '2026-11-02', impressions: 40, clicks: 4, spend: 8, orders: 1, sales: 40, acos: 20 },
      ],
      keywords: [{ searchTerm: 'alpha', impressions: 100, clicks: 10, spend: 20, orders: 2, sales: 80, acos: 25 }],
      campaigns: [],
    },
    placement: { available: false, sourceRowCount: 0, matchedRowCount: 0 },
    'purchased-product': { available: false, sourceRowCount: 0, matchedRowCount: 0 },
  },
};

function responseWith(messages, text = '分析摘要\n- 先复核高花费搜索词，再小预算验证。') {
  return `${text}\n<a2ui-json>${JSON.stringify(messages)}</a2ui-json>`;
}

function createSurface() {
  return { version: '1.0', createSurface: { surfaceId: 'chat', catalogId: SHARE_SCOPE_CATALOG_ID, sendDataModel: false } };
}

function updateComponents(components) {
  return { version: '1.0', updateComponents: { surfaceId: 'chat', components } };
}

describe('广告 AI 对话 A2UI 第一阶段', () => {
  it('解析五类组件并只追加服务端可信数据', () => {
    const result = processChatA2ui(responseWith([
      createSurface(),
      updateComponents([
        { id: 'root', component: 'Column', children: ['scope', 'metrics', 'trend', 'table', 'recommendations'] },
        { id: 'scope', component: 'DataScope', data: { '@path':'/scope' } },
        { id: 'metrics', component: 'MetricGroup', data: { '@path':'/metrics' } },
        { id: 'trend', component: 'TrendChart', data: { '@path':'/trends/search-share.spend' } },
        { id: 'table', component: 'MetricTable', data: { '@path':'/tables/search-share.keywords' } },
        { id: 'recommendations', component: 'RecommendationList', data: { '@path':'/recommendations' } },
      ]),
    ]), chatData);
    expect(result.answer).toContain('分析摘要');
    expect(result.ui.status).toBe('ready');
    const dataMessage = result.ui.messages.at(-1);
    expect(dataMessage.updateDataModel.path).toBe('/');
    expect(dataMessage.updateDataModel.value.metrics.find((item) => item.id === 'search-share.spend').value).toBe(20);
    expect(dataMessage.updateDataModel.value.trends['search-share.spend'].rows).toHaveLength(2);
    expect(dataMessage.updateDataModel.value.tables['search-share.keywords'].rows[0].searchTerm).toBe('alpha');
  });

  it('拒绝模型提供的数据模型并保留文字降级', () => {
    const result = processChatA2ui(responseWith([
      createSurface(),
      { version: '1.0', updateDataModel: { surfaceId: 'chat', path: '/', value: { metrics: [{ value: 999999 }] } } },
    ]), chatData);
    expect(result.ui.status).toBe('fallback');
    expect(result.answer).toContain('分析摘要');
    expect(JSON.stringify(result.ui)).not.toContain('999999');
  });

  it('拒绝未授权或不存在的数据路径', () => {
    const result = processChatA2ui(responseWith([
      createSurface(),
      updateComponents([
        { id: 'root', component: 'Column', children: ['table'] },
        { id: 'table', component: 'MetricTable', data: { '@path':'/tables/placement.placements' } },
      ]),
    ]), chatData);
    expect(result.ui.status).toBe('fallback');
    expect(result.ui.errorCode).toBe('invalid-ui');
  });

  it('纯文字回答始终可保存', () => {
    const result = processChatA2ui('当前只有文字结论。', chatData);
    expect(result.answer).toBe('当前只有文字结论。');
    expect(result.ui.status).toBe('fallback');
  });
});
