import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Download, Search, SearchX, TrendingUp, X } from 'lucide-react';
import Papa from 'papaparse';
import HorizontalScroller from '../HorizontalScroller.jsx';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/data.js';
import { buildCampaignHierarchy, PLACEMENT_MAP, PLACEMENTS } from '../../lib/placementData.js';
import { getOpportunityReasons, getRiskReasons } from '../../lib/placementAnalysis.js';

const PAGE_SIZES = [50, 100, 200];
const money = (value) => value == null ? '—' : formatCurrency(value);
const multiple = (value) => value == null ? '—' : `${value.toFixed(2)}×`;
const safeCsvCell = (value) => /^[=+\-@]/.test(String(value ?? '')) ? `'${value}` : value;

const columns = [
  { key: 'campaign', label: '广告活动 / 广告位', align: 'left' },
  { key: 'portfolio', label: '广告组合', align: 'left' },
  { key: 'biddingStrategy', label: '竞价策略', align: 'left' },
  { key: 'impressions', label: '展示量', render: (row) => formatNumber(row.impressions) },
  { key: 'clicks', label: '点击量', render: (row) => formatNumber(row.clicks) },
  { key: 'spend', label: '花费', render: (row) => money(row.spend) },
  { key: 'sales', label: '销售额', render: (row) => money(row.sales) },
  { key: 'orders', label: '订单', render: (row) => formatNumber(row.orders) },
  { key: 'ctr', label: 'CTR', render: (row) => formatPercent(row.ctr) },
  { key: 'cpc', label: 'CPC', render: (row) => money(row.cpc) },
  { key: 'cvr', label: 'CVR', render: (row) => formatPercent(row.cvr) },
  { key: 'cpo', label: 'CPO', render: (row) => money(row.cpo) },
  { key: 'acos', label: 'ACOS', render: (row) => formatPercent(row.acos) },
  { key: 'roas', label: 'ROAS', render: (row) => multiple(row.roas) },
];

function Diagnosis({ row, summary }) {
  const risks = getRiskReasons(row, summary);
  const opportunities = getOpportunityReasons(row, summary);
  if (risks.length) return <span className="diagnosis-tag diagnosis-tag--risk" title={risks.join('；')}><CircleAlert size={13} aria-hidden="true" />风险复核</span>;
  if (opportunities.length) return <span className="diagnosis-tag diagnosis-tag--opportunity" title={opportunities.join('；')}><TrendingUp size={13} aria-hidden="true" />扩量候选</span>;
  return <span className="diagnosis-empty">—</span>;
}

