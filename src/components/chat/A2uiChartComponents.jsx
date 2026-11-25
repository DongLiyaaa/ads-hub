import { useMemo, useState } from 'react';
import { createComponentImplementation } from '@a2ui/react';
import Chart from '../Chart.jsx';
import {
  CompositionBarChartApi, ConversionFunnelApi, PurchasePathChartApi,
  QuadrantScatterChartApi, RankingBarChartApi, TrendChartApi, makeA2uiComponentId,
} from '../../../shared/a2uiCatalog.js';
import { useChatViewState } from './ChatViewState.jsx';

const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const integerFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const currencyFormatter = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#6250d6', '#e87ba4'];
const METRIC_UNITS = { currency: 'USD', percent: '%', integer: '次/个', number: '倍' };

export function formatValue(value, format = 'number') {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'text') return String(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (format === 'currency') return currencyFormatter.format(number);
  if (format === 'percent') return `${numberFormatter.format(number)}%`;
  if (format === 'integer') return integerFormatter.format(number);
  return numberFormatter.format(number);
}

function formatAxis(value, format) {
  if (!Number.isFinite(Number(value))) return '—';
  if (format === 'percent') return `${numberFormatter.format(value)}%`;
  if (format === 'currency') return `$${compactFormatter.format(value)}`;
  return compactFormatter.format(value);
}

function metricDefinition(data, key) {
  return data.metricOptions?.find((item) => item.key === key) || { key, label: key, format: 'number', color: '#2a78d6' };
}

function metricUnit(metric) {
  if (metric.format === 'integer') return ['impressions', 'clicks'].includes(metric.key) ? '次' : '个';
  return METRIC_UNITS[metric.format] || '';
}

function ChartHeader({ title, detail, children }) {
  return <div className="a2ui-section-heading a2ui-section-heading--action"><div><h3>{title}</h3><span>{detail}</span></div><div className="a2ui-chart-controls">{children}</div></div>;
}

function ViewSwitch({ view, onChange, chartLabel = '图表' }) {
  return <div className="a2ui-view-switch" role="group" aria-label="展示方式"><button type="button" className={view === 'chart' ? 'is-active' : ''} onClick={() => onChange('chart')}>{chartLabel}</button><button type="button" className={view === 'table' ? 'is-active' : ''} onClick={() => onChange('table')}>数据表</button></div>;
}

function MetricSelect({ label = '指标', value, options, onChange, allowEmpty = false, excluded }) {
  return <label className="a2ui-metric-select"><span>{label}</span><select value={value || ''} onChange={(event) => onChange(event.target.value)}>
    {allowEmpty ? <option value="">不显示</option> : null}
    {options.filter((item) => item.key !== excluded).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
  </select></label>;
}

export function DataTable({ data, compact = false }) {
  const { viewState, selectEntity } = useChatViewState();
  const selected = viewState.selectedEntity;
  const linked = selected && data.entityType === selected.type;
  const rows = linked ? (data.rows || []).filter((row) => row.entityId === selected.id) : (data.rows || []);
  if (!rows.length) return <div className="a2ui-empty">{linked ? '当前明细中未找到该对象，可点击其他图例重新选择' : '当前范围暂无数据'}</div>;
  return <div className="a2ui-table-scroll"><table className={compact ? 'a2ui-table is-compact' : 'a2ui-table'}>
    <thead><tr>{data.columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
    <tbody>{rows.map((row, rowIndex) => {
      const selectable = Boolean(data.entityType && row.entityId);
      const isSelected = linked && row.entityId === selected.id;
      return <tr key={row.entityId || row.id || rowIndex} className={`${selectable ? 'is-selectable' : ''}${isSelected ? ' is-selected' : ''}`} onClick={selectable ? () => selectEntity({ type: data.entityType, id: row.entityId }) : undefined} onKeyDown={selectable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectEntity({ type: data.entityType, id: row.entityId }); } } : undefined} tabIndex={selectable ? 0 : undefined}>
        {data.columns.map((column) => <td key={column.key}>{formatValue(row[column.key], column.format)}</td>)}
      </tr>;
    })}</tbody>
  </table></div>;
}

