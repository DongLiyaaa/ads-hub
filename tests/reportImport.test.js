import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseReportExcel } from '../server/reportImport.js';

const HEADERS = {
  'search-share': ['日期', '客户搜索词', '搜索词展示量排名', '搜索词展示份额', '投放', '匹配类型', '广告组合名称', '广告活动名称', '广告组名称', '货币', '点击量', '展示量', '点击率(CTR)', '花费', '每次点击成本(CPC)', '7天总订单数(#)', '7天总销售额', '广告成本销售比(ACOS)', '投入产出比(ROAS)', '7天的转化率'],
  placement: ['日期', '广告组合名称', '广告活动名称', '竞价策略', '广告位', '货币', '展示量', '点击量', '花费', '7天总销售额', '7天总订单数(#)', '7天总销售量(#)'],
  'purchased-product': ['日期', '广告组合名称', '广告活动名称', '广告组名称', '广告SKU', '广告ASIN', '投放', '匹配类型', '已购买商品ASIN', '货币', '7天其他SKU销售量(#)', '7天其他SKU订单数(#)', '7天其他SKU销售额'],
};

const ROWS = {
  'search-share': ['Sep 1, 2022', 'iphone case', 2, '6.01%', 'iphone case', 'EXACT', 'Portfolio', 'Campaign', 'Group', 'USD', 3, 100, '3%', '$12.50', '$4.17', 1, '$20', '62.5%', '1.60', '33.33%'],
  placement: ['2022-09-01', 'Portfolio', 'Campaign', '固定竞价', 'productPages', 'USD', 100, 3, 12.5, 20, 1, 2],
  'purchased-product': ['2022-09-01', 'Portfolio', 'Campaign', 'Group', 'SKU', 'B08D794QHQ', '*', '-', 'B08D794QHR', 'USD', 2, 1, 20],
};

async function workbookBuffer(type, rows = [ROWS[type]], headers = HEADERS[type]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('Excel 报表上传解析', () => {
  it('解析搜索词展示份额报表并保留 Amazon 指标口径', async () => {
    const result = await parseReportExcel(await workbookBuffer('search-share'), 'search-share', 'search.xlsx');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ report_date: '2022-09-01', search_term: 'iphone case', impression_share: 6.01, clicks: 3, impressions: 100, spend: 12.5, sales: 20, acos: 62.5, roas: 1.6 });
    expect(result.metadata.sourceSheet).toBe('Report');
  });

  it('解析广告位与已购买商品报表', async () => {
    const placement = await parseReportExcel(await workbookBuffer('placement'), 'placement', 'placement.xlsx');
    const purchased = await parseReportExcel(await workbookBuffer('purchased-product'), 'purchased-product', 'purchased.xlsx');
    expect(placement.rows[0]).toMatchObject({ placement: 'productPages', units: 2, orders: 1 });
    expect(purchased.rows[0]).toMatchObject({ advertised_asin: 'B08D794QHQ', purchased_asin: 'B08D794QHR', units: 2, sales: 20 });
  });

  it('拒绝把广告位报表上传到搜索词页面', async () => {
    await expect(parseReportExcel(await workbookBuffer('placement'), 'search-share', 'wrong.xlsx')).rejects.toThrow('文件是广告位报表，不能上传到搜索词展示份额页面');
  });

  it('任意一行校验失败都会拒绝整个文件', async () => {
    const rows = [ROWS.placement, [...ROWS.placement]];
    rows[1][6] = '不是数字';
    await expect(parseReportExcel(await workbookBuffer('placement', rows), 'placement', 'invalid.xlsx')).rejects.toThrow('Excel 第 3 行');
  });

  it('拒绝缺少必填表头的文件', async () => {
    const headers = HEADERS.placement.filter((header) => header !== '广告位');
    const rows = [ROWS.placement.slice(1)];
    await expect(parseReportExcel(await workbookBuffer('placement', rows, headers), 'placement', 'missing.xlsx')).rejects.toThrow('表头校验失败');
  });

  it('只接受 xlsx 文件', async () => {
    await expect(parseReportExcel(await workbookBuffer('placement'), 'placement', 'legacy.xls')).rejects.toThrow('仅支持 .xlsx');
  });
});
