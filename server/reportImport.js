import crypto from 'node:crypto';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { pool } from './db.js';
import { ReportDataError, REPORT_TYPES } from './reportData.js';
import { requireStoreAccess } from './tenancy.js';

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
const MAX_ROWS = 100000;

const DEFINITIONS = {
  'search-share': {
    table: 'search_term_share_rows',
    report: '商品推广搜索词展示量份额报告',
    fields: [
      ['report_date', ['日期', 'Date'], 'date', true],
      ['search_term', ['客户搜索词', 'Customer Search Term'], 'text', true],
      ['impression_rank', ['搜索词展示量排名', 'Search Term Impression Rank'], 'number'],
      ['impression_share', ['搜索词展示份额', 'Search Term Impression Share'], 'number'],
      ['targeting', ['投放', 'Targeting'], 'text'],
      ['match_type', ['匹配类型', 'Match Type'], 'text'],
      ['portfolio', ['广告组合名称', 'Portfolio'], 'text'],
      ['campaign', ['广告活动名称', 'Campaign', 'Campaign Name'], 'text'],
      ['ad_group', ['广告组名称', 'Ad Group'], 'text'],
      ['currency', ['货币', 'Currency'], 'text'],
      ['clicks', ['点击量', 'Clicks'], 'integer', true],
      ['impressions', ['展示量', 'Impressions'], 'integer', true],
      ['ctr', ['点击率(CTR)', 'Click-through Rate (CTR)'], 'number'],
      ['spend', ['花费', 'Spend'], 'number', true],
      ['cpc', ['每次点击成本(CPC)', 'Cost Per Click (CPC)'], 'number'],
      ['orders', ['7天总订单数(#)', '7 Day Total Orders (#)'], 'integer', true],
      ['sales', ['7天总销售额', '7 Day Total Sales'], 'number', true],
      ['acos', ['广告成本销售比(ACOS)', 'Advertising Cost of Sales (ACOS)'], 'number'],
      ['roas', ['投入产出比(ROAS)', 'Return on Ad Spend (ROAS)'], 'number'],
      ['cvr', ['7天的转化率', '7 Day Conversion Rate'], 'number'],
    ],
  },
  placement: {
    table: 'placement_rows',
    report: '商品推广广告位报告',
    fields: [
      ['report_date', ['日期', 'Date'], 'date', true],
      ['portfolio', ['广告组合名称', 'Portfolio'], 'text', true],
      ['campaign', ['广告活动名称', 'Campaign', 'Campaign Name'], 'text', true],
      ['bidding_strategy', ['竞价策略', 'Bidding Strategy'], 'text'],
      ['placement', ['广告位', 'Placement'], 'text', true],
      ['currency', ['货币', 'Currency'], 'text'],
      ['impressions', ['展示量', 'Impressions'], 'integer', true],
      ['clicks', ['点击量', 'Clicks'], 'integer', true],
      ['spend', ['花费', 'Spend'], 'number', true],
      ['sales', ['7天总销售额', '7 Day Total Sales'], 'number', true],
      ['orders', ['7天总订单数(#)', '7 Day Total Orders (#)'], 'integer', true],
      ['units', ['7天总销售量(#)', '7 Day Total Units (#)'], 'integer', true],
    ],
  },
  'purchased-product': {
    table: 'purchased_product_rows',
    report: '商品推广已购买商品报告',
    fields: [
      ['report_date', ['日期', 'Date'], 'date', true],
      ['portfolio', ['广告组合名称', 'Portfolio'], 'text'],
      ['campaign', ['广告活动名称', 'Campaign', 'Campaign Name'], 'text', true],
      ['ad_group', ['广告组名称', 'Ad Group'], 'text'],
      ['advertised_sku', ['广告SKU', 'Advertised SKU'], 'text'],
      ['advertised_asin', ['广告ASIN', 'Advertised ASIN'], 'text', true],
      ['targeting', ['投放', 'Targeting'], 'text'],
      ['match_type', ['匹配类型', 'Match Type'], 'text'],
      ['purchased_asin', ['已购买商品ASIN', 'Purchased ASIN'], 'text', true],
      ['currency', ['货币', 'Currency'], 'text'],
      ['units', ['7天其他SKU销售量(#)', '7 Day Other SKU Units (#)'], 'integer', true],
      ['orders', ['7天其他SKU订单数(#)', '7 Day Other SKU Orders (#)'], 'integer', true],
      ['sales', ['7天其他SKU销售额', '7 Day Other SKU Sales'], 'number', true],
    ],
  },
};

