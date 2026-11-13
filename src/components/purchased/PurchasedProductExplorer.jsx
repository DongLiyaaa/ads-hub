import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, SearchX, X } from 'lucide-react';
import Papa from 'papaparse';
import HorizontalScroller from '../HorizontalScroller.jsx';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/data.js';

const PAGE_SIZES = [50, 100, 200];
const money = (value) => formatCurrency(value ?? 0);
const safeCsvCell = (value) => /^[=+\-@]/.test(String(value ?? '')) ? `'${value}` : value;
const role = (value) => <span className="product-role">{value}</span>;
const record = (value) => value ? '有源报表记录' : '无源报表记录';

const VIEWS = {
  purchased: {
    label: '已购买 ASIN', fileLabel: '已购买ASIN', searchPlaceholder: '搜索购买 ASIN 或商品角色…',
    columns: [
      { key: 'purchasedAsin', label: '已购买 ASIN', align: 'left' },
      { key: 'sales', label: '销售额', render: money, exportValue: (row) => row.sales.toFixed(2) },
      { key: 'orders', label: '订单', render: formatNumber },
      { key: 'units', label: '销售量', render: formatNumber },
      { key: 'salesShare', label: '销售占比', render: formatPercent, exportValue: (row) => formatPercent(row.salesShare) },
      { key: 'sourceAdvertisedCount', label: '来源广告 ASIN 数', render: formatNumber },
      { key: 'sourceCampaignCount', label: '来源活动数', render: formatNumber },
      { key: 'directAdvertisingRecord', label: '购买 ASIN 投放记录', render: record, exportValue: (row) => record(row.directAdvertisingRecord) },
      { key: 'role', label: '商品角色', align: 'left', render: role },
    ],
  },
  advertised: {
    label: '广告投放 ASIN', fileLabel: '广告投放ASIN', searchPlaceholder: '搜索广告 ASIN、购买 ASIN 或角色…',
    columns: [
      { key: 'advertisedAsin', label: '广告投放 ASIN', align: 'left' },
      { key: 'sales', label: '带动销售额', render: money, exportValue: (row) => row.sales.toFixed(2) },
      { key: 'orders', label: '带动订单', render: formatNumber },
      { key: 'units', label: '带动销售量', render: formatNumber },
      { key: 'purchasedAsinCount', label: '购买 ASIN 数', render: formatNumber },
      { key: 'campaignCount', label: '来源活动数', render: formatNumber },
      { key: 'mainPurchasedAsin', label: '主要购买 ASIN', align: 'left' },
      { key: 'mainPurchasedShare', label: '主要路径占比', render: formatPercent, exportValue: (row) => formatPercent(row.mainPurchasedShare) },
      { key: 'role', label: '商品角色', align: 'left', render: role },
    ],
  },
  paths: {
    label: '购买路径', fileLabel: '购买路径', searchPlaceholder: '搜索广告 ASIN、购买 ASIN 或匹配类型…',
    columns: [
      { key: 'advertisedAsin', label: '广告投放 ASIN', align: 'left' },
      { key: 'purchasedAsin', label: '已购买 ASIN', align: 'left' },
      { key: 'sales', label: '销售额', render: money, exportValue: (row) => row.sales.toFixed(2) },
      { key: 'orders', label: '订单', render: formatNumber },
      { key: 'units', label: '销售量', render: formatNumber },
      { key: 'salesShare', label: '路径销售占比', render: formatPercent, exportValue: (row) => formatPercent(row.salesShare) },
      { key: 'campaignCount', label: '活动数', render: formatNumber },
      { key: 'targetCount', label: '投放目标数', render: formatNumber },
      { key: 'matchTypes', label: '匹配类型', align: 'left' },
      { key: 'pathRole', label: '路径判断', align: 'left', render: role },
      { key: 'action', label: '复核建议', align: 'left' },
    ],
  },
};

