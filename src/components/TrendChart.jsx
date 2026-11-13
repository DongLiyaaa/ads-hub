import { useMemo, useState } from 'react';
import Chart from './Chart.jsx';
import { buildKeywordTrend, buildOverallTrend, formatNumber } from '../lib/data.js';

const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const shortDate = (date) => date.slice(5).replace('-', '/');

export default function TrendChart({ entries, dates, topKeywords }) {
  const [mode, setMode] = useState('overall');
  const trend = useMemo(
    () => mode === 'overall'
      ? buildOverallTrend(entries)
      : buildKeywordTrend(entries, dates, topKeywords),
    [entries, dates, topKeywords, mode],
  );

  const option = useMemo(() => ({
    animationDuration: 350,
    color: mode === 'overall' ? [SERIES_COLORS[0]] : SERIES_COLORS,
    grid: { left: 14, right: 22, top: mode === 'overall' ? 24 : 66, bottom: 12, containLabel: true },
    legend: {
      show: mode === 'keywords',
      top: 0,
      left: 0,
      type: 'scroll',
      itemWidth: 20,
      itemHeight: 3,
      itemGap: 18,
      textStyle: { color: '#525d6d', fontSize: 11 },
      pageIconColor: '#2a78d6',
      pageTextStyle: { color: '#687386' },
    },
    tooltip: {
      trigger: 'axis',
      renderMode: 'richText',
      confine: true,
      backgroundColor: '#17202b',
      borderWidth: 0,
      padding: [10, 12],
      textStyle: { color: '#ffffff', fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: '#a9b4c2', width: 1, type: 'solid' } },
      formatter: (params) => {
        if (!params.length) return '';
        const rows = params.map((item) => `${item.marker} ${item.seriesName}  ${item.value == null ? '暂无数据' : `${Number(item.value).toFixed(2)}%`}`);
        return [params[0].axisValue.replaceAll('-', '/'), ...rows].join('\n');
      },
    },
    xAxis: {
      type: 'category',
      data: trend.dates,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#dfe4ea' } },
      axisLabel: {
        color: '#7a8493',
        fontSize: 11,
        margin: 12,
        hideOverlap: true,
        formatter: shortDate,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: (value) => Math.min(100, Math.max(1, Math.ceil(value.max * 1.15))),
      axisLabel: { color: '#7a8493', fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#edf0f4', width: 1, type: 'solid' } },
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
  }), [mode, trend]);

  return (
    <section className="panel trend-panel" aria-labelledby="trend-title">
      <div className="panel__header chart-header">
        <div>
          <h2 id="trend-title">展示份额趋势</h2>
          <p>{mode === 'overall' ? '每日搜索词份额 · 展示量加权' : '全周期展示量 TOP 5 · 当前时间范围'}</p>
        </div>
        <div className="segmented-control" aria-label="趋势图模式">
          <button type="button" className={mode === 'overall' ? 'is-active' : ''} aria-pressed={mode === 'overall'} onClick={() => setMode('overall')}>整体</button>
          <button type="button" className={mode === 'keywords' ? 'is-active' : ''} aria-pressed={mode === 'keywords'} onClick={() => setMode('keywords')}>TOP 5 关键词</button>
        </div>
      </div>
      {entries.length ? (
        <Chart className="trend-chart" option={option} ariaLabel="搜索词展示份额折线图" style={{ height: 324 }} />
      ) : (
        <div className="chart-empty">当前时间范围暂无趋势数据</div>
      )}
      <div className="chart-footnote">悬浮查看每日数值 · 表格提供完整明细{mode === 'keywords' ? ` · ${formatNumber(topKeywords.length)} 条固定序列` : ''}</div>
    </section>
  );
}
