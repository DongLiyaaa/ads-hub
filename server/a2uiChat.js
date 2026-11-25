import { A2uiGenerator, CatalogConfig, DirectJsonFormatFactory } from '@a2ui/agent';
import {
  createShareScopeCatalog, SHARE_SCOPE_CATALOG_ID, SHARE_SCOPE_SURFACE_ID,
} from '../shared/a2uiCatalog.js';

const REPORT_LABELS = {
  'search-share': '搜索词展示份额',
  placement: '广告位报表',
  'purchased-product': '已购买商品',
};
const METRICS = {
  'search-share': [
    ['impressions', '展示量', 'integer'], ['clicks', '点击量', 'integer'],
    ['spend', '花费', 'currency'], ['sales', '销售额', 'currency'],
    ['orders', '订单量', 'integer'], ['acos', 'ACOS', 'percent'],
  ],
  placement: [
    ['impressions', '展示量', 'integer'], ['clicks', '点击量', 'integer'],
    ['spend', '花费', 'currency'], ['sales', '销售额', 'currency'],
    ['orders', '订单量', 'integer'], ['acos', 'ACOS', 'percent'],
  ],
  'purchased-product': [
    ['units', '销售量', 'integer'], ['orders', '订单量', 'integer'], ['sales', '其他 SKU 销售额', 'currency'],
  ],
};
const TABLE_DEFS = {
  'search-share': [
    ['keywords', '搜索词', 'searchTerm', 'spend'],
    ['campaigns', '广告活动', 'campaign', 'spend'],
  ],
  placement: [
    ['placements', '广告位', 'placement', 'spend'],
    ['campaignPlacements', '活动 × 广告位', 'campaign', 'spend'],
    ['strategyPlacements', '竞价策略 × 广告位', 'biddingStrategy', 'spend'],
  ],
  'purchased-product': [
    ['purchasedProducts', '已购买 ASIN', 'purchasedAsin', 'sales'],
    ['advertisedProducts', '广告投放 ASIN', 'advertisedAsin', 'sales'],
  ],
};
const SEARCH_COLUMNS = [
  ['impressions', '展示量', 'integer'], ['clicks', '点击量', 'integer'],
  ['spend', '花费', 'currency'], ['sales', '销售额', 'currency'],
  ['orders', '订单量', 'integer'], ['acos', 'ACOS', 'percent'],
];
const PURCHASED_COLUMNS = [
  ['units', '销售量', 'integer'], ['orders', '订单量', 'integer'], ['sales', '销售额', 'currency'],
];

const generator = new A2uiGenerator(
  [new CatalogConfig(createShareScopeCatalog())],
  undefined,
  new DirectJsonFormatFactory(),
);
let cachedPromptSnippet;

export function getA2uiPromptSnippet() {
  if (!cachedPromptSnippet) {
    cachedPromptSnippet = generator.createProcessor({
      '1.0': { supportedCatalogIds: [SHARE_SCOPE_CATALOG_ID] },
    }).promptSnippet;
  }
  return cachedPromptSnippet;
}

export function getAdvertisingChatA2uiPrompt() {
  return `${getA2uiPromptSnippet()}

ShareScope 输出约束：
1. 先用简短中文文字直接回答，再输出且只输出一个 <a2ui-json> 块；不要在块内重复完整文字分析。
2. 只允许 createSurface 和 updateComponents。surfaceId 固定为 chat，catalogId 固定为 ${SHARE_SCOPE_CATALOG_ID}，sendDataModel 为 false。
3. root 必须是 Column 且排在 components 第一项。按问题需要选用 DataScope、MetricGroup、TrendChart、MetricTable、RecommendationList，不要输出其他组件。
4. 所有 data 属性必须使用 {"@path":"服务端路径"}（v1.0 不使用 path）。禁止 updateDataModel、deleteSurface、action、callAgentFunction、callRendererFunction、函数表达式、URL、HTML 和任意图表 option。
5. 仅可使用本次额外提供的路径清单。趋势和表格必须选择与问题直接相关的路径，不要堆砌全部视图。无数据路径时不要创建对应组件。

结构示例（仅示范结构，不得复制其中不存在的路径）：
<a2ui-json>[
  {"version":"1.0","createSurface":{"surfaceId":"chat","catalogId":"${SHARE_SCOPE_CATALOG_ID}","sendDataModel":false}},
  {"version":"1.0","updateComponents":{"surfaceId":"chat","components":[
    {"id":"root","component":"Column","children":["scope","metrics"]},
    {"id":"scope","component":"DataScope","title":"数据范围","data":{"@path":"/scope"}},
    {"id":"metrics","component":"MetricGroup","title":"核心指标","data":{"@path":"/metrics"}}
  ]}}
]</a2ui-json>`;
}

