import { useMemo, useState } from 'react';
import Chart from '../Chart.jsx';
import { buildPlacementTrend, formatPlacementMetric, TREND_METRICS } from '../../lib/placementData.js';

const shortDate = (date) => date.slice(5).replace('-', '/');

export default function PlacementTrendChart({ dailyRows, dates }) {
  const [metricId, setMetricId] = useState('acos');
  const metric = TREND_METRICS.find((item) => item.id === metricId);
  const trend = useMemo(() => buildPlacementTrend(dailyRows, dates, metricId), [dailyRows, dates, metricId]);

  const option = useMemo(() => ({
    animationDuration: 350,
    color: trend.series.map((series) => series.color),
    grid: { left: 14, right: 22, top: 60, bottom: 12, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 20,
      itemHeight: 3,
      itemGap: 18,
      textStyle: { color: '#525d6d', fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis',
      renderMode: 'richText',
      confine: true,
      backgroundColor: '#17202b',
      borderWidth: 0,
      padding: [10, 12],
      textStyle: { color: '#ffffff', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#a9b4c2', width: 1 } },
      formatter: (params) => {
        if (!params.length) return '';
        return [params[0].axisValue.replaceAll('-', '/'), ...params.map((item) => `${item.marker} ${item.seriesName}  ${formatPlacementMetric(item.value, metric.unit)}`)].join('\n');
      },
    },
    xAxis: {
      type: 'category',
      data: trend.dates,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#dfe4ea' } },
      axisLabel: { color: '#7a8493', fontSize: 11, margin: 12, hideOverlap: true, formatter: shortDate },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: {
        color: '#7a8493',
        fontSize: 11,
        formatter: (value) => formatPlacementMetric(value, metric.unit),
      },
      splitLine: { lineStyle: { color: '#edf0f4', width: 1 } },
    },
    series: trend.series.map((series) => ({
      name: series.name,
      type: 'line',
      data: series.data,
      showSymbol: trend.dates.length <= 2,
      symbol: 'circle',
      symbolSize: 8,
      connectNulls: false,
      lineStyle: { width: 2 },
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
      emphasis: { focus: 'series', scale: 1.25 },
    })),
  }), [metric, trend]);

  return (
    <section className="panel trend-panel" aria-labelledby="placement-trend-title">
      <div className="panel__header chart-header">
        <div>
          <h2 id="placement-trend-title">广告位每日趋势</h2>
          <p>单指标三广告位对比 · 缺失日期不补零</p>
        </div>
        <label className="compact-select">
          <span className="sr-only">趋势指标</span>
          <select value={metricId} onChange={(event) => setMetricId(event.target.value)}>
            {TREND_METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      {dailyRows.length ? (
        <Chart className="trend-chart" option={option} ariaLabel={`三类广告位每日${metric.label}趋势折线图`} style={{ height: 324 }} />
      ) : <div className="chart-empty">当前时间范围暂无趋势数据</div>}
      <div className="chart-footnote">悬浮查看每日数值 · 所有比率由当日汇总基础字段重算</div>
    </section>
  );
}