function normalizeHeader(value) {
  return cellText(value).replace(/^﻿/, '').replace(/[（）]/g, (character) => character === '（' ? '(' : ')').replace(/\s+/g, '').toLowerCase();
}

function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || '').join('');
    if (Object.hasOwn(value, 'result')) return cellText(value.result);
    if (value.text != null) return String(value.text);
    if (value.hyperlink != null) return String(value.hyperlink);
  }
  return String(value).trim();
}

function validIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseReportDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 300000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  const text = cellText(value);
  let match = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (match) return validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (match && MONTHS[match[1].toLowerCase()]) return validIsoDate(Number(match[3]), Number(MONTHS[match[1].toLowerCase()]), Number(match[2]));
  throw new ReportDataError(`无法识别日期“${text || '空值'}”`);
}

function parseNumber(value, integer) {
  if (value == null || cellText(value) === '') return 0;
  if (typeof value === 'object' && !(value instanceof Date) && Object.hasOwn(value, 'result')) return parseNumber(value.result, integer);
  let text = cellText(value).replace(/[￥¥$€£,\s%]/g, '');
  const negative = /^\(.*\)$/.test(text);
  if (negative) text = text.slice(1, -1);
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < 0 || negative) {
    throw new ReportDataError(`数值“${cellText(value)}”无效${integer ? '，应为非负整数' : '，不能为负数'}`);
  }
  return parsed;
}

function parseRow(row, definition, rowNumber) {
  const result = { source_row: rowNumber };
  try {
    for (const [key, , type, required] of definition.fields) {
      const value = row[key];
      if (type === 'date') result[key] = parseReportDate(value);
      else if (type === 'text') {
        result[key] = cellText(value);
        if (result[key].length > 2000) throw new ReportDataError('文本字段超过 2000 个字符');
        if (required && !result[key]) throw new ReportDataError('必填字段为空');
      } else result[key] = parseNumber(value, type === 'integer');
    }
    return result;
  } catch (error) {
    if (error instanceof ReportDataError) throw new ReportDataError(`Excel 第 ${rowNumber} 行：${error.message}`);
    throw error;
  }
}

function worksheetRows(worksheet) {
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    rows.push({ rowNumber, values: row.values });
  });
  return rows;
}

function headerValues(values) {
  return (Array.isArray(values) ? values : []).map(normalizeHeader);
}

function findHeader(rows, reportType) {
  const candidates = rows.slice(0, 10);
  for (const candidate of candidates) {
    const headers = headerValues(candidate.values);
    for (const [type, definition] of Object.entries(DEFINITIONS)) {
      const matches = definition.fields.every(([, aliases]) => aliases.some((alias) => headers.includes(normalizeHeader(alias))));
      if (matches) return { ...candidate, headers, detectedType: type };
    }
  }
  const expected = DEFINITIONS[reportType].fields.map(([, aliases]) => aliases[0]);
  throw new ReportDataError(`表头校验失败，未识别为所选报表。请确认包含：${expected.join('、')}`);
}

