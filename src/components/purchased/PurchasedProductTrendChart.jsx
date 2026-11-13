import { useMemo, useState } from 'react';
import Chart from '../Chart.jsx';
import { buildPurchasedProductTrend, formatPurchasedMetric, PURCHASED_TREND_METRICS } from '../../lib/purchasedProductData.js';

const shortDate = (date) => date.slice(5).replace('-', '/');

export default function PurchasedProductTrendChart({ snapshot, dates }) {
  const [metricId, setMetricId] = useState('sales');
  const metric = PURCHASED_TREND_METRICS.find((item) => item.id === metricId);
  const trend = useMemo(() => buildPurchasedProductTrend(snapshot, dates, metricId), [snapshot, dates, metricId]);
  const option = useMemo(() => ({
    animationDuration: 350,
    color: trend.series.map((series) => series.color),
    grid: { left: 14, right: 22, top: 60, bottom: 12, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 20, itemHeight: 3, itemGap: 14, textStyle: { color: '#525d6d', fontSize: 10 } },
    tooltip: {
      trigger: 'axis', renderMode: 'richText', confine: true,
      backgroundColor: '#17202b', borderWidth: 0, padding: [10, 12],
      textStyle: { color: '#ffffff', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#a9b4c2', width: 1 } },
      formatter: (params) => params.length ? [params[0].axisValue.replaceAll('-', '/'), ...params.map((item) => `${item.marker} ${item.seriesName}  ${formatPurchasedMetric(item.value, metric.unit)}`)].join('\n') : '',
    },
    xAxis: {
      type: 'category', data: trend.dates, boundaryGap: false,
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#dfe4ea' } },
      axisLabel: { color: '#7a8493', fontSize: 11, margin: 12, hideOverlap: true, formatter: shortDate },
    },
    yAxis: {
      type: 'value', min: 0,
      axisLabel: { color: '#7a8493', fontSize: 11, formatter: (value) => formatPurchasedMetric(value, metric.unit) },
      splitLine: { lineStyle: { color: '#edf0f4', width: 1 } },
    },
    series: trend.series.map((series, index) => ({
      name: series.name, type: 'line', data: series.data,
      showSymbol: trend.dates.length <= 2, symbol: 'circle', symbolSize: 7,
      connectNulls: false, lineStyle: { width: index === 0 ? 2.5 : 1.8 },
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 }, emphasis: { focus: 'series', scale: 1.25 },
    })),
  }), [metric, trend]);

  return (
    <section className="panel trend-panel" aria-labelledby="purchased-trend-title">
      <div className="panel__header chart-header">
        <div><h2 id="purchased-trend-title">已购买商品每日趋势</h2><p>整体与销售额 Top 3 购买 ASIN · 单指标对比</p></div>
        <label className="compact-select"><span className="sr-only">购买趋势指标</span><select value={metricId} onChange={(event) => setMetricId(event.target.value)}>{PURCHASED_TREND_METRICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      </div>
      {snapshot.daily.length ? <Chart className="trend-chart" option={option} ariaLabel={`整体及Top3购买ASIN每日${metric.label}趋势折线图`} style={{ height: 324 }} /> : <div className="chart-empty">当前时间范围暂无趋势数据</div>}
      <div className="chart-footnote">7 天内其他 SKU 归因口径 · 缺失日期不补零 · 悬浮查看每日数值</div>
    </section>
  );
}
