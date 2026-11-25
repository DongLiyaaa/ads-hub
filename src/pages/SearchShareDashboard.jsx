import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, MousePointerClick, RefreshCw, Target, Type } from 'lucide-react';
import AppShell, { Brand } from '../components/AppShell.jsx';
import AiAnalysis from '../components/AiAnalysis.jsx';
import KeywordTable from '../components/KeywordTable.jsx';
import StatCard from '../components/StatCard.jsx';
import TrendChart from '../components/TrendChart.jsx';
import WordCloud from '../components/WordCloud.jsx';
import ReportUpload from '../components/ReportUpload.jsx';
import {
  aggregateEntries,
  filterEntriesByDate,
  formatCompact,
  formatNumber,
  formatPercent,
  prepareData,
} from '../lib/data.js';
import { buildAnalysisSnapshot } from '../lib/analysis.js';
import useReportData from '../hooks/useReportData.js';

function prepareSearchShare(payload) {
  const prepared = { ...prepareData(payload.rows), datasetId: payload.datasetId, totalRows: payload.totalRows, storeCode: payload.storeCode };
  if (!prepared.entries.length) throw new Error('当前店铺没有可展示的有效搜索词数据');
  return prepared;
}

export default function SearchShareDashboard({ session, storeId, onStoreChange, onSwitchTenant, onLogout }) {
  const { data, error, cacheInfo, refresh } = useReportData({
    reportType: 'search-share', userId: session.user.id, tenantId: session.currentTenant.id, storeId, prepare: prepareSearchShare,
  });
  const [range, setRange] = useState(null);

  useEffect(() => {
    setRange(data ? { startDate: data.minDate, endDate: data.maxDate } : null);
  }, [data]);

  const filteredEntries = useMemo(() => {
    if (!data || !range) return [];
    return filterEntriesByDate(data.entries, range.startDate, range.endDate);
  }, [data, range]);

  const { summary, keywords } = useMemo(() => aggregateEntries(filteredEntries), [filteredEntries]);
  const filteredCampaignRows = useMemo(() => {
    if (!data || !range) return [];
    return filterEntriesByDate(data.campaignRows, range.startDate, range.endDate);
  }, [data, range]);
  const filteredDates = useMemo(() => {
    if (!data || !range) return [];
    return data.dates.filter((date) => date >= range.startDate && date <= range.endDate);
  }, [data, range]);
  const analysisSnapshot = useMemo(() => buildAnalysisSnapshot({
    entries: filteredEntries,
    campaignRows: filteredCampaignRows,
    summary,
    keywords,
    dates: filteredDates,
    topKeywords: data?.topKeywords || [],
  }), [filteredEntries, filteredCampaignRows, summary, keywords, filteredDates, data]);

  if (error) {
    return (
      <AppShell page="search-share" session={session} storeId={storeId} onStoreChange={onStoreChange} onSwitchTenant={onSwitchTenant} onLogout={onLogout}>
        <main className="dashboard"><section className="panel empty-workspace" role="alert">
          <span className="status-icon"><BarChart3 size={26} aria-hidden="true" /></span>
          <h1>看板暂时无法加载</h1>
          <p>{error}</p>
          <div className="empty-workspace__actions"><ReportUpload reportType="search-share" storeId={storeId} onUploaded={refresh} isDemo={session.currentTenant.environment === 'demo'} /><button type="button" className="primary-button" onClick={refresh}><RefreshCw size={16} />重新加载</button></div>
        </section></main>
      </AppShell>
    );
  }

  if (!data || !range) {
    return (
      <main className="status-screen" aria-live="polite">
        <div className="loading-content"><Brand /><span className="loading-spinner" aria-hidden="true" /><p>正在整理搜索词数据…</p></div>
      </main>
    );
  }

  const averageImpressions = filteredDates.length ? summary.impressions / filteredDates.length : 0;

  return (
    <AppShell
      page="search-share"
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
      <main className="dashboard">
        <div className="page-heading">
          <div>
            <h1>搜索词展示份额</h1>
            <p>看清关键词的市场可见度与变化趋势。</p>
          </div>
          <div className="page-heading__actions"><ReportUpload reportType="search-share" storeId={storeId} onUploaded={refresh} isDemo={session.currentTenant.environment === 'demo'} /><div className="data-freshness"><span aria-hidden="true" />数据更新至 {data.maxDate.replaceAll('-', '/')}</div></div>
        </div>

        <section className="stats-grid" aria-label="核心指标">
          <StatCard icon={Target} label="平均展示份额" value={formatPercent(summary.share)} rawValue={formatPercent(summary.share)} note="按展示量加权 · 非份额求和" />
          <StatCard icon={Eye} label="总展示量" value={formatCompact(summary.impressions)} rawValue={formatNumber(summary.impressions)} note={`日均 ${formatCompact(averageImpressions)} 次展示`} />
          <StatCard icon={MousePointerClick} label="总点击量" value={formatCompact(summary.clicks)} rawValue={formatNumber(summary.clicks)} note={`整体点击率 ${formatPercent(summary.ctr)}`} />
          <StatCard icon={Type} label="搜索词数" value={formatNumber(summary.keywordCount)} rawValue={formatNumber(summary.keywordCount)} note={`覆盖 ${filteredDates.length} 天数据`} />
        </section>

        <AiAnalysis snapshot={analysisSnapshot} range={range} datasetId={data.datasetId} storeId={storeId} tenantId={session.currentTenant.id} />

        <div className="charts-grid">
          <TrendChart entries={filteredEntries} dates={filteredDates} topKeywords={data.topKeywords} />
          <WordCloud keywords={keywords} />
        </div>

        <KeywordTable keywords={keywords} startDate={range.startDate} endDate={range.endDate} />

        <footer className="dashboard-footer">
          <p>{session.currentTenant.environment === 'demo' ? '演示数据' : '报表数据'}：{data.storeCode} 商品推广搜索词展示量份额报告 · 原始 {formatNumber(data.totalRows)} 行{data.skippedRows ? ` · 跳过 ${formatNumber(data.skippedRows)} 行` : ''}</p>
          <p>同一日期、同一搜索词的份额只计一次；展示量、点击量等指标按广告活动累加。</p>
        </footer>
      </main>
    </AppShell>
  );
}