export async function parseReportExcel(buffer, reportType, sourceName = 'report.xlsx') {
  if (!REPORT_TYPES.has(reportType)) throw new ReportDataError('未知报表类型', 404);
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ReportDataError('请选择非空 Excel 文件');
  if (path.extname(sourceName).toLowerCase() !== '.xlsx') throw new ReportDataError('仅支持 .xlsx Excel 文件，请先另存为该格式');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ReportDataError('Excel 文件损坏或加密，无法读取');
  }
  const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 0);
  if (!worksheet) throw new ReportDataError('Excel 中没有工作表数据');
  const sourceRows = worksheetRows(worksheet);
  const header = findHeader(sourceRows, reportType);
  if (header.detectedType !== reportType) {
    const labels = { 'search-share': '搜索词展示份额', placement: '广告位', 'purchased-product': '已购买商品' };
    throw new ReportDataError(`报表类型不匹配：文件是${labels[header.detectedType]}报表，不能上传到${labels[reportType]}页面`);
  }
  const definition = DEFINITIONS[reportType];
  const columnByKey = {};
  for (const [key, aliases] of definition.fields) {
    const indexes = aliases.map((alias) => header.headers.indexOf(normalizeHeader(alias))).filter((index) => index >= 0);
    if (indexes.length !== 1) throw new ReportDataError(`字段“${aliases[0]}”缺失或重复`);
    columnByKey[key] = indexes[0];
  }
  const rows = [];
  for (const sourceRow of sourceRows) {
    if (sourceRow.rowNumber <= header.rowNumber) continue;
    const values = sourceRow.values;
    if (!values.some((value, index) => index > 0 && cellText(value) !== '')) continue;
    if (rows.length >= MAX_ROWS) throw new ReportDataError(`单个文件最多 ${MAX_ROWS} 行数据`, 413);
    const raw = Object.fromEntries(Object.entries(columnByKey).map(([key, index]) => [key, values[index]]));
    rows.push(parseRow(raw, definition, sourceRow.rowNumber));
  }
  if (!rows.length) throw new ReportDataError('Excel 只有表头，没有可导入的数据');
  return {
    rows: rows.map((row, index) => ({ ...row, source_row: index + 1 })),
    metadata: { report: definition.report, sourceFile: path.basename(sourceName), sourceSheet: worksheet.name, totalRows: rows.length, skippedRows: 0, duplicateRows: 0 },
  };
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

export async function importReportDataset({ tenantId, storeId, reportType, sourceName, buffer, metadata, rows }) {
  if (!REPORT_TYPES.has(reportType) || !DEFINITIONS[reportType]) throw new ReportDataError('未知报表类型', 404);
  if (!rows.length) throw new ReportDataError('没有可导入的数据');
  const sourceSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const definition = DEFINITIONS[reportType];
  const columns = ['dataset_id', ...definition.fields.map(([key]) => key)];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`report-import:${tenantId}:${storeId}:${reportType}:${sourceSha256}`]);
    const { rows: existing } = await client.query(
      'SELECT * FROM report_datasets WHERE tenant_id = $1 AND store_id = $2 AND report_type = $3 AND source_sha256 = $4',
      [tenantId, storeId, reportType, sourceSha256],
    );
    if (existing[0]) {
      const { rows: counted } = await client.query(`SELECT count(*)::int AS count FROM ${definition.table} WHERE dataset_id = $1`, [existing[0].id]);
      if (counted[0].count !== existing[0].row_count) throw new ReportDataError('已有数据集行数不一致，请联系管理员处理', 409);
      await client.query('COMMIT');
      return { duplicate: true, datasetId: existing[0].id, rowCount: existing[0].row_count, minDate: existing[0].min_date, maxDate: existing[0].max_date, sourceName: existing[0].source_name, reportType };
    }
    const dates = rows.map((row) => row.report_date).sort();
    const { rows: inserted } = await client.query(
      `INSERT INTO report_datasets (report_type, source_name, source_sha256, metadata, row_count, min_date, max_date, tenant_id, store_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9) RETURNING id`,
      [reportType, path.basename(sourceName), sourceSha256, JSON.stringify(metadata), rows.length, dates[0], dates.at(-1), tenantId, storeId],
    );
    const datasetId = inserted[0].id;
    await insertRows(client, definition.table, columns, rows.map((row) => ({ ...row, dataset_id: datasetId })));
    await client.query('COMMIT');
    return { duplicate: false, datasetId, rowCount: rows.length, minDate: dates[0], maxDate: dates.at(-1), sourceName: path.basename(sourceName), reportType };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function uploadReportExcel(auth, reportType, storeId, sourceName, buffer) {
  if (auth.tenant.environment === 'demo') throw new ReportDataError('Demo 使用共享只读数据，请登录正式工作区后上传', 403);
  const store = await requireStoreAccess(auth, storeId);
  const parsed = await parseReportExcel(buffer, reportType, sourceName);
  return importReportDataset({
    tenantId: auth.tenant.id,
    storeId: store.id,
    reportType,
    sourceName,
    buffer,
    metadata: { ...parsed.metadata, importedBy: auth.user.id, environment: 'formal' },
    rows: parsed.rows,
  });
}
