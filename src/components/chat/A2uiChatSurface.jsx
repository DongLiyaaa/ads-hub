import { Component, useEffect, useMemo, useState } from 'react';
import { A2uiSurface, createComponentImplementation } from '@a2ui/react';
import { MessageProcessor } from '@a2ui/web_core/v1_0';
import { ColumnApi } from '@a2ui/web_core/v1_0';
import Chart from '../Chart.jsx';
import {
  createShareScopeCatalog, DataScopeApi, MetricGroupApi, MetricTableApi,
  RecommendationListApi, SHARE_SCOPE_SURFACE_ID, TrendChartApi,
} from '../../../shared/a2uiCatalog.js';

const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function formatValue(value, format = 'number') {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'text') return String(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (format === 'currency') return currencyFormatter.format(number);
  if (format === 'percent') return `${numberFormatter.format(number)}%`;
  if (format === 'integer') return integerFormatter.format(number);
  return numberFormatter.format(number);
}

function SectionHeading({ title, detail }) {
  return <div className="a2ui-section-heading"><h3>{title}</h3>{detail ? <span>{detail}</span> : null}</div>;
}

const Column = createComponentImplementation(ColumnApi, ({ props, buildChild }) => (
  <div className="a2ui-chat-column">{(props.children || []).map((child) => buildChild(child))}</div>
));

const DataScope = createComponentImplementation(DataScopeApi, ({ props }) => {
  const scope = props.data || {};
  return <section className="a2ui-block a2ui-scope">
    <SectionHeading title={props.title || '数据范围'} detail="仅包含当前授权店铺与站点" />
    <div className="a2ui-scope__context"><strong>{scope.storeName || '当前店铺'}</strong><span>{scope.marketplace || '站点未标注'}</span><time>{scope.startDate} 至 {scope.endDate}</time></div>
    <div className="a2ui-scope__reports">{(scope.reports || []).map((report) => <div key={report.id} className={report.available ? 'is-available' : 'is-unavailable'}><span>{report.label}</span><strong>{report.available ? `${integerFormatter.format(report.matchedRowCount)} 行匹配` : '未导入'}</strong></div>)}</div>
  </section>;
});

const MetricGroup = createComponentImplementation(MetricGroupApi, ({ props }) => (
  <section className="a2ui-block">
    <SectionHeading title={props.title || '核心指标'} detail="由服务端汇总数据计算" />
    <div className="a2ui-metric-grid">{(props.data || []).map((metric) => <div className="a2ui-metric" key={metric.id}><span>{metric.label}</span><strong>{formatValue(metric.value, metric.format)}</strong></div>)}</div>
  </section>
));

