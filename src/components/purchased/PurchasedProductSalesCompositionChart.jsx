import { useMemo } from 'react';
import Chart from '../Chart.jsx';
import { formatCurrency, formatPercent } from '../../lib/data.js';

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
const OTHER = '其他投放商品';
const OTHER_COLOR = '#9aa3b0';

function compactCurrency(value) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(value)}`;
}

export default function PurchasedProductSalesCompositionChart({ items, paths }) {
  const model = useMemo(() => {
    const topItems = items.slice(0, 10);
    const purchasedIds = new Set(topItems.map((item) => item.purchasedAsin));
    const advertisedTotals = new Map();
    paths.forEach((path) => {
      if (purchasedIds.has(path.purchasedAsin)) {
        advertisedTotals.set(path.advertisedAsin, (advertisedTotals.get(path.advertisedAsin) || 0) + path.sales);
      }
    });
    const advertisedAsins = Array.from(advertisedTotals, ([advertisedAsin, sales]) => ({ advertisedAsin, sales }))
      .sort((a, b) => b.sales - a.sales || a.advertisedAsin.localeCompare(b.advertisedAsin))
      .slice(0, COLORS.length)
      .map((item) => item.advertisedAsin);
    const featured = new Set(advertisedAsins);
    const contributions = new Map(topItems.map((item) => [item.purchasedAsin, new Map()]));
    paths.forEach((path) => {
      const product = contributions.get(path.purchasedAsin);
      if (!product) return;
      const key = featured.has(path.advertisedAsin) ? path.advertisedAsin : OTHER;
      product.set(key, (product.get(key) || 0) + path.sales);
    });
    const hasOther = Array.from(contributions.values()).some((product) => product.has(OTHER));
    const seriesNames = [...advertisedAsins, ...(hasOther ? [OTHER] : [])];
    const rows = topItems.flatMap((item) => seriesNames
      .map((advertisedAsin) => ({
        purchasedAsin: item.purchasedAsin,
        totalSales: item.sales,
        advertisedAsin,
        sales: contributions.get(item.purchasedAsin).get(advertisedAsin) || 0,
      }))
      .filter((row) => row.sales > 0)
      .map((row) => ({ ...row, share: item.sales > 0 ? row.sales / item.sales * 100 : null })));
    return { topItems, seriesNames, contributions, rows };
  }, [items, paths]);

  const option = useMemo(() => ({
    animationDuration: 350,
    color: [...COLORS, OTHER_COLOR],
    grid: { left: 16, right: 86, top: 18, bottom: model.seriesNames.length > 1 ? 76 : 38, containLabel: true },
    legend: {
      show: model.seriesNames.length > 1,
      data: model.seriesNames,
      type: 'scroll', bottom: 4, left: 18, right: 18,
      icon: 'roundRect', itemWidth: 12, itemHeight: 8, itemGap: 14,
      textStyle: { color: '#465264', fontSize: 10 },
      pageTextStyle: { color: '#687386', fontSize: 10 },
    },
    tooltip: {
      trigger: 'item', renderMode: 'richText', confine: true,
      backgroundColor: '#17202b', borderWidth: 0, padding: [10, 12], textStyle: { color: '#fff', fontSize: 12 },
      formatter: (params) => {
        const data = params.data;
        return [
          `购买 ASIN  ${data.purchasedAsin}`,
          `投放 ASIN  ${params.seriesName}`,
          `贡献销售额  ${formatCurrency(data.value)}`,
          `占该购买 ASIN  ${formatPercent(data.share)}`,
          `购买 ASIN 总销售额  ${formatCurrency(data.totalSales)}`,
        ].join('\n');
      },
    },
    xAxis: {
      type: 'value', min: 0,
      axisLabel: { color: '#7a8493', fontSize: 10, formatter: compactCurrency },
      splitLine: { lineStyle: { color: '#edf0f4', width: 1 } },
    },
    yAxis: {
      type: 'category', inverse: true, data: model.topItems.map((item) => item.purchasedAsin),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: '#465264', fontSize: 11, fontWeight: 550, margin: 12, width: 116, overflow: 'truncate' },
    },
    series: [
      ...model.seriesNames.map((advertisedAsin, index) => ({
        name: advertisedAsin, type: 'bar', stack: 'sales', barWidth: 18,
        emphasis: { focus: 'series' },
        itemStyle: {
          color: advertisedAsin === OTHER ? OTHER_COLOR : COLORS[index],
          borderColor: '#ffffff', borderWidth: 1,
        },
        data: model.topItems.map((item) => {
          const sales = model.contributions.get(item.purchasedAsin).get(advertisedAsin) || 0;
          return {
            value: sales || null,
            purchasedAsin: item.purchasedAsin,
            totalSales: item.sales,
            share: item.sales > 0 ? sales / item.sales * 100 : null,
          };
        }),
      })),
      {
        name: '购买商品总销售额', type: 'bar', stack: 'sales', barWidth: 18, silent: true,
        itemStyle: { color: 'transparent' }, tooltip: { show: false },
        label: {
          show: true, position: 'right', distance: 7, color: '#465264', fontSize: 10,
          formatter: (params) => formatCurrency(params.data.totalSales),
        },
        data: model.topItems.map((item) => ({ value: 0, totalSales: item.sales })),
      },
    ],
  }), [model]);

  return (
    <section className="panel purchased-composition-panel" aria-labelledby="purchased-composition-title">
      <div className="panel__header">
        <h2 id="purchased-composition-title">Top 10 购买商品销售构成</h2>
        <p>按已购买 ASIN 销售额排序 · 条长为总销售额，分段为投放 ASIN 贡献</p>
      </div>
      {model.topItems.length ? <>
        <Chart
          className="purchased-composition-chart"
          option={option}
          ariaLabel="按已购买商品销售额排序的Top10横向堆叠条形图，展示各投放ASIN的贡献金额与占比"
          style={{ height: Math.max(300, model.topItems.length * 34 + 116) }}
        />
        <div className="chart-footnote">悬停分段查看贡献金额和占该购买 ASIN 的比例 · 最多单列 7 个投放 ASIN，其余合并为“其他投放商品”</div>
        <details className="purchased-composition-data">
          <summary>查看 Top 10 销售构成数据表</summary>
          <div className="purchased-composition-table-scroll">
            <table className="purchased-composition-table">
              <caption className="sr-only">Top 10 购买商品总销售额及各投放商品贡献</caption>
              <thead><tr><th className="align-left">已购买 ASIN</th><th>购买总销售额</th><th className="align-left">投放 ASIN</th><th>贡献销售额</th><th>贡献占比</th></tr></thead>
              <tbody>{model.rows.map((row) => <tr key={`${row.purchasedAsin}-${row.advertisedAsin}`}>
                <td className="align-left keyword-cell">{row.purchasedAsin}</td>
                <td>{formatCurrency(row.totalSales)}</td>
                <td className="align-left">{row.advertisedAsin}</td>
                <td>{formatCurrency(row.sales)}</td>
                <td>{formatPercent(row.share)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </> : <div className="chart-empty">当前范围暂无购买数据</div>}
    </section>
  );
}
