import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Package, RefreshCw, Route, ShoppingCart } from 'lucide-react';
import AppShell, { Brand } from '../components/AppShell.jsx';
import StatCard from '../components/StatCard.jsx';
import PurchasedProductAiAnalysis from '../components/purchased/PurchasedProductAiAnalysis.jsx';
import PurchasedProductExplorer from '../components/purchased/PurchasedProductExplorer.jsx';
import PurchasedProductTrendChart from '../components/purchased/PurchasedProductTrendChart.jsx';
import TopPurchasedProductChart from '../components/purchased/TopPurchasedProductChart.jsx';
import { buildPurchasedProductSnapshot, filterPurchasedProductRows, preparePurchasedProductData } from '../lib/purchasedProductData.js';
import { formatCurrency, formatNumber } from '../lib/data.js';
import useReportData from '../hooks/useReportData.js';

function preparePurchasedProduct(payload) {
  const prepared = { ...preparePurchasedProductData(payload), datasetId: payload.datasetId, storeCode: payload.storeCode };
  if (!prepared.rows.length) throw new Error('当前店铺没有可展示的有效已购买商品数据');
  return prepared;
}

export default function PurchasedProductDashboard({ session, storeId, onStoreChange, onSwitchTenant, onLogout }) {
  const { data, error, cacheInfo, refresh } = useReportData({
    reportType: 'purchased-product', userId: session.user.id, tenantId: session.currentTenant.id, storeId, prepare: preparePurchasedProduct,
  });
  const [range, setRange] = useState(null);

  useEffect(() => {
    setRange(data ? { startDate: data.minDate, endDate: data.maxDate } : null);
  }, [data]);

  const filteredRows = useMemo(() => data && range ? filterPurchasedProductRows(data.rows, range.startDate, range.endDate) : [], [data, range]);
  const filteredDates = useMemo(() => data && range ? data.dates.filter((date) => date >= range.startDate && date <= range.endDate) : [], [data, range]);
  const snapshot = useMemo(() => buildPurchasedProductSnapshot(filteredRows), [filteredRows]);

  if (error) return <AppShell page="purchased-product" session={session} storeId={storeId} onStoreChange={onStoreChange} onSwitchTenant={onSwitchTenant} onLogout={onLogout}><main className="dashboard"><section className="panel empty-workspace" role="alert"><span className="status-icon"><Package size={26} aria-hidden="true" /></span><h1>看板暂时无法加载</h1><p>{error}</p><button type="button" className="primary-button" onClick={refresh}><RefreshCw size={16} aria-hidden="true" />重新加载</button></section></main></AppShell>;
  if (!data || !range) return <main className="status-screen" aria-live="polite"><div className="loading-content"><Brand /><span className="loading-spinner" aria-hidden="true" /><p>正在整理已购买商品数据…</p></div></main>;

  const { summary } = snapshot;
  return (
    <AppShell page="purchased-product" session={session} storeId={storeId} onStoreChange={onStoreChange} onSwitchTenant={onSwitchTenant} onLogout={onLogout} onRefresh={refresh} cacheInfo={cacheInfo} dateProps={{ minDate: data.minDate, maxDate: data.maxDate, startDate: range.startDate, endDate: range.endDate, onChange: (startDate, endDate) => setRange({ startDate, endDate }) }}>
      <main className="dashboard purchased-product-dashboard">
        <div className="page-heading"><div><h1>已购买商品报表分析</h1><p>识别广告 ASIN 带来的实际购买商品，区分引流入口、购买承接与待验证路径。</p></div><div className="data-freshness"><span aria-hidden="true" />数据更新至 {data.maxDate.replaceAll('-', '/')}</div></div>
        <section className="stats-grid" aria-label="已购买商品核心指标">
          <StatCard icon={CircleDollarSign} label="其他 SKU 销售额" value={formatCurrency(summary.sales)} rawValue={formatCurrency(summary.sales)} note={`7 天归因 · ${formatNumber(summary.purchasedAsinCount)} 个购买 ASIN`} />
          <StatCard icon={ShoppingCart} label="其他 SKU 订单数" value={formatNumber(summary.orders)} rawValue={formatNumber(summary.orders)} note={`${formatNumber(summary.positiveRowCount)} 条非零购买记录`} />
          <StatCard icon={Package} label="其他 SKU 销售量" value={formatNumber(summary.units)} rawValue={formatNumber(summary.units)} note={`${formatNumber(summary.advertisedAsinCount)} 个广告 ASIN 带来购买`} />
          <StatCard icon={Route} label="广告 → 购买路径" value={formatNumber(summary.pathCount)} rawValue={formatNumber(summary.pathCount)} note={summary.allPositiveRowsAreCrossAsin ? '非零记录均为跨 ASIN · 限本报告口径' : '包含同 ASIN 的其他 SKU 归因记录'} />
        </section>
        <PurchasedProductAiAnalysis snapshot={snapshot} range={range} datasetId={data.datasetId} storeId={storeId} tenantId={session.currentTenant.id} />
        <div className="charts-grid placement-charts-grid"><PurchasedProductTrendChart snapshot={snapshot} dates={filteredDates} /><TopPurchasedProductChart items={snapshot.purchased} /></div>
        <PurchasedProductExplorer snapshot={snapshot} startDate={range.startDate} endDate={range.endDate} />
        <footer className="dashboard-footer"><p>演示数据：{data.storeCode} 商品推广已购买商品报告 · 原始 {formatNumber(data.totalRows)} 行 · 跳过 {formatNumber(data.skippedRows)} 行 · 重复粒度 {formatNumber(data.duplicateRows)} 行</p><p>仅有其他 SKU 销售额、订单与销售量；缺少花费、点击、利润、库存和父子 ASIN 映射，商品角色均需进一步验证。</p></footer>
      </main>
    </AppShell>
  );
}
