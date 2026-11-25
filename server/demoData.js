import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { importReportDataset, parseReportDate } from './reportImport.js';

const DEMO_TENANT_ID = '00000000-0000-4000-8000-00000000d001';
const DEMO_STORE_ID = '00000000-0000-4000-8000-00000000d101';
const demoDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/demo');

function numberValue(value) {
  if (value == null || String(value).trim() === '') return 0;
  const parsed = Number(String(value).replace(/[$,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readDemoFile(sourceName) {
  return readFile(path.join(demoDirectory, sourceName));
}

async function seedSearchShare() {
  const sourceName = 'search-term-share.csv';
  const buffer = await readDemoFile(sourceName);
  const parsed = Papa.parse(buffer.toString('utf8'), { header: true, skipEmptyLines: 'greedy' });
  if (parsed.errors.some((item) => item.type === 'Delimiter')) throw new Error('Demo 搜索词 CSV 分隔符解析失败');
  const rows = parsed.data.map((row, index) => ({
    source_row: index + 1,
    report_date: parseReportDate(row['日期']),
    search_term: String(row['客户搜索词'] || '').trim(),
    impression_rank: numberValue(row['搜索词展示量排名']),
    impression_share: numberValue(row['搜索词展示份额']),
    targeting: row['投放'] || '',
    match_type: row['匹配类型'] || '',
    portfolio: row['广告组合名称'] || '',
    campaign: row['广告活动名称'] || '',
    ad_group: row['广告组名称'] || '',
    currency: row['货币'] || '',
    clicks: numberValue(row['点击量']),
    impressions: numberValue(row['展示量']),
    ctr: numberValue(row['点击率(CTR)']),
    spend: numberValue(row['花费']),
    cpc: numberValue(row['每次点击成本(CPC)']),
    orders: numberValue(row['7天总订单数(#)']),
    sales: numberValue(row['7天总销售额']),
    acos: numberValue(row['广告成本销售比(ACOS)']),
    roas: numberValue(row['投入产出比(ROAS)']),
    cvr: numberValue(row['7天的转化率']),
  }));
  return { reportType: 'search-share', sourceName, buffer, rows, metadata: { report: 'US1 商品推广搜索词展示量份额报告', sourceFile: sourceName, totalRows: rows.length, skippedRows: 0, duplicateRows: 0, environment: 'demo' } };
}

async function seedNormalized(reportType, sourceName) {
  const buffer = await readDemoFile(sourceName);
  const { rows, ...metadata } = JSON.parse(buffer.toString('utf8'));
  const normalized = rows.map((row, index) => reportType === 'placement' ? {
    source_row: index + 1,
    report_date: row.date,
    portfolio: row.portfolio,
    campaign: row.campaign,
    bidding_strategy: row.biddingStrategy || '',
    placement: row.placement,
    currency: row.currency || '',
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    sales: row.sales,
    orders: row.orders,
    units: row.units,
  } : {
    source_row: index + 1,
    report_date: row.date,
    portfolio: row.portfolio || '',
    campaign: row.campaign,
    ad_group: row.adGroup || '',
    advertised_sku: row.advertisedSku || '',
    advertised_asin: row.advertisedAsin,
    targeting: row.targeting || '',
    match_type: row.matchType || '',
    purchased_asin: row.purchasedAsin,
    currency: row.currency || '',
    units: row.units,
    orders: row.orders,
    sales: row.sales,
  });
  return { reportType, sourceName, buffer, rows: normalized, metadata: { ...metadata, environment: 'demo' } };
}

export async function seedDemoData() {
  const datasets = [
    await seedSearchShare(),
    await seedNormalized('placement', 'placement-report.json'),
    await seedNormalized('purchased-product', 'purchased-product-report.json'),
  ];
  for (const dataset of datasets) {
    const result = await importReportDataset({ tenantId: DEMO_TENANT_ID, storeId: DEMO_STORE_ID, ...dataset });
    console.log(`Demo ${dataset.reportType}: ${result.duplicate ? '已存在' : `导入 ${result.rowCount} 行`}`);
  }
}
