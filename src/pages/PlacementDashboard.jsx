import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CircleDollarSign, Percent, RefreshCw, ShoppingCart, Wallet } from 'lucide-react';
import AppShell, { Brand } from '../components/AppShell.jsx';
import StatCard from '../components/StatCard.jsx';
import PlacementAiAnalysis from '../components/placement/PlacementAiAnalysis.jsx';
import PlacementCampaignTable from '../components/placement/PlacementCampaignTable.jsx';
import PlacementPerformanceTable from '../components/placement/PlacementPerformanceTable.jsx';
import PlacementStrategyTable from '../components/placement/PlacementStrategyTable.jsx';
import PlacementStructureChart from '../components/placement/PlacementStructureChart.jsx';
import PlacementTrendChart from '../components/placement/PlacementTrendChart.jsx';
import { buildPlacementAnalysisSnapshot } from '../lib/placementAnalysis.js';
import { filterPlacementRows, preparePlacementData, summarizePlacements } from '../lib/placementData.js';
import { formatCompact, formatCurrency, formatNumber, formatPercent } from '../lib/data.js';
import useReportData from '../hooks/useReportData.js';

const money = (value) => value == null ? '—' : formatCurrency(value);
const multiple = (value) => value == null ? '—' : `${value.toFixed(2)}×`;

function preparePlacement(payload) {
  const prepared = { ...preparePlacementData(payload), datasetId: payload.datasetId, storeCode: payload.storeCode };
  if (!prepared.rows.length) throw new Error('当前店铺没有可展示的有效广告位数据');
  return prepared;
}

export default function PlacementDashboard({ session, storeId, onStoreChange, onSwitchTenant, onLogout }) {
  const { data, error, cacheInfo, refresh } = useReportData({
    reportType: 'placement', userId: session.user.id, tenantId: session.currentTenant.id, storeId, prepare: preparePlacement,
  });
  const [range, setRange] = useState(null);

  useEffect(() => {
    setRange(data ? { startDate: data.minDate, endDate: data.maxDate } : null);
  }, [data]);

  const filteredRows = useMemo(() => data && range
    ? filterPlacementRows(data.rows, range.startDate, range.endDate)
    : [], [data, range]);
  const filteredDates = useMemo(() => data && range
    ? data.dates.filter((date) => date >= range.startDate && date <= range.endDate)
    : [], [data, range]);
  const { summary, placements } = useMemo(() => summarizePlacements(filteredRows), [filteredRows]);
  const snapshot = useMemo(() => buildPlacementAnalysisSnapshot(filteredRows), [filteredRows]);

  if (error) return <AppShell page="placement" session={session} storeId={storeId} onStoreChange={onStoreChange} onSwitchTenant={onSwitchTenant} onLogout={onLogout}><main className="dashboard"><section className="panel empty-workspace" role="alert"><span className="status-icon"><BarChart3 size={26} aria-hidden="true" /></span><h1>看板暂时无法加载</h1><p>{error}</p><button type="button" className="primary-button" onClick={refresh}><RefreshCw size={16} aria-hidden="true" />重新加载</button></section></main></AppShell>;
  if (!data || !range) return <main className="status-screen" aria-live="polite"><div className="loading-content"><Brand /><span className="loading-spinner" aria-hidden="true" /><p>正在整理广告位数据…</p></div></main>;

  return (
    <AppShell
      page="placement"
      session={session}
      storeId={storeId}
      onStoreChange={onStoreChange}
      onSwitchTenant={onSwitchTenant}
      onLogout={onLogout}
      onRefresh={refresh}
      cacheInfo={cacheInfo}
      dateProps={{
        minDate: data.minDate,
        maxDate: data.maxDate,
        startDate: range.startDate,
        endDate: range.endDate,
        onChange: (startDate, endDate) => setRange({ startDate, endDate }),
      }}
    >
      <main className="dashboard placement-dashboard">
        <div className="page-heading">
          <div><h1>广告位报表分析</h1><p>比较搜索顶部、其余搜索与商品页面的投入产出，定位可扩量与需复核的广告活动。</p></div>
          <div className="data-freshness"><span aria-hidden="true" />数据更新至 {data.maxDate.replaceAll('-', '/')}</div>
        </div>

        <section className="stats-grid" aria-label="广告位核心指标">
          <StatCard icon={Wallet} label="总花费" value={money(summary.spend)} rawValue={money(summary.spend)} note={`整体 CPC ${money(summary.cpc)} · ${formatNumber(summary.campaignCount)} 个活动`} />
          <StatCard icon={CircleDollarSign} label="7天总销售额" value={money(summary.sales)} rawValue={money(summary.sales)} note={`整体 ROAS ${multiple(summary.roas)}`} />
          <StatCard icon={ShoppingCart} label="7天总订单数" value={formatNumber(summary.orders)} rawValue={formatNumber(summary.orders)} note={`整体 CVR ${formatPercent(summary.cvr)} · CPO ${money(summary.cpo)}`} />
          <StatCard icon={Percent} label="综合 ACOS" value={formatPercent(summary.acos)} rawValue={formatPercent(summary.acos)} note={`总展示 ${formatCompact(summary.impressions)} · 总点击 ${formatNumber(summary.clicks)}`} />
        </section>

        <PlacementAiAnalysis snapshot={snapshot} range={range} datasetId={data.datasetId} storeId={storeId} tenantId={session.currentTenant.id} />
        <div className="charts-grid placement-charts-grid">
          <PlacementTrendChart dailyRows={snapshot.daily} dates={filteredDates} />
          <PlacementStructureChart placements={placements} />
        </div>
        <PlacementPerformanceTable placements={placements} />
        <PlacementStrategyTable rows={snapshot.strategies} />
        <PlacementCampaignTable rows={snapshot.campaigns} summary={summary} startDate={range.startDate} endDate={range.endDate} />

        <footer className="dashboard-footer">
          <p>演示数据：{data.storeCode} 商品推广广告位报告 · 原始 {formatNumber(data.totalRows)} 行 · 跳过 {formatNumber(data.skippedRows)} 行 · 重复粒度 {formatNumber(data.duplicateRows)} 行</p>
          <p>日期＋广告组合＋广告活动＋广告位为原始粒度；订单、销售额与销售量为7天归因，比率由汇总基础字段重算。</p>
        </footer>
      </main>
    </AppShell>
  );
}
