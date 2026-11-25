import HorizontalScroller from '../HorizontalScroller.jsx';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/data.js';
import { PLACEMENT_MAP } from '../../lib/placementData.js';

const money = (value) => value == null ? '—' : formatCurrency(value);

export default function PlacementStrategyTable({ rows }) {
  return (
    <section className="panel table-panel placement-strategy-panel" aria-labelledby="placement-strategy-title">
      <div className="table-toolbar">
        <div>
          <h2 id="placement-strategy-title">竞价策略 × 广告位</h2>
          <p>观察组合效率与样本量 · 不将相关性解释为因果关系</p>
        </div>
        <span className="methodology-note">原始行数 &lt; 30 时标记为样本较少</span>
      </div>
      <HorizontalScroller className="table-scroll" label="竞价策略与广告位组合表">
        <table className="placement-strategy-table">
          <caption className="sr-only">竞价策略和广告位组合汇总</caption>
          <thead><tr>
            <th className="align-left">竞价策略</th><th className="align-left">广告位</th><th>活动数</th><th>原始行数</th>
            <th>展示量</th><th>点击量</th><th>CTR</th><th>花费</th><th>销售额</th><th>订单</th><th>CPC</th><th>CVR</th><th>CPO</th><th>ACOS</th><th>样本提示</th>
          </tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="align-left keyword-cell">{row.biddingStrategy}</td>
                <td className="align-left"><span className="placement-label"><i style={{ backgroundColor: PLACEMENT_MAP.get(row.placement)?.color }} aria-hidden="true" />{row.placementLabel}</span></td>
                <td>{formatNumber(row.campaignCount)}</td><td>{formatNumber(row.rowCount)}</td>
                <td>{formatNumber(row.impressions)}</td><td>{formatNumber(row.clicks)}</td><td>{formatPercent(row.ctr)}</td>
                <td>{money(row.spend)}</td><td>{money(row.sales)}</td><td>{formatNumber(row.orders)}</td>
                <td>{money(row.cpc)}</td><td>{formatPercent(row.cvr)}</td><td>{money(row.cpo)}</td>
                <td className="metric-emphasis">{formatPercent(row.acos)}</td>
                <td><span className={row.rowCount < 30 ? 'sample-warning' : 'sample-normal'}>{row.rowCount < 30 ? '样本较少' : '可观察'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </HorizontalScroller>
      <div className="placement-table-note">“可观察”仅表示样本量提示，不代表该组合应扩量；当前报表没有基础竞价与广告位溢价。</div>
    </section>
  );
}
