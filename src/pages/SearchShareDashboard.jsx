import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, MousePointerClick, RefreshCw, Target, Type } from 'lucide-react';
import AppShell, { Brand } from '../components/AppShell.jsx';
import AiAnalysis from '../components/AiAnalysis.jsx';
import KeywordTable from '../components/KeywordTable.jsx';
import StatCard from '../components/StatCard.jsx';
import TrendChart from '../components/TrendChart.jsx';
import WordCloud from '../components/WordCloud.jsx';
import {
  aggregateEntries,
  filterEntriesByDate,
  formatCompact,
  formatNumber,
  formatPercent,
  prepareData,
} from '../lib/data.js';
import { buildAnalysisSnapshot } from '../lib/analysis.js';

export default function SearchShareDashboard() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const response = await fetch('/api/reports/search-share');
        if (!response.ok) throw new Error(`数据加载失败（${response.status}）`);
        const payload = await response.json();
        const prepared = { ...prepareData(payload.rows), datasetId: payload.datasetId };
        if (!prepared.entries.length) throw new Error('CSV 中没有可展示的有效数据');
        if (!cancelled) {
          setData(prepared);
          setRange({ startDate: prepared.minDate, endDate: prepared.maxDate });
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || '数据加载失败，请稍后重试');
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

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
      <main className="status-screen">
        <div className="status-card">
          <span className="status-icon"><BarChart3 size={26} aria-hidden="true" /></span>
          <h1>看板暂时无法加载</h1>
          <p>{error}</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}><RefreshCw size={16} />重新加载</button>
        </div>
      </main>
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
      reportContext="US1 · 商品推广"
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
          <div className="data-freshness"><span aria-hidden="true" />数据更新至 {data.maxDate.replaceAll('-', '/')}</div>
        </div>

        <section className="stats-grid" aria-label="核心指标">
          <StatCard icon={Target} label="平均展示份额" value={formatPercent(summary.share)} rawValue={formatPercent(summary.share)} note="按展示量加权 · 非份额求和" />
          <StatCard icon={Eye} label="总展示量" value={formatCompact(summary.impressions)} rawValue={formatNumber(summary.impressions)} note={`日均 ${formatCompact(averageImpressions)} 次展示`} />
          <StatCard icon={MousePointerClick} label="总点击量" value={formatCompact(summary.clicks)} rawValue={formatNumber(summary.clicks)} note={`整体点击率 ${formatPercent(summary.ctr)}`} />
          <StatCard icon={Type} label="搜索词数" value={formatNumber(summary.keywordCount)} rawValue={formatNumber(summary.keywordCount)} note={`覆盖 ${filteredDates.length} 天数据`} />
        </section>

        <AiAnalysis snapshot={analysisSnapshot} range={range} datasetId={data.datasetId} />

        <div className="charts-grid">
          <TrendChart entries={filteredEntries} dates={filteredDates} topKeywords={data.topKeywords} />
          <WordCloud keywords={keywords} />
        </div>

        <KeywordTable keywords={keywords} startDate={range.startDate} endDate={range.endDate} />

        <footer className="dashboard-footer">
          <p>演示数据：US1 商品推广搜索词展示量份额报告 · 原始 {formatNumber(data.totalRows)} 行{data.skippedRows ? ` · 跳过 ${formatNumber(data.skippedRows)} 行` : ''}</p>
          <p>同一日期、同一搜索词的份额只计一次；展示量、点击量等指标按广告活动累加。</p>
        </footer>
      </main>
    </AppShell>
  );
}
