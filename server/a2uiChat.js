import {
  SHARE_SCOPE_CATALOG_ID, SHARE_SCOPE_SURFACE_ID, makeA2uiComponentId,
} from '../shared/a2uiCatalog.js';

export const CHAT_SCENES = {
  overview: { label: '综合广告诊断', reportType: null },
  'search-term-diagnosis': { label: '搜索词诊断', reportType: 'search-share' },
  'placement-analysis': { label: '广告位分析', reportType: 'placement' },
  'purchased-product-analysis': { label: '已购买商品分析', reportType: 'purchased-product' },
};
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
const EXTENDED_METRICS = {
  'search-share': [
    ...METRICS['search-share'], ['ctr', 'CTR', 'percent'], ['cpc', 'CPC', 'currency'],
    ['cvr', 'CVR', 'percent'], ['roas', 'ROAS', 'number'],
  ],
  placement: [
    ...METRICS.placement, ['ctr', 'CTR', 'percent'], ['cpc', 'CPC', 'currency'],
    ['cvr', 'CVR', 'percent'], ['roas', 'ROAS', 'number'],
  ],
  'purchased-product': METRICS['purchased-product'],
};
const TREND_DEFAULTS = {
  'search-share': ['spend', 'acos'],
  placement: ['spend', 'acos'],
  'purchased-product': ['sales', 'units'],
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
  ['ctr', 'CTR', 'percent'], ['cpc', 'CPC', 'currency'], ['cvr', 'CVR', 'percent'],
];
const PURCHASED_COLUMNS = [
  ['units', '销售量', 'integer'], ['orders', '订单量', 'integer'], ['sales', '销售额', 'currency'],
];
const BASE_METRICS = {
  'search-share': ['impressions', 'clicks', 'spend', 'orders', 'sales'],
  placement: ['impressions', 'clicks', 'spend', 'orders', 'sales'],
  'purchased-product': ['units', 'orders', 'sales'],
};
const METRIC_COLORS = {
  spend: '#2a78d6', sales: '#1baf7a', orders: '#eb6834', units: '#eb6834',
  acos: '#eda100', ctr: '#6250d6', cvr: '#e87ba4', cpc: '#2a78d6', roas: '#1baf7a',
  impressions: '#6250d6', clicks: '#e87ba4',
};

function available(report) {
  return Boolean(report?.available && report.totals && report.matchedRowCount > 0);
}

function primaryReportType(reports, sceneId) {
  const requested = CHAT_SCENES[sceneId]?.reportType;
  if (requested && available(reports[requested])) return requested;
  return ['search-share', 'placement', 'purchased-product'].find((type) => available(reports[type])) || null;
}

function normalizeSceneId(sceneId, reports) {
  const normalized = Object.hasOwn(CHAT_SCENES, sceneId) ? sceneId : 'overview';
  const required = CHAT_SCENES[normalized].reportType;
  return required && !available(reports[required]) ? 'overview' : normalized;
}

function tableColumns(reportType, keys) {
  const primary = keys.map((key) => [key, {
    searchTerm: '搜索词', campaign: '广告活动', placement: '广告位', biddingStrategy: '竞价策略',
    purchasedAsin: '已购买 ASIN', advertisedAsin: '广告投放 ASIN',
  }[key] || key, 'text']);
  return [...primary, ...(reportType === 'purchased-product' ? PURCHASED_COLUMNS : SEARCH_COLUMNS)]
    .map(([key, label, format]) => ({ key, label, format }));
}

function primaryKeys(reportType, group) {
  if (group === 'campaignPlacements') return ['campaign', 'placement'];
  if (group === 'strategyPlacements') return ['biddingStrategy', 'placement'];
  if (group === 'productPaths') return ['advertisedAsin', 'purchasedAsin'];
  if (group === 'keywords') return ['searchTerm'];
  if (group === 'campaigns' || group === 'campaignPlacements') return ['campaign'];
  if (group === 'placements') return ['placement'];
  if (group === 'purchasedProducts') return ['purchasedAsin'];
  if (group === 'advertisedProducts') return ['advertisedAsin'];
  return [TABLE_DEFS[reportType]?.[0]?.[2] || 'id'];
}

