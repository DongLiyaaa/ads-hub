import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import Papa from 'papaparse';
import { closeDatabase, pool, runMigrations } from '../server/db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

function numberValue(value, fallback = null) {
  if (value == null || String(value).trim() === '') return fallback;
  const parsed = Number(String(value).replace(/[$,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function reportDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match || !MONTHS[match[1]]) throw new Error(`无法识别日期：${text}`);
  return `${match[3]}-${MONTHS[match[1]]}-${String(match[2]).padStart(2, '0')}`;
}

async function insertRows(client, table, columns, rows) {
  for (let offset = 0; offset < rows.length; offset += 200) {
    const batch = rows.slice(offset, offset + 200);
    const values = [];
    const tuples = batch.map((row) => {
      const start = values.length;
      values.push(...columns.map((column) => row[column]));
      return `(${columns.map((_, index) => `$${start + index + 1}`).join(', ')})`;
    });
    await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`, values);
  }
}

async function importDataset({ reportType, sourceName, buffer, metadata, rows, table, columns }) {
  const sourceSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const existing = await pool.query('SELECT id FROM report_datasets WHERE report_type = $1 AND source_sha256 = $2', [reportType, sourceSha256]);
  if (existing.rows.length) {
    const count = await pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE dataset_id = $1`, [existing.rows[0].id]);
    if (count.rows[0].count !== rows.length) throw new Error(`${reportType} 已导入记录数不一致`);
    console.log(`${reportType}: 已存在，${rows.length} 行，无需重复导入`);
    return existing.rows[0].id;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dates = rows.map((row) => row.report_date).sort();
    const { rows: inserted } = await client.query(
      `INSERT INTO report_datasets (report_type, source_name, source_sha256, metadata, row_count, min_date, max_date)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING id`,
      [reportType, sourceName, sourceSha256, JSON.stringify(metadata), rows.length, dates[0], dates.at(-1)],
    );
    const datasetId = inserted[0].id;
    await insertRows(client, table, columns, rows.map((row) => ({ ...row, dataset_id: datasetId })));
    await client.query('COMMIT');
    console.log(`${reportType}: 已导入 ${rows.length} 行，数据集 ${datasetId}`);
    return datasetId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function importSearchShare() {
  const sourceName = 'search-term-share.csv';
  const buffer = await readFile(path.join(root, 'public/data', sourceName));
  const parsed = Papa.parse(buffer.toString('utf8'), { header: true, skipEmptyLines: 'greedy' });
  if (parsed.errors.some((item) => item.type === 'Delimiter')) throw new Error('搜索词 CSV 分隔符解析失败');
  const rows = parsed.data.map((row, index) => ({
    source_row: index + 1,
    report_date: reportDate(row['日期']),
    search_term: String(row['客户搜索词'] || '').trim(),
    impression_rank: numberValue(row['搜索词展示量排名']),
    impression_share: numberValue(row['搜索词展示份额']),
    targeting: row['投放'], match_type: row['匹配类型'], portfolio: row['广告组合名称'],
    campaign: row['广告活动名称'], ad_group: row['广告组名称'], currency: row['货币'],
    clicks: numberValue(row['点击量'], 0), impressions: numberValue(row['展示量'], 0),
    ctr: numberValue(row['点击率(CTR)']), spend: numberValue(row['花费'], 0), cpc: numberValue(row['每次点击成本(CPC)']),
    orders: numberValue(row['7天总订单数(#)'], 0), sales: numberValue(row['7天总销售额'], 0),
    acos: numberValue(row['广告成本销售比(ACOS)']), roas: numberValue(row['投入产出比(ROAS)']), cvr: numberValue(row['7天的转化率']),
  }));
  return importDataset({
    reportType: 'search-share', sourceName, buffer,
    metadata: { report: 'US1 商品推广搜索词展示量份额报告', sourceFile: sourceName, skippedRows: 0 },
    rows, table: 'search_term_share_rows',
    columns: ['dataset_id', 'source_row', 'report_date', 'search_term', 'impression_rank', 'impression_share', 'targeting', 'match_type', 'portfolio', 'campaign', 'ad_group', 'currency', 'clicks', 'impressions', 'ctr', 'spend', 'cpc', 'orders', 'sales', 'acos', 'roas', 'cvr'],
  });
}

async function importNormalized(reportType, sourceName) {
  const buffer = await readFile(path.join(root, 'public/data', sourceName));
  const payload = JSON.parse(buffer.toString('utf8'));
  const { rows, ...metadata } = payload;
  const table = reportType === 'placement' ? 'placement_rows' : 'purchased_product_rows';
  const columns = reportType === 'placement'
    ? ['dataset_id', 'source_row', 'report_date', 'portfolio', 'campaign', 'bidding_strategy', 'placement', 'currency', 'impressions', 'clicks', 'spend', 'sales', 'orders', 'units']
    : ['dataset_id', 'source_row', 'report_date', 'portfolio', 'campaign', 'ad_group', 'advertised_sku', 'advertised_asin', 'targeting', 'match_type', 'purchased_asin', 'currency', 'units', 'orders', 'sales'];
  const normalized = rows.map((row, index) => reportType === 'placement' ? {
    dataset_id: null, source_row: index + 1, report_date: row.date, portfolio: row.portfolio, campaign: row.campaign,
    bidding_strategy: row.biddingStrategy, placement: row.placement, currency: row.currency, impressions: row.impressions,
    clicks: row.clicks, spend: row.spend, sales: row.sales, orders: row.orders, units: row.units,
  } : {
    dataset_id: null, source_row: index + 1, report_date: row.date, portfolio: row.portfolio, campaign: row.campaign,
    ad_group: row.adGroup, advertised_sku: row.advertisedSku, advertised_asin: row.advertisedAsin, targeting: row.targeting,
    match_type: row.matchType, purchased_asin: row.purchasedAsin, currency: row.currency, units: row.units, orders: row.orders, sales: row.sales,
  });
  return importDataset({ reportType, sourceName, buffer, metadata, rows: normalized, table, columns });
}

try {
  await runMigrations();
  await importSearchShare();
  await importNormalized('placement', 'placement-report.json');
  await importNormalized('purchased-product', 'purchased-product-report.json');
} finally {
  await closeDatabase();
}