function ChartBlock({ title, detail, view, onView, controls, chartLabel, tableData, children, empty = false }) {
  return <section className="a2ui-block a2ui-chart-block">
    <ChartHeader title={title} detail={detail}><>{controls}<ViewSwitch view={view} onChange={onView} chartLabel={chartLabel} /></></ChartHeader>
    {view === 'table' ? <DataTable data={tableData} compact /> : empty ? <div className="a2ui-empty">当前范围暂无可绘制数据</div> : children}
  </section>;
}

function LegacyTrend({ title, data }) {
  const [view, setView] = useState('chart');
  const series = data.series || [];
  const format = data.format || 'number';
  const tableData = {
    rows: data.rows || [],
    columns: [{ key: data.xKey || 'date', label: '日期', format: 'text' }, ...series.map((item) => ({ key: item.key, label: item.label, format }))],
  };
  const option = {
    animationDuration: 350, color: series.map((item) => item.color),
    grid: { left: 12, right: 20, top: series.length > 1 ? 52 : 24, bottom: 12, containLabel: true },
    legend: series.length > 1 ? { top: 0, left: 0, textStyle: { color: '#525d6d', fontSize: 12 } } : undefined,
    tooltip: { trigger: 'axis', confine: true, formatter: (params) => params.length ? [params[0].axisValue, ...params.map((item) => `${item.marker} ${item.seriesName}  ${formatValue(item.value, format)}`)].join('<br>') : '' },
    xAxis: { type: 'category', data: (data.rows || []).map((row) => row[data.xKey || 'date']), boundaryGap: false, axisLabel: { color: '#7a8493', fontSize: 12, hideOverlap: true } },
    yAxis: { type: 'value', min: 0, axisLabel: { color: '#7a8493', fontSize: 12, formatter: (value) => formatAxis(value, format) }, splitLine: { lineStyle: { color: '#edf0f4' } } },
    series: series.map((item) => ({ name: item.label, type: 'line', data: (data.rows || []).map((row) => row[item.key]), showSymbol: (data.rows || []).length <= 2, symbolSize: 8, lineStyle: { width: 2 } })),
  };
  return <ChartBlock title={title || data.title || '每日趋势'} detail="历史消息 · 单指标趋势" view={view} onView={setView} tableData={tableData} empty={!data.rows?.length}><Chart option={option} ariaLabel={`${title || '指标'}历史趋势图`} style={{ height: 280 }} /></ChartBlock>;
}