export default function PlacementCampaignTable({ rows, summary, startDate, endDate }) {
  const [query, setQuery] = useState('');
  const [portfolio, setPortfolio] = useState('all');
  const [strategy, setStrategy] = useState('all');
  const [placement, setPlacement] = useState('all');
  const [sort, setSort] = useState({ key: 'spend', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [jumpPage, setJumpPage] = useState('1');
  const [expanded, setExpanded] = useState(() => new Set());

  const options = useMemo(() => ({
    portfolios: Array.from(new Set(rows.map((row) => row.portfolio))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    strategies: Array.from(new Set(rows.flatMap((row) => row.biddingStrategy.split('、')))).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN')),
  }), [rows]);

  const filteredDetails = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return rows.filter((row) => (
      (!normalized || row.campaign.toLocaleLowerCase().includes(normalized))
      && (portfolio === 'all' || row.portfolio === portfolio)
      && (strategy === 'all' || row.biddingStrategy.split('、').includes(strategy))
      && (placement === 'all' || row.placement === placement)
    ));
  }, [rows, query, portfolio, strategy, placement]);

  const campaigns = useMemo(() => {
    const result = buildCampaignHierarchy(filteredDetails);
    return result.sort((a, b) => {
      const first = a[sort.key];
      const second = b[sort.key];
      if (first == null && second == null) return 0;
      if (first == null) return 1;
      if (second == null) return -1;
      const comparison = typeof first === 'string' ? first.localeCompare(second, 'zh-CN') : first - second;
      return (sort.direction === 'asc' ? comparison : -comparison) || a.campaign.localeCompare(b.campaign, 'zh-CN');
    });
  }, [filteredDetails, sort]);

  const pageCount = Math.max(1, Math.ceil(campaigns.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = campaigns.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [query, pageSize, startDate, endDate, portfolio, strategy, placement]);
  useEffect(() => setJumpPage(String(currentPage)), [currentPage]);

  const goToPage = () => {
    const requested = Number.parseInt(jumpPage, 10);
    const target = Number.isFinite(requested) ? Math.min(pageCount, Math.max(1, requested)) : currentPage;
    setPage(target);
    setJumpPage(String(target));
  };
  const changeSort = (key) => {
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));
    setPage(1);
  };
  const toggleExpanded = (key) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const exportCsv = () => {
    const output = filteredDetails.map((row) => ({
      '广告组合': safeCsvCell(row.portfolio),
      '广告活动': safeCsvCell(row.campaign),
      '竞价策略': safeCsvCell(row.biddingStrategy),
      '广告位': row.placementLabel,
      '展示量': row.impressions,
      '点击量': row.clicks,
      '花费(USD)': row.spend.toFixed(2),
      '7天销售额(USD)': row.sales.toFixed(2),
      '7天订单数': row.orders,
      'CTR': formatPercent(row.ctr),
      'CPC(USD)': row.cpc?.toFixed(2) ?? '',
      'CVR': formatPercent(row.cvr),
      'CPO(USD)': row.cpo?.toFixed(2) ?? '',
      'ACOS': formatPercent(row.acos),
      'ROAS': row.roas?.toFixed(4) ?? '',
    }));
    const blob = new Blob([`﻿${Papa.unparse(output)}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `广告位活动明细_${startDate}_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section className="panel table-panel placement-campaign-panel" aria-labelledby="placement-campaign-title">
      <div className="table-toolbar placement-campaign-toolbar">
        <div>
          <h2 id="placement-campaign-title">广告活动 × 广告位明细</h2>
          <p>共 {formatNumber(campaigns.length)} 个广告活动 · {formatNumber(filteredDetails.length)} 个广告位组合 · 点击活动展开</p>
        </div>
        <div className="table-actions placement-table-actions">
          <label className="search-field">
            <Search size={17} aria-hidden="true" /><span className="sr-only">搜索广告活动</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索广告活动…" type="search" />
            {query && <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="清空搜索"><X size={14} /></button>}
          </label>
          <label className="table-filter-select"><span className="sr-only">广告组合</span><select value={portfolio} onChange={(event) => setPortfolio(event.target.value)}><option value="all">全部广告组合</option>{options.portfolios.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="table-filter-select"><span className="sr-only">竞价策略</span><select value={strategy} onChange={(event) => setStrategy(event.target.value)}><option value="all">全部竞价策略</option>{options.strategies.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="table-filter-select"><span className="sr-only">广告位</span><select value={placement} onChange={(event) => setPlacement(event.target.value)}><option value="all">全部广告位</option>{PLACEMENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <button type="button" className="secondary-button" onClick={exportCsv} disabled={!filteredDetails.length}><Download size={16} aria-hidden="true" />导出 CSV</button>
        </div>
      </div>
      <HorizontalScroller className="table-scroll" label="广告活动与广告位明细表">
        <table className="placement-campaign-table">
          <caption className="sr-only">广告活动汇总，可展开查看广告位明细，可点击列标题排序</caption>
          <thead><tr>
            {columns.map((column) => {
              const active = sort.key === column.key;
              const SortIcon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return <th key={column.key} className={column.align === 'left' ? 'align-left' : ''} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className={`sort-button${active ? ' is-active' : ''}`} onClick={() => changeSort(column.key)}>{column.label}<SortIcon size={13} /></button></th>;
            })}
            <th>诊断</th>
          </tr></thead>
          <tbody>
            {visibleRows.flatMap((row) => {
              const isExpanded = expanded.has(row.campaignKey);
              const parent = (
                <tr key={row.campaignKey} className="campaign-parent-row">
                  {columns.map((column) => (
                    <td key={column.key} className={column.align === 'left' ? 'align-left' : ''}>
                      {column.key === 'campaign' ? (
                        <div className="campaign-name-cell"><button type="button" className="expand-button" aria-label={`${isExpanded ? '收起' : '展开'} ${row.campaign}`} aria-expanded={isExpanded} onClick={() => toggleExpanded(row.campaignKey)}>{isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button><span className="keyword-cell" title={row.campaign}>{row.campaign}</span></div>
                      ) : column.render ? column.render(row) : <span className={column.key === 'portfolio' ? 'campaign-secondary-cell' : 'keyword-cell'} title={row[column.key]}>{row[column.key]}</span>}
                    </td>
                  ))}
                  <td><Diagnosis row={row} summary={summary} /></td>
                </tr>
              );
              if (!isExpanded) return [parent];
              return [parent, ...row.placements.map((detail) => (
                <tr key={detail.id} className="campaign-child-row">
                  {columns.map((column) => (
                    <td key={column.key} className={column.align === 'left' ? 'align-left' : ''}>
                      {column.key === 'campaign' ? <div className="campaign-placement-cell"><span className="expand-placeholder" /><span className="placement-label"><i style={{ backgroundColor: PLACEMENT_MAP.get(detail.placement)?.color }} aria-hidden="true" />{detail.placementLabel}</span></div>
                        : column.key === 'portfolio' || column.key === 'biddingStrategy' ? <span className="child-inherited-value">{detail[column.key]}</span>
                          : column.render(detail)}
                    </td>
                  ))}
                  <td><Diagnosis row={detail} summary={summary} /></td>
                </tr>
              ))];
            })}
          </tbody>
        </table>
        {!visibleRows.length && <div className="table-empty"><SearchX size={28} strokeWidth={1.5} aria-hidden="true" /><strong>没有匹配的广告活动</strong><span>试试清空搜索或调整筛选条件</span></div>}
      </HorizontalScroller>
      <div className="table-footer">
        <span className="table-result-count">{campaigns.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, campaigns.length)}` : '0'} / {formatNumber(campaigns.length)} 个活动</span>
        <div className="pagination" aria-label="表格分页">
          <label className="page-size">每页<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="每页显示条数">{PAGE_SIZES.map((size) => <option value={size} key={size}>{size} 条</option>)}</select></label>
          <button type="button" aria-label="上一页" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
          <div className="page-jump"><span>第</span><input type="number" min="1" max={pageCount} value={jumpPage} aria-label="跳转页码" onChange={(event) => setJumpPage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') goToPage(); }} /><span>/ {pageCount} 页</span></div>
          <button type="button" aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button>
          <button type="button" className="jump-button" onClick={goToPage}>跳转</button>
        </div>
      </div>
      <div className="placement-table-note">诊断仅用于相对表现复核：点击≥30次才进入候选；不代表盈利，也不会自动调整广告。</div>
    </section>
  );
}