function entityRows(reportType, group, rows, defaultMetric) {
  const keys = primaryKeys(reportType, group);
  const sorted = [...rows].sort((a, b) => (b[defaultMetric] || 0) - (a[defaultMetric] || 0));
  return sorted.map((row) => {
    const entityId = keys.map((key) => String(row[key] || '未填写')).join(' / ');
    return { ...row, entityId, entityLabel: entityId };
  });
}

function metricOptions(reportType) {
  return EXTENDED_METRICS[reportType].map(([key, label, format]) => ({
    key, label, format, color: METRIC_COLORS[key] || '#2a78d6',
  }));
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator * 100 : null;
}

function finishTrendRow(row, reportType) {
  const result = { ...row };
  if (reportType !== 'purchased-product') {
    result.ctr = ratio(result.clicks, result.impressions);
    result.cpc = result.clicks ? result.spend / result.clicks : null;
    result.cvr = ratio(result.orders, result.clicks);
    result.acos = ratio(result.spend, result.sales);
    result.roas = result.spend ? result.sales / result.spend : null;
  }
  return result;
}

function daysBetween(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function aggregateTrendRows(rows, range, reportType) {
  const days = daysBetween(range?.startDate, range?.endDate);
  const granularity = days > 720 ? 'month' : days > 90 ? 'week' : 'day';
  const groups = new Map();
  for (const row of [...(rows || [])].sort((a, b) => a.date.localeCompare(b.date))) {
    let key = row.date;
    if (granularity === 'month') key = row.date.slice(0, 7);
    if (granularity === 'week') {
      const offset = Math.floor((Date.parse(`${row.date}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86400000);
      key = String(Math.max(0, Math.floor(offset / 7)));
    }
    if (!groups.has(key)) {
      const group = { date: row.date };
      for (const metric of BASE_METRICS[reportType]) group[metric] = 0;
      groups.set(key, group);
    }
    const group = groups.get(key);
    for (const metric of BASE_METRICS[reportType]) group[metric] += Number(row[metric]) || 0;
  }
  return { granularity, rows: [...groups.values()].map((row) => finishTrendRow(row, reportType)) };
}

function buildTrend(reportType, report, previousReport, range, previousRange) {
  const current = aggregateTrendRows(report.daily, range, reportType);
  const previous = aggregateTrendRows(previousReport?.daily, previousRange, reportType);
  const length = Math.max(current.rows.length, previous.rows.length);
  const rows = Array.from({ length }, (_, index) => {
    const currentRow = current.rows[index] || {};
    const previousRow = previous.rows[index] || {};
    const combined = { date: currentRow.date || previousRow.date, previousDate: previousRow.date || null };
    for (const [key] of EXTENDED_METRICS[reportType]) {
      combined[key] = currentRow[key] ?? null;
      combined[`previous_${key}`] = previousRow[key] ?? null;
    }
    return combined;
  });
  return {
    title: `${REPORT_LABELS[reportType]} · 双指标趋势`,
    reportType, xKey: 'date', rows, granularity: current.granularity,
    metricOptions: metricOptions(reportType), defaultMetrics: TREND_DEFAULTS[reportType],
    previousAvailable: previous.rows.length > 0,
    previousRange: previousRange || null,
  };
}

function buildEntityView(reportType, group, report) {
  const definition = TABLE_DEFS[reportType].find(([name]) => name === group);
  if (!definition) return null;
  const [, label, , defaultMetric] = definition;
  const allRows = entityRows(reportType, group, report[group] || [], defaultMetric);
  return {
    title: `${REPORT_LABELS[reportType]} · ${label}`,
    reportType, group, entityType: `${reportType}.${group}`,
    entityLabel: label, metricOptions: metricOptions(reportType), defaultMetric,
    rows: allRows.slice(0, 100), totalRows: allRows.length,
  };
}

function buildTable(reportType, group, report) {
  const definition = TABLE_DEFS[reportType].find(([name]) => name === group);
  if (!definition) return null;
  const [, label, , defaultMetric] = definition;
  const keys = primaryKeys(reportType, group);
  const allRows = entityRows(reportType, group, report[group] || [], defaultMetric);
  return {
    title: `${REPORT_LABELS[reportType]} · ${label}明细`,
    reportType, group, entityType: `${reportType}.${group}`, entityLabel: label,
    columns: tableColumns(reportType, keys), rows: allRows.slice(0, 100),
    totalRows: allRows.length, shownRows: Math.min(allRows.length, 100),
  };
}

function extractRecommendations(text) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.filter((line) => /^(?:[-*]|\d+[.、])\s+/.test(line))
    .map((line) => line.replace(/^(?:[-*]|\d+[.、])\s+/, '').replace(/[*_`#]/g, '').trim())
    .filter((line) => line.length >= 8).slice(-6)
    .map((text, index) => ({ id: `recommendation-${index + 1}`, text }));
}

export function buildTrustedChatViewModel(chatData, answerText = '', modelRecommendations = [], requestedScene = 'overview') {
  const reports = chatData.reports || {};
  const previousReports = chatData.previousReports || {};
  const store = chatData.store || {};
  const range = chatData.range || {};
  const sceneId = normalizeSceneId(requestedScene, reports);
  const primaryType = primaryReportType(reports, sceneId);
  const primaryGroup = primaryType === 'search-share' ? 'keywords' : primaryType === 'placement' ? 'placements' : 'purchasedProducts';
  const metrics = [];
  const trends = {};
  const tables = {};
  const rankings = {};
  const compositions = {};
  const quadrants = {};
  const funnels = {};
  const paths = {};
  const scopeReports = [];
  const multipleReports = Object.values(reports).filter(available).length > 1;

  for (const [reportType, report] of Object.entries(reports)) {
    const label = REPORT_LABELS[reportType];
    scopeReports.push({
      id: reportType, label, available: available(report),
      sourceRowCount: report.sourceRowCount || 0, matchedRowCount: report.matchedRowCount || 0,
    });
    if (!available(report)) continue;
    const previousReport = available(previousReports[reportType]) ? previousReports[reportType] : null;
    for (const [key, metricLabel, format] of METRICS[reportType]) {
      const value = report.totals[key];
      const previousValue = previousReport?.totals?.[key] ?? null;
      metrics.push({
        id: `${reportType}.${key}`, reportType, key,
        label: multipleReports ? `${label} · ${metricLabel}` : metricLabel,
        value, previousValue, format,
        delta: value == null || previousValue == null ? null : value - previousValue,
        deltaPercent: value == null || !previousValue ? null : (value - previousValue) / Math.abs(previousValue) * 100,
      });
    }
    if (sceneId === 'overview' || primaryType === reportType) {
      trends[reportType] = buildTrend(reportType, report, previousReport, range, chatData.previousRange);
    }
  }

  if (primaryType) {
    const report = reports[primaryType];
    rankings[`${primaryType}.${primaryGroup}`] = buildEntityView(primaryType, primaryGroup, report);
    tables[`${primaryType}.${primaryGroup}`] = buildTable(primaryType, primaryGroup, report);
    if (primaryType === 'placement' || sceneId === 'overview') {
      compositions[`${primaryType}.${primaryGroup}`] = buildEntityView(primaryType, primaryGroup, report);
    }
    if (primaryType === 'search-share' && sceneId === 'search-term-diagnosis') {
      quadrants['search-share.keywords'] = {
        ...buildEntityView('search-share', 'keywords', report),
        xMetric: 'spend', yMetric: 'acos',
        xLabel: '花费（USD）', yLabel: 'ACOS（%）',
      };
      funnels['search-share'] = {
        title: '搜索词转化漏斗', reportType: 'search-share',
        stages: [
          { key: 'impressions', label: '展示量', value: report.totals.impressions, format: 'integer' },
          { key: 'clicks', label: '点击量', value: report.totals.clicks, format: 'integer' },
          { key: 'orders', label: '订单量', value: report.totals.orders, format: 'integer' },
        ],
      };
    }
    if (primaryType === 'purchased-product') {
      const allPaths = entityRows('purchased-product', 'productPaths', report.productPaths || [], 'sales');
      paths['purchased-product.productPaths'] = {
        title: '投放 ASIN → 已购买 ASIN', reportType: 'purchased-product',
        entityType: 'purchased-product.productPaths', entityLabel: '购买路径',
        links: allPaths.slice(0, 10).map((row) => ({
          source: row.advertisedAsin, target: row.purchasedAsin, value: row.sales,
          entityId: row.entityId, orders: row.orders, units: row.units,
        })),
        rows: allPaths.slice(0, 100), totalRows: allPaths.length,
        columns: tableColumns('purchased-product', ['advertisedAsin', 'purchasedAsin']),
      };
    }
  }

  const recommendations = modelRecommendations.length
    ? modelRecommendations.map((text, index) => ({ id: `recommendation-${index + 1}`, text }))
    : extractRecommendations(answerText);
  return {
    scene: { id: sceneId, label: CHAT_SCENES[sceneId].label },
    scope: {
      storeName: store.name || store.storeName || '当前店铺',
      marketplace: store.marketplace || store.site || '',
      startDate: range.startDate || '', endDate: range.endDate || '',
      previousStartDate: chatData.previousRange?.startDate || '',
      previousEndDate: chatData.previousRange?.endDate || '',
      reports: scopeReports,
    },
    metrics, trends, tables, rankings, compositions, quadrants, funnels, paths, recommendations,
  };
}

export function getAllowedChatDataPaths(viewModel) {
  const paths = ['/scope'];
  for (const key of ['trends', 'tables', 'rankings', 'compositions', 'quadrants', 'funnels', 'paths']) {
    paths.push(...Object.keys(viewModel[key] || {}).map((name) => `/${key}/${name}`));
  }
  if (viewModel.metrics?.length) paths.push('/metrics');
  if (viewModel.recommendations?.length) paths.push('/recommendations');
  return paths;
}

function buildSceneMessages(viewModel) {
  const components = [{ id: 'root', component: 'Column', children: [] }];
  const add = (id, component, path, title) => {
    if (!path.split('/').slice(1).reduce((value, key) => value?.[key], viewModel)) return;
    components[0].children.push(id);
    components.push({ id, component, title, data: { '@path': path } });
  };
  add('scope', 'DataScope', '/scope', `数据范围 · ${viewModel.scene.label}`);
  add('metrics', 'MetricGroup', '/metrics', '核心指标');
  for (const reportType of Object.keys(viewModel.trends)) {
    add(makeA2uiComponentId('trend', reportType), 'TrendChart', `/trends/${reportType}`, `${REPORT_LABELS[reportType]} · 双指标趋势`);
  }
  for (const key of Object.keys(viewModel.rankings)) {
    add(makeA2uiComponentId('ranking', key), 'RankingBarChart', `/rankings/${key}`, '重点对象排行');
  }
  for (const key of Object.keys(viewModel.compositions)) {
    add(makeA2uiComponentId('composition', key), 'CompositionBarChart', `/compositions/${key}`, '结构构成');
  }
  for (const key of Object.keys(viewModel.quadrants)) {
    add(makeA2uiComponentId('quadrant', key), 'QuadrantScatterChart', `/quadrants/${key}`, '花费 × ACOS 四象限');
  }
  for (const key of Object.keys(viewModel.funnels)) {
    add(makeA2uiComponentId('funnel', key), 'ConversionFunnel', `/funnels/${key}`, '转化漏斗');
  }
  for (const key of Object.keys(viewModel.paths)) {
    add(makeA2uiComponentId('path', key), 'PurchasePathChart', `/paths/${key}`, 'ASIN 销售承接路径');
  }
  for (const key of Object.keys(viewModel.tables)) {
    add(makeA2uiComponentId('table', key), 'MetricTable', `/tables/${key}`, '联动明细');
  }
  add('recommendations', 'RecommendationList', '/recommendations', '优先复核建议');
  return [
    { version: '1.0', createSurface: { surfaceId: SHARE_SCOPE_SURFACE_ID, catalogId: SHARE_SCOPE_CATALOG_ID, sendDataModel: false } },
    { version: '1.0', updateComponents: { surfaceId: SHARE_SCOPE_SURFACE_ID, components } },
    { version: '1.0', updateDataModel: { surfaceId: SHARE_SCOPE_SURFACE_ID, path: '/', value: viewModel } },
  ];
}

export function getAdvertisingChatA2uiPrompt() {
  return `请只输出一个 JSON 对象，不要输出 Markdown、代码围栏或 JSON 之外的说明。
格式：{"sceneId":"overview","summary":"中文分析摘要","recommendations":["建议一","建议二"]}
sceneId 只能四选一：overview（综合广告诊断）、search-term-diagnosis（搜索词诊断）、placement-analysis（广告位分析）、purchased-product-analysis（已购买商品分析）。
summary 和 recommendations 必须基于输入的服务端数据，指出有依据的异常和可执行建议；不得编造业务数值。建议最多 6 条，每条需说明对象、动作和原因，并提醒人工复核。
图表、组件、指标数值、数据路径和 ECharts 配置均由服务端生成，禁止输出 createSurface、updateComponents、updateDataModel、option、HTML 或任何函数。`;
}

function parseModelResponse(rawResponse) {
  const raw = String(rawResponse || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const parsed = JSON.parse(fenced || raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('response-object');
  const summary = String(parsed.summary || '').trim();
  if (!summary || summary.length > 20000) throw new Error('summary');
  if (!Array.isArray(parsed.recommendations)) throw new Error('recommendations');
  const recommendations = parsed.recommendations.slice(0, 6).map((item) => String(item).trim());
  if (recommendations.some((item) => item.length < 4 || item.length > 500)) throw new Error('recommendation-length');
  return { sceneId: String(parsed.sceneId || 'overview'), summary, recommendations };
}

export function processChatA2ui(rawResponse, chatData) {
  try {
    const parsed = parseModelResponse(rawResponse);
    const viewModel = buildTrustedChatViewModel(chatData, parsed.summary, parsed.recommendations, parsed.sceneId);
    const messages = buildSceneMessages(viewModel);
    if (JSON.stringify(messages).length > 2000000) throw new Error('payload-size');
    return {
      answer: parsed.summary,
      ui: {
        protocolVersion: '1.0', catalogId: SHARE_SCOPE_CATALOG_ID, status: 'ready', errorCode: null,
        sceneId: viewModel.scene.id, messages,
      },
    };
  } catch {
    const raw = String(rawResponse || '').trim();
    const plainText = raw && !raw.startsWith('{') && !raw.startsWith('```')
      ? raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
      : '';
    return {
      answer: plainText || '本次分析结果无法按约定解析，请重新提问。文字内容未用于生成图表，以避免展示不可信数据。',
      ui: { protocolVersion: '1.0', catalogId: SHARE_SCOPE_CATALOG_ID, status: 'fallback', errorCode: 'invalid-ui', messages: null },
    };
  }
}
