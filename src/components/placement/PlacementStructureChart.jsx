import { useMemo } from 'react';
import Chart from '../Chart.jsx';
import { formatNumber, formatPercent } from '../../lib/data.js';
import { PLACEMENTS } from '../../lib/placementData.js';

const SHARES = [
  { key: 'spendShare', label: '花费占比' },
  { key: 'salesShare', label: '销售额占比' },
  { key: 'orderShare', label: '订单占比' },
];

export default function PlacementStructureChart({ placements }) {
  const option = useMemo(() => ({
    animationDuration: 350,
    color: PLACEMENTS.map((placement) => placement.color),
    grid: { left: 12, right: 18, top: 56, bottom: 8, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 15,
      textStyle: { color: '#525d6d', fontSize: 10 },
    },
    tooltip: {
      trigger: 'axis',
      renderMode: 'richText',
      confine: true,
      axisPointer: { type: 'shadow' },
      backgroundColor: '#17202b',
      borderWidth: 0,
      padding: [10, 12],
      textStyle: { color: '#ffffff', fontSize: 12 },
      formatter: (params) => {
        if (!params.length) return '';
        return [params[0].axisValue, ...params.map((item) => `${item.marker} ${item.seriesName}  ${formatPercent(item.value)}`)].join('\n');
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: '#7a8493', fontSize: 10, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#edf0f4', width: 1 } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: SHARES.map((share) => share.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: '#525d6d', fontSize: 11, margin: 12 },
    },
    series: PLACEMENTS.map((placement, index) => ({
      name: placement.label,
      type: 'bar',
      stack: 'share',
      barWidth: 32,
      data: SHARES.map((share) => placements.find((item) => item.id === placement.id)?.[share.key] ?? 0),
      itemStyle: {
        borderColor: '#ffffff',
        borderWidth: 2,
        borderRadius: index === 0 ? [5, 0, 0, 5] : index === PLACEMENTS.length - 1 ? [0, 5, 5, 0] : 0,
      },
      label: {
        show: true,
        position: 'inside',
        color: '#ffffff',
        fontSize: 10,
        formatter: (params) => params.value >= 8 ? `${Number(params.value).toFixed(1)}%` : '',
      },
      emphasis: { focus: 'series' },
    })),
  }), [placements]);

  return (
    <section className="panel placement-structure-panel" aria-labelledby="placement-structure-title">
      <div className="panel__header">
        <h2 id="placement-structure-title">广告位贡献结构</h2>
        <p>花费、销售额与订单使用同一百分比坐标</p>
      </div>
      <Chart className="placement-structure-chart" option={option} ariaLabel="三类广告位的花费、销售额和订单占比堆叠条形图" style={{ height: 250 }} />
      <div className="chart-footnote">总计 {formatNumber(placements.reduce((sum, item) => sum + item.orders, 0))} 个订单 · 悬浮查看占比 · 下方表格提供完整数值</div>
    </section>
  );
}