function ModernTrend({ title, data }) {
  const id = makeA2uiComponentId('trend', data.reportType);
  const { viewState, setMetric, setView, setComparePrevious } = useChatViewState();
  const allowed = new Set((data.metricOptions || []).map((item) => item.key));
  const saved = viewState.metricByComponent[id];
  const metrics = Array.isArray(saved) && saved.length && saved.every((key) => allowed.has(key)) ? saved.slice(0, 2) : data.defaultMetrics.slice(0, 2);
  const view = viewState.viewByComponent[id] || 'chart';
  const compare = viewState.comparePrevious && data.previousAvailable;
  const updateMetric = (index, value) => {
    const next = [...metrics];
    if (!value) next.splice(index, 1);
    else next[index] = value;
    setMetric(id, next);
  };
  const seriesDefinitions = metrics.flatMap((key, axisIndex) => {
    const metric = metricDefinition(data, key);
    const current = { key, axisIndex, metric, previous: false, name: `本期 · ${metric.label}` };
    return compare ? [current, { ...current, key: `previous_${key}`, previous: true, name: `上期 · ${metric.label}` }] : [current];
  });
  const option = {
    animationDuration: 300,
    grid: { left: 18, right: metrics.length > 1 ? 24 : 18, top: 56, bottom: 16, containLabel: true },
    legend: { top: 0, left: 0, type: 'scroll', itemWidth: 20, itemHeight: 3, textStyle: { color: '#525d6d', fontSize: 12 } },
    tooltip: {
      trigger: 'axis', confine: true, backgroundColor: '#17202b', borderWidth: 0, padding: [10, 12], textStyle: { color: '#fff', fontSize: 13 },
      formatter: (params) => {
        if (!params.length) return '';
        const index = params[0].dataIndex;
        const previousDate = data.rows[index]?.previousDate;
        return [`${params[0].axisValue}${compare && previousDate ? ` · 上期 ${previousDate}` : ''}`, ...params.map((item) => {
          const definition = seriesDefinitions[item.seriesIndex];
          return `${item.marker} ${item.seriesName}　${formatValue(item.value, definition.metric.format)}`;
        })].join('<br>');
      },
    },
    xAxis: { type: 'category', data: data.rows.map((row) => row.date), boundaryGap: false, axisTick: { show: false }, axisLine: { lineStyle: { color: '#dfe4ea' } }, axisLabel: { color: '#7a8493', fontSize: 12, margin: 12, hideOverlap: true } },
    yAxis: metrics.map((key, index) => {
      const metric = metricDefinition(data, key);
      return {
        type: 'value', min: 0, position: index === 0 ? 'left' : 'right',
        name: `${metric.label}（${metricUnit(metric)}）`, nameLocation: 'end', nameGap: 12,
        nameTextStyle: { color: '#525d6d', fontSize: 12, align: index === 0 ? 'left' : 'right' },
        axisLabel: { color: '#7a8493', fontSize: 12, formatter: (value) => formatAxis(value, metric.format) },
        splitLine: { show: index === 0, lineStyle: { color: '#edf0f4', width: 1 } },
      };
    }),
    series: seriesDefinitions.map((definition) => ({
      name: definition.name, type: 'line', yAxisIndex: definition.axisIndex,
      data: data.rows.map((row) => row[definition.key]), showSymbol: data.rows.length <= 2,
      symbol: 'circle', symbolSize: 8, connectNulls: false,
      lineStyle: { width: 2, color: definition.metric.color, type: definition.previous ? 'dashed' : 'solid', opacity: definition.previous ? 0.55 : 1 },
      itemStyle: { color: definition.metric.color, borderColor: '#fff', borderWidth: 2, opacity: definition.previous ? 0.55 : 1 },
      emphasis: { focus: 'series' },
    })),
  };
  const columns = [{ key: 'date', label: '本期日期', format: 'text' }];
  if (compare) columns.push({ key: 'previousDate', label: '上期对应日期', format: 'text' });
  for (const key of metrics) {
    const metric = metricDefinition(data, key);
    columns.push({ key, label: `本期 ${metric.label}`, format: metric.format });
    if (compare) columns.push({ key: `previous_${key}`, label: `上期 ${metric.label}`, format: metric.format });
  }
  const granularity = { day: '日', week: '周', month: '月' }[data.granularity] || '日';
  return <ChartBlock title={title || data.title} detail={`${granularity}粒度 · 左右轴独立刻度，避免跨量纲直接比较`} view={view} onView={(value) => setView(id, value)} tableData={{ rows: data.rows, columns }} empty={!data.rows.length} controls={<>
    <MetricSelect label="左轴" value={metrics[0]} options={data.metricOptions} excluded={metrics[1]} onChange={(value) => updateMetric(0, value)} />
    <MetricSelect label="右轴" value={metrics[1]} options={data.metricOptions} excluded={metrics[0]} allowEmpty onChange={(value) => updateMetric(1, value)} />
    <label className="a2ui-compare-toggle" title={data.previousAvailable ? `对比 ${data.previousRange?.startDate} 至 ${data.previousRange?.endDate}` : '上一等长周期没有数据'}><input type="checkbox" checked={compare} disabled={!data.previousAvailable} onChange={(event) => setComparePrevious(event.target.checked)} />上期对比</label>
  </>}><Chart option={option} ariaLabel={`${data.title}，左轴${metricDefinition(data, metrics[0]).label}${metrics[1] ? `，右轴${metricDefinition(data, metrics[1]).label}` : ''}`} style={{ height: 330 }} /></ChartBlock>;
}

