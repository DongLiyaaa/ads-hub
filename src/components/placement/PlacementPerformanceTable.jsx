import HorizontalScroller from '../HorizontalScroller.jsx';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/data.js';

const money = (value) => value == null ? '—' : formatCurrency(value);
const multiple = (value) => value == null ? '—' : `${value.toFixed(2)}×`;

export function PlacementLabel({ placement }) {
  return <span className="placement-label"><i style={{ backgroundColor: placement.color }} aria-hidden="true" />{placement.label}</span>;
}

export default function PlacementPerformanceTable({ placements }) {
  return (
    <section className="panel table-panel placement-performance-panel" aria-labelledby="placement-performance-title">
      <div className="table-toolbar">
        <div>
          <h2 id="placement-performance-title">广告位表现对比</h2>
          <p>规模、效率、转化与贡献结构 · 比率不做算术平均</p>
        </div>
        <span className="methodology-note">订单与销售额均为 7 天归因</span>
      </div>
      <HorizontalScroller className="table-scroll" label="广告位表现对比">
        <table className="placement-performance-table">
          <caption className="sr-only">当前时间范围内三类广告位的完整表现对比</caption>
          <thead><tr>
            <th className="align-left">广告位</th><th>展示量</th><th>点击量</th><th>花费</th><th>花费占比</th>
            <th>销售额</th><th>销售占比</th><th>订单</th><th>订单占比</th><th>CTR</th><th>CPC</th>
            <th>CVR</th><th>CPO</th><th>ACOS</th><th>ROAS</th>
          </tr></thead>
          <tbody>
            {placements.map((placement) => (
              <tr key={placement.id}>
                <td className="align-left"><PlacementLabel placement={placement} /></td>
                <td>{formatNumber(placement.impressions)}</td><td>{formatNumber(placement.clicks)}</td>
                <td>{money(placement.spend)}</td><td>{formatPercent(placement.spendShare)}</td>
                <td>{money(placement.sales)}</td><td>{formatPercent(placement.salesShare)}</td>
                <td>{formatNumber(placement.orders)}</td><td>{formatPercent(placement.orderShare)}</td>
                <td>{formatPercent(placement.ctr)}</td><td>{money(placement.cpc)}</td>
                <td>{formatPercent(placement.cvr)}</td><td>{money(placement.cpo)}</td>
                <td className="metric-emphasis">{formatPercent(placement.acos)}</td><td>{multiple(placement.roas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HorizontalScroller>
      <div className="placement-table-note">花费占比高不代表低效，曝光占比也不代表市场份额；需结合 CVR、CPO、ACOS 与业务目标共同判断。</div>
    </section>
  );
}
