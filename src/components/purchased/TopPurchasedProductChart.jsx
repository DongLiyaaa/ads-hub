import { useMemo } from 'react';
import Chart from '../Chart.jsx';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/data.js';

export default function TopPurchasedProductChart({ items }) {
  const topItems = items.slice(0, 5);
  const option = useMemo(() => ({
    animationDuration: 350,
    grid: { left: 12, right: 55, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item', renderMode: 'richText', confine: true,
      backgroundColor: '#17202b', borderWidth: 0, padding: [10, 12], textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params) => [`${params.name}`, `销售额  ${formatCurrency(params.data.sales)}`, `销售占比  ${formatPercent(params.value)}`, `订单  ${formatNumber(params.data.orders)} · 销售量  ${formatNumber(params.data.units)}`].join('\n'),
    },
    xAxis: { type: 'value', min: 0, axisLabel: { color: '#7a8493', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: '#edf0f4' } } },
    yAxis: {
      type: 'category', inverse: true, data: topItems.map((item) => item.purchasedAsin),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: '#465264', fontSize: 11, fontWeight: 550, margin: 12 },
    },
    series: [{
      name: '销售占比', type: 'bar', barWidth: 24,
      data: topItems.map((item) => ({ value: item.salesShare, sales: item.sales, orders: item.orders, units: item.units })),
      itemStyle: { color: '#2a78d6', borderRadius: [0, 5, 5, 0] },
      label: { show: true, position: 'right', color: '#465264', fontSize: 10, formatter: (params) => `${Number(params.value).toFixed(1)}%` },
      emphasis: { itemStyle: { color: '#1c5cab' } },
    }],
  }), [topItems]);

  return (
    <section className="panel placement-structure-panel" aria-labelledby="top-purchased-title">
      <div className="panel__header"><h2 id="top-purchased-title">Top 5 承接商品</h2><p>按已购买 ASIN 的其他 SKU 销售额排序</p></div>
      {topItems.length ? <Chart className="placement-structure-chart" option={option} ariaLabel="Top5已购买ASIN销售占比横向条形图" style={{ height: 250 }} /> : <div className="chart-empty">当前范围暂无购买数据</div>}
      <div className="chart-footnote">承接能力强不代表适合直接投流 · 完整来源数和角色见下方表格</div>
    </section>
  );
}