export const TrendChart = createComponentImplementation(TrendChartApi, ({ props }) => {
  const data = props.data || { rows: [], series: [], columns: [] };
  return Array.isArray(data.metricOptions) ? <ModernTrend title={props.title} data={data} /> : <LegacyTrend title={props.title} data={data} />;
});

function entityTable(data, metricKey, rows = data.rows) {
  const metric = metricDefinition(data, metricKey);
  return { entityType: data.entityType, rows, columns: [{ key: 'entityLabel', label: data.entityLabel, format: 'text' }, { key: metricKey, label: metric.label, format: metric.format }] };
}

function useEntityChart(data, prefix) {
  const id = makeA2uiComponentId(prefix, data.entityType);
  const { viewState, setMetric, setView, selectEntity } = useChatViewState();
  const allowed = new Set(data.metricOptions.map((item) => item.key));
  const saved = viewState.metricByComponent[id];
  const metric = typeof saved === 'string' && allowed.has(saved) ? saved : data.defaultMetric;
  return {
    id, metric, view: viewState.viewByComponent[id] || 'chart', selected: viewState.selectedEntity,
    setMetric: (value) => setMetric(id, value), setView: (value) => setView(id, value),
    onClick: (params) => {
      const entityId = params?.data?.entityId;
      if (entityId) selectEntity({ type: data.entityType, id: entityId });
    },
  };
}

export const RankingBarChart = createComponentImplementation(RankingBarChartApi, ({ props }) => {
  const data = props.data;
  const chart = useEntityChart(data, 'ranking');
  const metric = metricDefinition(data, chart.metric);
  const rows = useMemo(() => [...data.rows].sort((a, b) => (b[chart.metric] || 0) - (a[chart.metric] || 0)).slice(0, 10), [data.rows, chart.metric]);
  const option = {
    animationDuration: 300, grid: { left: 12, right: 32, top: 12, bottom: 12, containLabel: true },
    tooltip: { trigger: 'item', confine: true, formatter: (item) => `${item.data.entityLabel}<br>${item.marker} ${metric.label}　${formatValue(item.value, metric.format)}` },
    xAxis: { type: 'value', min: 0, name: `${metric.label}（${metricUnit(metric)}）`, nameLocation: 'middle', nameGap: 28, axisLabel: { color: '#7a8493', formatter: (value) => formatAxis(value, metric.format) }, splitLine: { lineStyle: { color: '#edf0f4' } } },
    yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.entityLabel), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#525d6d', fontSize: 12, width: 150, overflow: 'truncate' } },
    series: [{ type: 'bar', barMaxWidth: 20, data: rows.map((row) => ({ value: row[chart.metric], entityId: row.entityId, entityLabel: row.entityLabel, itemStyle: { color: '#2a78d6', opacity: chart.selected?.type === data.entityType && chart.selected.id !== row.entityId ? 0.35 : 1, borderColor: chart.selected?.id === row.entityId ? '#17202b' : 'transparent', borderWidth: chart.selected?.id === row.entityId ? 2 : 0, borderRadius: [0, 4, 4, 0] } })), label: { show: true, position: 'right', color: '#374151', fontSize: 12, formatter: (item) => formatValue(item.value, metric.format) } }],
  };
  return <ChartBlock title={props.title || data.title} detail={`按${metric.label}排序 · Top ${rows.length} / ${data.totalRows} · 点击联动明细`} view={chart.view} onView={chart.setView} tableData={entityTable(data, chart.metric, rows)} empty={!rows.length} controls={<MetricSelect value={chart.metric} options={data.metricOptions} onChange={chart.setMetric} />}><Chart option={option} onClick={chart.onClick} ariaLabel={`${data.entityLabel}按${metric.label}排行`} style={{ height: Math.max(280, rows.length * 34 + 70) }} /></ChartBlock>;
});