function DataTable({ data, compact = false }) {
  if (!data?.rows?.length) return <div className="a2ui-empty">当前范围暂无数据</div>;
  return <div className="a2ui-table-scroll"><table className={compact ? 'a2ui-table is-compact' : 'a2ui-table'}>
    <thead><tr>{data.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
    <tbody>{data.rows.map((row, rowIndex) => <tr key={row.id || `${rowIndex}-${data.columns.map((column) => row[column.key]).join('-')}`}>{data.columns.map((column) => <td key={column.key}>{formatValue(row[column.key], column.format)}</td>)}</tr>)}</tbody>
  </table></div>;
}

const MetricTable = createComponentImplementation(MetricTableApi, ({ props }) => {
  const data = props.data || { columns: [], rows: [] };
  return <section className="a2ui-block">
    <SectionHeading title={props.title || data.title || '指标明细'} detail={`显示 ${data.shownRows || data.rows.length} / ${data.totalRows || data.rows.length} 组`} />
    <DataTable data={data} />
  </section>;
});

const TrendChart = createComponentImplementation(TrendChartApi, ({ props }) => {
  const [view, setView] = useState('chart');
  const data = props.data || { rows: [], series: [], columns: [] };
  const series = data.series || [];
  const format = data.format || 'number';
  const tableData = useMemo(() => ({
    rows: data.rows || [],
    columns: [
      { key: data.xKey || 'date', label: '日期', format: 'text' },
      ...series.map((item) => ({ key: item.key, label: item.label, format })),
    ],
  }), [data.rows, data.xKey, format, series]);
  const option = useMemo(() => ({
    animationDuration: 350,
    color: series.map((item) => item.color),
    grid: { left: 12, right: 20, top: series.length > 1 ? 52 : 24, bottom: 12, containLabel: true },
    legend: series.length > 1 ? { top: 0, left: 0, itemWidth: 20, itemHeight: 3, itemGap: 18, textStyle: { color: '#525d6d', fontSize: 12 } } : undefined,
    tooltip: {
      trigger: 'axis', renderMode: 'richText', confine: true,
      backgroundColor: '#17202b', borderWidth: 0, padding: [10, 12],
      textStyle: { color: '#ffffff', fontSize: 13 },
      axisPointer: { type: 'line', lineStyle: { color: '#a9b4c2', width: 1 } },
      formatter: (params) => params.length ? [params[0].axisValue, ...params.map((item) => `${item.marker} ${item.seriesName}  ${formatValue(item.value, format)}`)].join('\n') : '',
    },
    xAxis: {
      type: 'category', data: (data.rows || []).map((row) => row[data.xKey || 'date']), boundaryGap: false,
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#dfe4ea' } },
      axisLabel: { color: '#7a8493', fontSize: 12, margin: 12, hideOverlap: true },
    },
    yAxis: {
      type: 'value', min: 0,
      axisLabel: { color: '#7a8493', fontSize: 12, formatter: (value) => formatValue(value, format) },
      splitLine: { lineStyle: { color: '#edf0f4', width: 1 } },
    },
    series: series.map((item) => ({
      name: item.label, type: 'line', data: (data.rows || []).map((row) => row[item.key]),
      showSymbol: (data.rows || []).length <= 2, symbol: 'circle', symbolSize: 8, connectNulls: false,
      lineStyle: { width: 2 }, itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
      emphasis: { focus: 'series', scale: 1.25 },
    })),
  }), [data.rows, data.xKey, format, series]);

  return <section className="a2ui-block">
    <div className="a2ui-section-heading a2ui-section-heading--action"><div><h3>{props.title || data.title || '每日趋势'}</h3><span>单指标趋势 · 悬浮查看数值</span></div><div className="a2ui-view-switch" role="group" aria-label="趋势展示方式"><button type="button" className={view === 'chart' ? 'is-active' : ''} onClick={() => setView('chart')}>趋势图</button><button type="button" className={view === 'table' ? 'is-active' : ''} onClick={() => setView('table')}>数据表</button></div></div>
    {view === 'chart' && data.rows?.length ? <Chart className="a2ui-trend-chart" option={option} ariaLabel={`${props.title || data.title || '指标'}每日趋势折线图`} style={{ height: 280 }} /> : null}
    {view === 'table' ? <DataTable data={tableData} compact /> : null}
    {view === 'chart' && !data.rows?.length ? <div className="a2ui-empty">当前范围暂无趋势数据</div> : null}
  </section>;
});

const RecommendationList = createComponentImplementation(RecommendationListApi, ({ props }) => (
  <section className="a2ui-block a2ui-recommendations">
    <SectionHeading title={props.title || '建议列表'} detail="AI 建议，需人工复核后执行" />
    {(props.data || []).length ? <ol>{props.data.map((item) => <li key={item.id}><span>{item.text}</span></li>)}</ol> : <div className="a2ui-empty">本轮没有单独的结构化建议</div>}
  </section>
));

const catalog = createShareScopeCatalog([Column, DataScope, MetricGroup, TrendChart, MetricTable, RecommendationList]);

class A2uiErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <div className="a2ui-fallback" role="status">结构化视图暂时不可用，已保留上方文字分析。</div>;
    return this.props.children;
  }
}

function Surface({ ui }) {
  const processor = useMemo(() => {
    const next = new MessageProcessor([catalog], undefined, { version: '1.0' });
    next.processMessages(ui.messages);
    return next;
  }, [ui.messages]);
  useEffect(() => () => processor.dispose(), [processor]);
  const surface = processor.model.getSurface(SHARE_SCOPE_SURFACE_ID);
  return surface ? <A2uiSurface surface={surface} /> : <div className="a2ui-fallback">结构化视图缺少可渲染内容，已保留文字分析。</div>;
}

export default function A2uiChatSurface({ ui }) {
  if (!ui || ui.status !== 'ready' || !Array.isArray(ui.messages)) return null;
  return <A2uiErrorBoundary><div className="a2ui-chat-surface"><Surface ui={ui} /></div></A2uiErrorBoundary>;
}
