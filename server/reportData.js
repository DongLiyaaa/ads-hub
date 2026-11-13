import { pool } from './db.js';
import { requireStoreAccess } from './tenancy.js';

export const REPORT_TYPES = new Set(['search-share', 'placement', 'purchased-product']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReportDataError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ReportDataError';
    this.status = status;
  }
}

function datasetPayload(dataset, rows, store) {
  return {
    ...dataset.metadata,
    datasetId: dataset.id,
    importedAt: dataset.imported_at,
    totalRows: dataset.row_count,
    storeId: store.id,
    storeName: store.name,
    storeCode: store.code,
    site: store.site,
    rows,
  };
}

export async function getReportPayload(auth, reportType, storeId) {
  if (!REPORT_TYPES.has(reportType)) throw new ReportDataError('未知报表类型', 404);
  const store = await requireStoreAccess(auth, storeId);
  const { rows: datasets } = await pool.query(
    'SELECT * FROM report_datasets WHERE tenant_id = $1 AND store_id = $2 AND report_type = $3 ORDER BY imported_at DESC, id DESC LIMIT 1',
    [auth.tenant.id, store.id, reportType],
  );
  const dataset = datasets[0];
  if (!dataset) throw new ReportDataError('当前报表尚未导入数据库', 404);

  if (reportType === 'search-share') {
    const { rows } = await pool.query('SELECT * FROM search_term_share_rows WHERE dataset_id = $1 ORDER BY source_row', [dataset.id]);
    return datasetPayload(dataset, rows.map((row) => ({
      '日期': row.report_date,
      '客户搜索词': row.search_term,
      '搜索词展示量排名': row.impression_rank,
      '搜索词展示份额': row.impression_share,
      '投放': row.targeting,
      '匹配类型': row.match_type,
      '广告组合名称': row.portfolio,
      '广告活动名称': row.campaign,
      '广告组名称': row.ad_group,
      '货币': row.currency,
      '点击量': row.clicks,
      '展示量': row.impressions,
      '点击率(CTR)': row.ctr,
      '花费': row.spend,
      '每次点击成本(CPC)': row.cpc,
      '7天总订单数(#)': row.orders,
      '7天总销售额': row.sales,
      '广告成本销售比(ACOS)': row.acos,
      '投入产出比(ROAS)': row.roas,
      '7天的转化率': row.cvr,
    })), store);
  }

  if (reportType === 'placement') {
    const { rows } = await pool.query('SELECT * FROM placement_rows WHERE dataset_id = $1 ORDER BY source_row', [dataset.id]);
    return datasetPayload(dataset, rows.map((row) => ({
      date: row.report_date,
      portfolio: row.portfolio,
      campaign: row.campaign,
      biddingStrategy: row.bidding_strategy,
      placement: row.placement,
      currency: row.currency,
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      spend: Number(row.spend),
      sales: Number(row.sales),
      orders: Number(row.orders),
      units: Number(row.units),
    })), store);
  }

  const { rows } = await pool.query('SELECT * FROM purchased_product_rows WHERE dataset_id = $1 ORDER BY source_row', [dataset.id]);
  return datasetPayload(dataset, rows.map((row) => ({
    date: row.report_date,
    portfolio: row.portfolio,
    campaign: row.campaign,
    adGroup: row.ad_group,
    advertisedSku: row.advertised_sku,
    advertisedAsin: row.advertised_asin,
    targeting: row.targeting,
    matchType: row.match_type,
    purchasedAsin: row.purchased_asin,
    currency: row.currency,
    units: Number(row.units),
    orders: Number(row.orders),
    sales: Number(row.sales),
  })), store);
}

export async function getAnalysisDataset(auth, payload) {
  if (!REPORT_TYPES.has(payload?.reportType) || !UUID_PATTERN.test(payload?.datasetId || '')) {
    throw new ReportDataError('缺少有效的报表类型或数据集版本');
  }
  const store = await requireStoreAccess(auth, payload?.storeId);
  const { startDate, endDate } = payload.range || {};
  if (!DATE_PATTERN.test(startDate || '') || !DATE_PATTERN.test(endDate || '') || endDate < startDate) {
    throw new ReportDataError('分析时间范围无效');
  }
  const { rows } = await pool.query(
    'SELECT * FROM report_datasets WHERE id = $1 AND tenant_id = $2 AND store_id = $3 AND report_type = $4',
    [payload.datasetId, auth.tenant.id, store.id, payload.reportType],
  );
  const dataset = rows[0];
  if (!dataset) throw new ReportDataError('数据集版本不存在或报表类型不匹配', 404);
  if (startDate < dataset.min_date || endDate > dataset.max_date) {
    throw new ReportDataError('分析时间范围超出当前数据集');
  }
  return dataset;
}