export const CompositionBarChart = createComponentImplementation(CompositionBarChartApi, ({ props }) => {
  const data = props.data;
  const chart = useEntityChart(data, 'composition');
  const metric = metricDefinition(data, chart.metric);
  const top = data.rows.slice(0, 5);
  const rest = data.rows.slice(5);
  const restValue = rest.reduce((sum, row) => sum + Math.max(0, Number(row[chart.metric]) || 0), 0);
  const displayRows = restValue ? [...top, { entityId: '', entityLabel: `其他（${rest.length} 组）`, [chart.metric]: restValue, isOther: true }] : top;
  const total = displayRows.reduce((sum, row) => sum + Math.max(0, Number(row[chart.metric]) || 0), 0);
  const colorByEntity = Object.fromEntries(top.map((row, index) => [row.entityId, PALETTE[index]]));
  const option = {
    animationDuration: 300,
    legend: { type: 'scroll', bottom: 0, left: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#525d6d', fontSize: 12 } },
    grid: { left: 18, right: 24, top: 28, bottom: 74, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: (params) => [`${metric.label}构成`, ...params.map((item) => `${item.marker} ${item.seriesName}　${formatValue(item.data.rawValue, metric.format)}（${numberFormatter.format(item.value)}%）`)].join('<br>') },
    xAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%', color: '#7a8493' }, splitLine: { lineStyle: { color: '#edf0f4' } } },
    yAxis: { type: 'category', data: ['当前范围'], axisTick: { show: false }, axisLine: { show: false } },
    series: displayRows.map((row) => ({
      name: row.entityLabel, type: 'bar', stack: 'total', barWidth: 34,
      data: [{ value: total ? Math.max(0, Number(row[chart.metric]) || 0) / total * 100 : 0, rawValue: row[chart.metric], entityId: row.entityId, entityLabel: row.entityLabel }],
      itemStyle: { color: row.isOther ? '#a9b4c2' : colorByEntity[row.entityId], borderColor: '#fff', borderWidth: 2, borderRadius: 3 },
      label: { show: total && row[chart.metric] / total >= 0.08, formatter: (item) => `${numberFormatter.format(item.value)}%`, color: '#fff', fontSize: 12 },
    })),
  };
  const tableRows = displayRows.map((row) => ({ ...row, share: total ? row[chart.metric] / total * 100 : null }));
  const tableData = entityTable(data, chart.metric, tableRows);
  tableData.columns.push({ key: 'share', label: '占比', format: 'percent' });
  return <ChartBlock title={props.title || data.title} detail={`${metric.label}结构 · 固定展示默认排行前 5 组，其余合并为“其他” · 点击联动明细`} view={chart.view} onView={chart.setView} tableData={tableData} empty={!total} controls={<MetricSelect value={chart.metric} options={data.metricOptions} onChange={chart.setMetric} />}><Chart option={option} onClick={chart.onClick} ariaLabel={`${data.entityLabel}${metric.label}构成`} style={{ height: 300 }} /></ChartBlock>;
});

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export const QuadrantScatterChart = createComponentImplementation(QuadrantScatterChartApi, ({ props }) => {
  const data = props.data;
  const { viewState, setView, selectEntity } = useChatViewState();
  const id = makeA2uiComponentId('quadrant', data.entityType);
  const view = viewState.viewByComponent[id] || 'chart';
  const rows = data.rows.filter((row) => Number.isFinite(row.spend) && Number.isFinite(row.acos)).slice(0, 100);
  const spendMedian = median(rows.map((row) => row.spend));
  const acosMedian = median(rows.map((row) => row.acos));
  const topLabels = new Set([...rows].sort((a, b) => b.spend - a.spend).slice(0, 5).map((row) => row.entityId));
  const option = {
    animationDuration: 300, grid: { left: 24, right: 30, top: 36, bottom: 26, containLabel: true },
    tooltip: { trigger: 'item', confine: true, formatter: (item) => `${item.data.entityLabel}<br>花费　${formatValue(item.data.value[0], 'currency')}<br>ACOS　${formatValue(item.data.value[1], 'percent')}<br>销售额　${formatValue(item.data.sales, 'currency')}` },
    xAxis: { type: 'value', min: 0, name: data.xLabel, nameLocation: 'middle', nameGap: 32, axisLabel: { color: '#7a8493', formatter: (value) => formatAxis(value, 'currency') }, splitLine: { lineStyle: { color: '#edf0f4' } } },
    yAxis: { type: 'value', min: 0, name: data.yLabel, nameLocation: 'middle', nameGap: 44, axisLabel: { color: '#7a8493', formatter: (value) => formatAxis(value, 'percent') }, splitLine: { lineStyle: { color: '#edf0f4' } } },
    series: [{ type: 'scatter', symbolSize: 11, labelLayout: { hideOverlap: true }, data: rows.map((row) => ({ value: [row.spend, row.acos], entityId: row.entityId, entityLabel: row.entityLabel, sales: row.sales, label: { show: topLabels.has(row.entityId), position: 'top', formatter: row.entityLabel, color: '#525d6d', fontSize: 11, width: 100, overflow: 'truncate' }, itemStyle: { color: '#2a78d6', borderColor: viewState.selectedEntity?.id === row.entityId ? '#17202b' : '#fff', borderWidth: 2, opacity: viewState.selectedEntity?.type === data.entityType && viewState.selectedEntity.id !== row.entityId ? 0.35 : 0.88 } })), markLine: { silent: true, symbol: 'none', label: { color: '#7a8493', fontSize: 11 }, lineStyle: { color: '#a9b4c2', type: 'dashed' }, data: [{ xAxis: spendMedian, label: { formatter: '花费中位数' } }, { yAxis: acosMedian, label: { formatter: 'ACOS 中位数' } }] } }],
  };
  const tableData = { entityType: data.entityType, rows, columns: [{ key: 'entityLabel', label: data.entityLabel, format: 'text' }, { key: 'spend', label: '花费', format: 'currency' }, { key: 'acos', label: 'ACOS', format: 'percent' }, { key: 'sales', label: '销售额', format: 'currency' }, { key: 'orders', label: '订单量', format: 'integer' }] };
  return <ChartBlock title={props.title || data.title} detail={`中位数划分象限 · ${rows.length} 个重点对象 · 点击联动明细`} view={view} onView={(value) => setView(id, value)} tableData={tableData} empty={!rows.length}><Chart option={option} onClick={(params) => { if (params.data?.entityId) selectEntity({ type: data.entityType, id: params.data.entityId }); }} ariaLabel="搜索词花费与 ACOS 四象限散点图" style={{ height: 350 }} /></ChartBlock>;
});

export const ConversionFunnel = createComponentImplementation(ConversionFunnelApi, ({ props }) => {
  const data = props.data;
  const { viewState, setView } = useChatViewState();
  const id = makeA2uiComponentId('funnel', data.reportType);
  const view = viewState.viewByComponent[id] || 'chart';
  const rows = data.stages.map((stage, index) => ({ ...stage, conversion: index && data.stages[index - 1].value ? stage.value / data.stages[index - 1].value * 100 : null }));
  const option = {
    animationDuration: 300, color: PALETTE,
    tooltip: { trigger: 'item', confine: true, formatter: (item) => `${item.name}<br>${formatValue(item.value, data.stages[item.dataIndex].format)}${item.dataIndex ? `<br>上一步转化率 ${formatValue(rows[item.dataIndex].conversion, 'percent')}` : ''}` },
    series: [{ type: 'funnel', left: '8%', right: '8%', top: 12, bottom: 12, minSize: '18%', maxSize: '100%', sort: 'none', gap: 4, data: data.stages.map((stage) => ({ name: stage.label, value: stage.value })), label: { show: true, position: 'inside', color: '#fff', fontSize: 13, formatter: (item) => `${item.name}  ${formatValue(item.value, data.stages[item.dataIndex].format)}` }, itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 } }],
  };
  return <ChartBlock title={props.title || data.title} detail="展示 → 点击 → 订单 · 仅反映当前汇总数据" view={view} onView={(value) => setView(id, value)} tableData={{ rows, columns: [{ key: 'label', label: '阶段', format: 'text' }, { key: 'value', label: '数量', format: 'integer' }, { key: 'conversion', label: '上一步转化率', format: 'percent' }] }} empty={!data.stages.length}><Chart option={option} ariaLabel="展示点击订单转化漏斗" style={{ height: 300 }} /></ChartBlock>;
});