function tableColumns(reportType, keys) {
  const primary = keys.map((key) => [key, {
    searchTerm: '搜索词', campaign: '广告活动', placement: '广告位', biddingStrategy: '竞价策略',
    purchasedAsin: '已购买 ASIN', advertisedAsin: '广告投放 ASIN',
  }[key] || key, 'text']);
  return [...primary, ...(reportType === 'purchased-product' ? PURCHASED_COLUMNS : SEARCH_COLUMNS)]
    .map(([key, label, format]) => ({ key, label, format }));
}

function extractRecommendations(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const bullets = lines
    .filter((line) => /^(?:[-*]|\d+[.、])\s+/.test(line))
    .map((line) => line.replace(/^(?:[-*]|\d+[.、])\s+/, '').replace(/[*_`#]/g, '').trim())
    .filter((line) => line.length >= 8);
  return bullets.slice(-6).map((textValue, index) => ({ id: `recommendation-${index + 1}`, text: textValue }));
}

export function buildTrustedChatViewModel(chatData, answerText = '') {
  const reports = chatData.reports || {};
  const store = chatData.store || {};
  const range = chatData.range || {};
  const metrics = [];
  const trends = {};
  const tables = {};
  const scopeReports = [];
  const multipleReports = Object.values(reports).filter((report) => report.available && report.matchedRowCount > 0).length > 1;

  for (const [reportType, report] of Object.entries(reports)) {
    const label = REPORT_LABELS[reportType];
    scopeReports.push({
      id: reportType, label, available: Boolean(report.available),
      sourceRowCount: report.sourceRowCount || 0, matchedRowCount: report.matchedRowCount || 0,
    });
    if (!report.available || !report.totals) continue;
    for (const [key, metricLabel, format] of METRICS[reportType]) {
      metrics.push({
        id: `${reportType}.${key}`,
        label: multipleReports ? `${label} · ${metricLabel}` : metricLabel,
        value: report.totals[key], format,
      });
    }
    for (const [key, metricLabel, format] of METRICS[reportType]) {
      if (key === 'impressions' || key === 'clicks') continue;
      trends[`${reportType}.${key}`] = {
        title: `${label} · 每日${metricLabel}`,
        xKey: 'date', format,
        series: [{ key: 'value', label: metricLabel, color: '#2a78d6' }],
        rows: (report.daily || []).map((row) => ({ date: row.date, value: row[key] })),
      };
    }
    for (const [group, groupLabel, , sortKey] of TABLE_DEFS[reportType]) {
      const rows = report[group] || [];
      const primaryKeys = group === 'campaignPlacements'
        ? ['campaign', 'placement']
        : group === 'strategyPlacements' ? ['biddingStrategy', 'placement']
          : [group === 'keywords' ? 'searchTerm' : group === 'campaigns' ? 'campaign'
            : group === 'placements' ? 'placement' : group === 'purchasedProducts' ? 'purchasedAsin' : 'advertisedAsin'];
      tables[`${reportType}.${group}`] = {
        title: `${label} · ${groupLabel} Top 20`,
        columns: tableColumns(reportType, primaryKeys),
        rows: [...rows].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)).slice(0, 20),
        totalRows: rows.length,
        shownRows: Math.min(rows.length, 20),
      };
    }
  }

  return {
    scope: {
      storeName: store.name || store.storeName || '当前店铺',
      marketplace: store.marketplace || store.site || '',
      startDate: range.startDate || '',
      endDate: range.endDate || '',
      reports: scopeReports,
    },
    metrics,
    trends,
    tables,
    recommendations: extractRecommendations(answerText),
  };
}

export function getAllowedChatDataPaths(viewModel) {
  return [
    '/scope', ...(viewModel.metrics.length ? ['/metrics'] : []),
    ...Object.keys(viewModel.trends).map((key) => `/trends/${key}`),
    ...Object.keys(viewModel.tables).map((key) => `/tables/${key}`),
    ...(viewModel.recommendations.length ? ['/recommendations'] : []),
  ];
}

function validateMessages(messages, allowedPaths) {
  if (!messages.length || messages.length > 8) throw new Error('message-count');
  const [first, ...rest] = messages;
  const surface = first?.createSurface;
  if (!surface || surface.surfaceId !== SHARE_SCOPE_SURFACE_ID || surface.catalogId !== SHARE_SCOPE_CATALOG_ID || surface.sendDataModel !== false) {
    throw new Error('surface');
  }
  if (surface.dataModel || surface.components) throw new Error('model-data-forbidden');
  const components = [];
  for (const message of rest) {
    if (!message.updateComponents || message.updateComponents.surfaceId !== SHARE_SCOPE_SURFACE_ID) throw new Error('message-type');
    components.push(...message.updateComponents.components);
  }
  if (!components.length || components.length > 24 || components[0]?.id !== 'root' || components[0]?.component !== 'Column') {
    throw new Error('components');
  }
  const ids = new Set();
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(walk);
    if ('call' in value || '@call' in value || 'action' in value) throw new Error('function-forbidden');
    if ('path' in value || '@path' in value) {
      if (typeof value['@path'] !== 'string') throw new Error('path');
      if (!allowedPaths.has(value['@path'])) throw new Error('path');
    }
    Object.values(value).forEach(walk);
  };
  for (const component of components) {
    if (!component.id || ids.has(component.id)) throw new Error('component-id');
    if (component.component === 'Column' && (!Array.isArray(component.children) || !component.children.every((child) => typeof child === 'string'))) throw new Error('children');
    if (component.component !== 'Column' && (typeof component.data?.['@path'] !== 'string' || Object.keys(component.data).length !== 1)) throw new Error('data-binding');
    if (typeof component.title === 'string' && component.title.length > 120) throw new Error('title-length');
    ids.add(component.id);
    walk(component);
  }
  return components;
}

function textWithoutA2ui(text) {
  return String(text || '').replace(/<a2ui-json>[\s\S]*?(?:<\/a2ui-json>|$)/gi, '').trim();
}

export function processChatA2ui(rawResponse, chatData) {
  const plainText = textWithoutA2ui(rawResponse);
  try {
    const processor = generator.createProcessor({ '1.0': { supportedCatalogIds: [SHARE_SCOPE_CATALOG_ID] } });
    const parts = processor.parseResponse(rawResponse);
    const text = parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n\n').trim() || plainText;
    const answer = text || '已完成本次广告数据分析，请查看下方结构化结果。';
    const modelMessages = parts.filter((part) => part.type === 'a2ui').flatMap((part) => part.a2ui);
    const viewModel = buildTrustedChatViewModel(chatData, answer);
    const allowedPaths = new Set(getAllowedChatDataPaths(viewModel));
    validateMessages(modelMessages, allowedPaths);
    const messages = [...modelMessages, {
      version: '1.0',
      updateDataModel: { surfaceId: SHARE_SCOPE_SURFACE_ID, path: '/', value: viewModel },
    }];
    if (JSON.stringify(messages).length > 2000000) throw new Error('payload-size');
    return {
      answer,
      ui: { protocolVersion: '1.0', catalogId: SHARE_SCOPE_CATALOG_ID, status: 'ready', errorCode: null, messages },
    };
  } catch {
    return {
      answer: plainText || String(rawResponse || '已完成分析，但结构化视图暂时不可用。'),
      ui: { protocolVersion: '1.0', catalogId: SHARE_SCOPE_CATALOG_ID, status: 'fallback', errorCode: 'invalid-ui', messages: null },
    };
  }
}