export default function PurchasedProductExplorer({ snapshot, startDate, endDate }) {
  const [view, setView] = useState('purchased');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'sales', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [jumpPage, setJumpPage] = useState('1');
  const config = VIEWS[view];
  const sourceRows = snapshot[view];

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const result = sourceRows.filter((row) => !normalized || config.columns.some((column) => String(row[column.key] ?? '').toLocaleLowerCase().includes(normalized)));
    return [...result].sort((a, b) => {
      const first = a[sort.key];
      const second = b[sort.key];
      if (first == null && second == null) return 0;
      if (first == null) return 1;
      if (second == null) return -1;
      const comparison = typeof first === 'string' ? first.localeCompare(String(second), 'zh-CN') : Number(first) - Number(second);
      return (sort.direction === 'asc' ? comparison : -comparison) || String(a.id).localeCompare(String(b.id));
    });
  }, [sourceRows, query, config.columns, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setPage(1), [query, pageSize, startDate, endDate, view]);
  useEffect(() => setJumpPage(String(currentPage)), [currentPage]);

  const changeView = (nextView) => {
    setView(nextView);
    setQuery('');
    setSort({ key: 'sales', direction: 'desc' });
  };
  const changeSort = (key) => {
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));
    setPage(1);
  };
  const goToPage = () => {
    const requested = Number.parseInt(jumpPage, 10);
    const target = Number.isFinite(requested) ? Math.min(pageCount, Math.max(1, requested)) : currentPage;
    setPage(target);
    setJumpPage(String(target));
  };
  const exportCsv = () => {
    const output = filteredRows.map((row) => Object.fromEntries(config.columns.map((column) => [column.label, safeCsvCell(column.exportValue ? column.exportValue(row) : row[column.key])])));
    const blob = new Blob([`﻿${Papa.unparse(output)}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.fileLabel}_${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section className="panel table-panel purchased-explorer" aria-labelledby="purchased-explorer-title">
      <div className="table-toolbar purchased-explorer__heading"><div><h2 id="purchased-explorer-title">商品与购买路径明细</h2><p>投流能力与承接能力分开观察 · 所有金额均为 7 天内其他 SKU 归因</p></div><span className="methodology-note">当前视图 {formatNumber(filteredRows.length)} 条</span></div>
      <div className="analysis-tabs purchased-view-tabs" role="tablist" aria-label="商品明细视图">{Object.entries(VIEWS).map(([id, item]) => <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'is-active' : ''} onClick={() => changeView(id)}>{item.label}<span>{formatNumber(snapshot[id].length)}</span></button>)}</div>
      <div className="table-toolbar purchased-explorer__tools"><div className="table-actions"><label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">搜索当前商品视图</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={config.searchPlaceholder} type="search" />{query && <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="清空搜索"><X size={14} /></button>}</label></div><button type="button" className="secondary-button" onClick={exportCsv} disabled={!filteredRows.length}><Download size={16} aria-hidden="true" />导出当前视图 CSV</button></div>
      <HorizontalScroller className="table-scroll" label={config.label}>
        <table className={`purchased-detail-table purchased-detail-table--${view}`}>
          <caption className="sr-only">{config.label}汇总，可点击列标题排序</caption>
          <thead><tr>{config.columns.map((column) => {
            const active = sort.key === column.key;
            const SortIcon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
            return <th key={column.key} className={column.align === 'left' ? 'align-left' : ''} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className={`sort-button${active ? ' is-active' : ''}`} onClick={() => changeSort(column.key)}>{column.label}<SortIcon size={13} /></button></th>;
          })}</tr></thead>
          <tbody>{visibleRows.map((row) => <tr key={row.id}>{config.columns.map((column) => <td key={column.key} className={`${column.align === 'left' ? 'align-left' : ''}${['purchasedAsin', 'advertisedAsin'].includes(column.key) ? ' keyword-cell' : ''}`} title={['action', 'pathRole'].includes(column.key) ? row[column.key] : undefined}>{column.render ? column.render(row[column.key]) : row[column.key]}</td>)}</tr>)}</tbody>
        </table>
        {!visibleRows.length && <div className="table-empty"><SearchX size={28} strokeWidth={1.5} aria-hidden="true" /><strong>没有匹配的记录</strong><span>试试清空搜索或切换视图</span></div>}
      </HorizontalScroller>
      <div className="table-footer"><span className="table-result-count">{filteredRows.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredRows.length)}` : '0'} / {formatNumber(filteredRows.length)} 条</span><div className="pagination" aria-label="商品表格分页"><label className="page-size">每页<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="每页显示条数">{PAGE_SIZES.map((size) => <option value={size} key={size}>{size} 条</option>)}</select></label><button type="button" aria-label="上一页" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button><div className="page-jump"><span>第</span><input type="number" min="1" max={pageCount} value={jumpPage} aria-label="跳转页码" onChange={(event) => setJumpPage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') goToPage(); }} /><span>/ {pageCount} 页</span></div><button type="button" aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button><button type="button" className="jump-button" onClick={goToPage}>跳转</button></div></div>
      <div className="placement-table-note">商品角色均为候选标签：没有花费、点击、利润、库存及父子 ASIN 映射，不能据此判断盈利、同父体或直接投放效果。</div>
    </section>
  );
}
