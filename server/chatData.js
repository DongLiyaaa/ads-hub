import { pool } from './db.js';
import { getReportPayload, ReportDataError, REPORT_TYPES } from './reportData.js';
import { requireStoreAccess } from './tenancy.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (!DATE_PATTERN.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateChatRange(startDate, endDate) {
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
    throw new ReportDataError('请选择有效的分析时间范围');
  }
  return { startDate, endDate };
}

async function getLatestDatasets(tenantId, storeId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (report_type) id, report_type, min_date, max_date, row_count, imported_at
     FROM report_datasets WHERE tenant_id = $1 AND store_id = $2
     ORDER BY report_type, imported_at DESC, id DESC`,
    [tenantId, storeId],
  );
  return rows;
}

export async function getChatContext(auth, storeId) {
  const store = await requireStoreAccess(auth, storeId);
  const rows = await getLatestDatasets(auth.tenant.id, store.id);
  const datasets = Object.fromEntries([...REPORT_TYPES].map((type) => {
    const row = rows.find((item) => item.report_type === type);
    return [type, row ? {
      id: row.id, minDate: row.min_date, maxDate: row.max_date,
      rowCount: Number(row.row_count), importedAt: row.imported_at,
    } : null];
  }));
  const newest = rows.reduce((latest, row) => (
    !latest || new Date(row.imported_at) > new Date(latest.imported_at) ? row : latest
  ), null);
  return {
    store,
    datasets,
    range: newest ? { startDate: newest.min_date, endDate: newest.max_date } : null,
  };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator * 100 : null;
}

function finalize(group, metrics) {
  const result = { ...group.keys };
  for (const metric of metrics) result[metric] = group[metric];
  if (metrics.includes('clicks')) {
    result.ctr = ratio(result.clicks, result.impressions);
    result.cpc = result.clicks ? result.spend / result.clicks : null;
    result.cvr = ratio(result.orders, result.clicks);
  }
  if (metrics.includes('spend')) {
    result.acos = ratio(result.spend, result.sales);
    result.roas = result.spend ? result.sales / result.spend : null;
  }
  return result;
}

export function aggregateRows(rows, keyFields, metrics) {
  const groups = new Map();
  for (const row of rows) {
    const keys = Object.fromEntries(keyFields.map((field) => [field, row[field] || '未填写']));
    const key = JSON.stringify(keys);
    if (!groups.has(key)) {
      const group = { keys };
      for (const metric of metrics) group[metric] = 0;
      groups.set(key, group);
    }
    const group = groups.get(key);
    for (const metric of metrics) group[metric] += number(row[metric]);
  }
  return [...groups.values()].map((group) => finalize(group, metrics));
}

const SEARCH_METRICS = ['impressions', 'clicks', 'spend', 'orders', 'sales'];
const PURCHASED_METRICS = ['units', 'orders', 'sales'];

function searchRows(rows) {
  return rows.map((row) => ({
    date: row['日期'], searchTerm: row['客户搜索词'], campaign: row['广告活动名称'],
    impressions: number(row['展示量']), clicks: number(row['点击量']),
    spend: number(row['花费']), orders: number(row['7天总订单数(#)']), sales: number(row['7天总销售额']),
  }));
}

function summarizeSearch(payload, range) {
  const rows = searchRows(payload.rows).filter((row) => row.date >= range.startDate && row.date <= range.endDate);
  return {
    sourceRowCount: payload.totalRows, matchedRowCount: rows.length,
    totals: aggregateRows(rows, [], SEARCH_METRICS)[0] || null,
    daily: aggregateRows(rows, ['date'], SEARCH_METRICS),
    keywords: aggregateRows(rows, ['searchTerm'], SEARCH_METRICS),
    campaigns: aggregateRows(rows, ['campaign'], SEARCH_METRICS),
  };
}

function summarizePlacement(payload, range) {
  const rows = payload.rows.filter((row) => row.date >= range.startDate && row.date <= range.endDate);
  return {
    sourceRowCount: payload.totalRows, matchedRowCount: rows.length,
    totals: aggregateRows(rows, [], SEARCH_METRICS)[0] || null,
    daily: aggregateRows(rows, ['date'], SEARCH_METRICS),
    placements: aggregateRows(rows, ['placement'], SEARCH_METRICS),
    campaignPlacements: aggregateRows(rows, ['campaign', 'placement'], SEARCH_METRICS),
    strategyPlacements: aggregateRows(rows, ['biddingStrategy', 'placement'], SEARCH_METRICS),
  };
}

function summarizePurchased(payload, range) {
  const rows = payload.rows.filter((row) => row.date >= range.startDate && row.date <= range.endDate);
  return {
    sourceRowCount: payload.totalRows, matchedRowCount: rows.length,
    totals: aggregateRows(rows, [], PURCHASED_METRICS)[0] || null,
    daily: aggregateRows(rows, ['date'], PURCHASED_METRICS),
    purchasedProducts: aggregateRows(rows, ['purchasedAsin'], PURCHASED_METRICS),
    advertisedProducts: aggregateRows(rows, ['advertisedAsin'], PURCHASED_METRICS),
    productPaths: aggregateRows(rows, ['advertisedAsin', 'purchasedAsin'], PURCHASED_METRICS),
  };
}

export async function buildChatData(auth, input) {
  const range = validateChatRange(input.startDate, input.endDate);
  const store = await requireStoreAccess(auth, input.storeId);
  const entries = await Promise.all([...REPORT_TYPES].map(async (reportType) => {
    try {
      const payload = await getReportPayload(auth, reportType, store.id);
      const summarize = reportType === 'search-share' ? summarizeSearch : reportType === 'placement' ? summarizePlacement : summarizePurchased;
      return [reportType, { available: true, datasetId: payload.datasetId, ...summarize(payload, range) }];
    } catch (error) {
      if (error instanceof ReportDataError && error.status === 404) {
        return [reportType, { available: false, sourceRowCount: 0, matchedRowCount: 0 }];
      }
      throw error;
    }
  }));
  const reports = Object.fromEntries(entries);
  if (!entries.some(([, report]) => report.available && report.matchedRowCount > 0)) {
    throw new ReportDataError('当前时间范围内没有可分析的广告数据', 404);
  }
  return {
    store,
    range,
    reports,
    dataSnapshot: {
      storeId: store.id,
      range,
      datasets: Object.fromEntries(entries.map(([type, report]) => [type, {
        available: report.available,
        datasetId: report.datasetId || null,
        sourceRowCount: report.sourceRowCount,
        matchedRowCount: report.matchedRowCount,
      }])),
    },
  };
}