export const PurchasePathChart = createComponentImplementation(PurchasePathChartApi, ({ props }) => {
  const data = props.data;
  const { viewState, setView, selectEntity } = useChatViewState();
  const id = makeA2uiComponentId('path', data.entityType);
  const mobileDefault = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches ? 'table' : 'chart';
  const view = viewState.viewByComponent[id] || mobileDefault;
  const sourceNames = [...new Set(data.links.map((link) => link.source))];
  const targetNames = [...new Set(data.links.map((link) => link.target))];
  const option = {
    animationDuration: 300,
    tooltip: { trigger: 'item', confine: true, formatter: (item) => item.dataType === 'edge' ? `${item.data.sourceLabel} → ${item.data.targetLabel}<br>销售额　${formatValue(item.data.value, 'currency')}<br>订单量　${formatValue(item.data.orders, 'integer')}<br>销售量　${formatValue(item.data.units, 'integer')}` : item.name.replace('\n', ' · ') },
    series: [{ type: 'sankey', left: 12, right: 118, top: 16, bottom: 16, nodeWidth: 14, nodeGap: 14, draggable: false, emphasis: { focus: 'adjacency' }, data: [...sourceNames.map((name) => ({ name: `投放\n${name}`, itemStyle: { color: '#2a78d6' } })), ...targetNames.map((name) => ({ name: `购买\n${name}`, itemStyle: { color: '#eb6834' } }))], links: data.links.map((link) => ({ source: `投放\n${link.source}`, target: `购买\n${link.target}`, sourceLabel: link.source, targetLabel: link.target, value: link.value, entityId: link.entityId, orders: link.orders, units: link.units, lineStyle: { color: '#2a78d6', opacity: viewState.selectedEntity?.type === data.entityType && viewState.selectedEntity.id !== link.entityId ? 0.08 : 0.32 } })), label: { color: '#374151', fontSize: 12, formatter: (item) => item.name.replace('\n', ' ') }, lineStyle: { color: 'gradient', curveness: 0.5 } }],
  };
  return <ChartBlock title={props.title || data.title} detail={`按销售额显示 Top ${data.links.length} 条路径 · 点击路径联动明细${mobileDefault === 'table' ? ' · 移动端默认表格' : ''}`} view={view} onView={(value) => setView(id, value)} tableData={{ entityType: data.entityType, rows: data.rows, columns: data.columns }} empty={!data.links.length}><Chart option={option} onClick={(params) => { if (params.dataType === 'edge' && params.data.entityId) selectEntity({ type: data.entityType, id: params.data.entityId }); }} ariaLabel="广告投放 ASIN 到已购买 ASIN 销售路径图" style={{ height: 360 }} /></ChartBlock>;
});
