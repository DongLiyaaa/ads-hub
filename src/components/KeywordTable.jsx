import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, SearchX, X } from 'lucide-react';
import Papa from 'papaparse';
import { formatCurrency, formatNumber, formatPercent } from '../lib/data.js';

const PAGE_SIZES = [50, 100, 200];
const safeCsvCell = (value) => {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const columns = [
  { key: 'keyword', label: '客户搜索词', align: 'left', render: (row) => row.keyword },
  { key: 'share', label: '加权展示份额', render: (row) => formatPercent(row.share) },
  { key: 'averageRank', label: '平均展示排名', render: (row) => row.averageRank == null ? '—' : formatNumber(row.averageRank, 1) },
  { key: 'impressions', label: '展示量', render: (row) => formatNumber(row.impressions) },
  { key: 'clicks', label: '点击量', render: (row) => formatNumber(row.clicks) },
  { key: 'ctr', label: '点击率', render: (row) => formatPercent(row.ctr) },
  { key: 'cost', label: '花费', render: (row) => formatCurrency(row.cost) },
  { key: 'cpc', label: 'CPC', render: (row) => row.cpc == null ? '—' : formatCurrency(row.cpc) },
  { key: 'orders', label: '订单数', render: (row) => formatNumber(row.orders) },
  { key: 'sales', label: '销售额', render: (row) => formatCurrency(row.sales) },
  { key: 'acos', label: 'ACOS', render: (row) => formatPercent(row.acos) },
];

export default function KeywordTable({ keywords, startDate, endDate }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'impressions', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [jumpPage, setJumpPage] = useState('1');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const result = normalized
      ? keywords.filter((item) => item.keyword.toLocaleLowerCase().includes(normalized))
      : [...keywords];
    return result.sort((a, b) => {
      const first = a[sort.key];
      const second = b[sort.key];
      if (first == null && second == null) return 0;
      if (first == null) return 1;
      if (second == null) return -1;
      const comparison = typeof first === 'string'
        ? first.localeCompare(second, 'zh-CN')
        : first - second;
      return (sort.direction === 'asc' ? comparison : -comparison) || a.keyword.localeCompare(b.keyword);
    });
  }, [keywords, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [query, pageSize, startDate, endDate]);
  useEffect(() => setJumpPage(String(currentPage)), [currentPage]);

  const goToPage = () => {
    const requestedPage = Number.parseInt(jumpPage, 10);
    const targetPage = Number.isFinite(requestedPage) ? Math.min(pageCount, Math.max(1, requestedPage)) : currentPage;
    setPage(targetPage);
    setJumpPage(String(targetPage));
  };

  const changeSort = (key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  };

  const exportCsv = () => {
    const rows = filtered.map((item) => ({
      '客户搜索词': safeCsvCell(item.keyword),
      '加权展示份额': formatPercent(item.share),
      '平均展示排名': item.averageRank == null ? '' : item.averageRank.toFixed(2),
      '展示量': item.impressions,
      '点击量': item.clicks,
      '点击率': formatPercent(item.ctr),
      '花费(USD)': item.cost.toFixed(2),
      'CPC(USD)': item.cpc?.toFixed(2) ?? '',
      '订单数': item.orders,
      '销售额(USD)': item.sales.toFixed(2),
      'ACOS': formatPercent(item.acos),
    }));
    const blob = new Blob([`﻿${Papa.unparse(rows)}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `搜索词汇总_${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section className="panel table-panel" aria-labelledby="table-title">
      <div className="table-toolbar">
        <div>
          <h2 id="table-title">关键词汇总</h2>
          <p>共 {formatNumber(keywords.length)} 个搜索词 · 当前结果 {formatNumber(filtered.length)} 个</p>
        </div>
        <div className="table-actions">
          <label className="search-field">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">搜索客户搜索词</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索关键词…" type="search" />
            {query && <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="清空搜索"><X size={14} /></button>}
          </label>
          <button type="button" className="secondary-button" onClick={exportCsv} disabled={!filtered.length}>
            <Download size={16} aria-hidden="true" />导出 CSV
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table className="keyword-table">
          <caption className="sr-only">按当前时间范围汇总的关键词表现，可点击列标题排序</caption>
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort.key === column.key;
                const SortIcon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={column.key} className={column.align === 'left' ? 'align-left' : ''} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={active ? 'sort-button is-active' : 'sort-button'} onClick={() => changeSort(column.key)}>
                      {column.label}<SortIcon size={13} aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.keyword}>
                {columns.map((column) => (
                  <td key={column.key} className={`${column.align === 'left' ? 'align-left keyword-cell' : ''}${column.key === 'share' ? ' share-cell' : ''}`} title={column.key === 'keyword' ? row.keyword : undefined}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleRows.length && (
          <div className="table-empty">
            <SearchX size={28} strokeWidth={1.5} aria-hidden="true" />
            <strong>没有匹配的搜索词</strong>
            <span>试试其他关键词，或调整时间范围</span>
          </div>
        )}
      </div>

      <div className="table-footer">
        <span className="table-result-count">{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)}` : '0'} / {formatNumber(filtered.length)} 条</span>
        <div className="pagination" aria-label="表格分页">
          <label className="page-size">每页
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="每页显示条数">
              {PAGE_SIZES.map((size) => <option value={size} key={size}>{size} 条</option>)}
            </select>
          </label>
          <button type="button" aria-label="上一页" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
          <div className="page-jump">
            <span>第</span>
            <input
              type="number"
              min={1}
              max={pageCount}
              value={jumpPage}
              aria-label="跳转页码"
              onChange={(event) => setJumpPage(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') goToPage(); }}
            />
            <span>/ {pageCount} 页</span>
          </div>
          <button type="button" aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button>
          <button type="button" className="jump-button" onClick={goToPage}>跳转</button>
        </div>
      </div>
    </section>
  );
}
