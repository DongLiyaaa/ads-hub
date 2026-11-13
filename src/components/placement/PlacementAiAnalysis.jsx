import { useState } from 'react';
import { AlertCircle, Bot, ChevronRight, CircleAlert, LoaderCircle, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import HorizontalScroller from '../HorizontalScroller.jsx';
import { createPlacementModelPayload } from '../../lib/placementAnalysis.js';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/data.js';
import { PLACEMENT_MAP } from '../../lib/placementData.js';
import usePersistentAnalysis, { formatAnalysisTime } from '../../hooks/usePersistentAnalysis.js';

const TABS = [
  { id: 'ai', label: 'AI 综合分析' },
  { id: 'placements', label: '广告位表现' },
  { id: 'opportunities', label: '扩量候选' },
  { id: 'risks', label: '止损候选' },
];
const money = (value) => value == null ? '—' : formatCurrency(value);
const multiple = (value) => value == null ? '—' : `${value.toFixed(2)}×`;

function parseSections(markdown) {
  const sections = [];
  const matcher = /^##\s+(.+)$/gm;
  let match;
  while ((match = matcher.exec(markdown)) !== null) {
    const bodyStart = matcher.lastIndex;
    const nextHeading = /^##\s+/gm;
    nextHeading.lastIndex = bodyStart;
    const next = nextHeading.exec(markdown);
    sections.push({ title: match[1].trim(), body: markdown.slice(bodyStart, next ? next.index : markdown.length).trim() });
    if (next) matcher.lastIndex = next.index;
  }
  return sections.length ? sections : [{ title: 'AI 分析结果', body: markdown }];
}

function PlacementSummary({ items }) {
  return (
    <HorizontalScroller className="analysis-table-scroll" label="广告位表现表"><table className="analysis-table placement-ai-table">
      <thead><tr><th className="align-left">广告位</th><th>花费</th><th>花费占比</th><th>订单占比</th><th>CVR</th><th>CPO</th><th>ACOS</th><th>ROAS</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td className="align-left"><span className="placement-label"><i style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}</span></td>
        <td>{money(item.spend)}</td><td>{formatPercent(item.spendShare)}</td><td>{formatPercent(item.orderShare)}</td>
        <td>{formatPercent(item.cvr)}</td><td>{money(item.cpo)}</td><td>{formatPercent(item.acos)}</td><td>{multiple(item.roas)}</td>
      </tr>)}</tbody>
    </table></HorizontalScroller>
  );
}

function CandidateTable({ items, type }) {
  const risk = type === 'risk';
  return (
    <HorizontalScroller className="analysis-table-scroll analysis-table-scroll--tall" label={`${risk ? '止损' : '扩量'}候选表`}><table className="analysis-table placement-candidate-table">
      <thead><tr><th>排名</th><th className="align-left">广告活动</th><th className="align-left">广告位</th><th className="align-left">命中原因</th><th>点击</th><th>花费</th><th>销售额</th><th>订单</th><th>CVR</th><th>ACOS</th></tr></thead>
      <tbody>{items.length ? items.map((item, index) => <tr key={item.id}>
        <td>{index + 1}</td><td className="align-left keyword-cell" title={item.campaign}>{item.campaign}</td>
        <td className="align-left"><span className="placement-label"><i style={{ backgroundColor: PLACEMENT_MAP.get(item.placement)?.color }} aria-hidden="true" />{item.placementLabel}</span></td>
        <td className="align-left candidate-reason"><span className={`diagnosis-tag diagnosis-tag--${risk ? 'risk' : 'opportunity'}`}>{risk ? <CircleAlert size={13} aria-hidden="true" /> : <TrendingUp size={13} aria-hidden="true" />}{risk ? '风险复核' : '相对高效'}</span><span title={item.reasons.join('；')}>{item.reasons.join('；')}</span></td>
        <td>{formatNumber(item.clicks)}</td><td>{money(item.spend)}</td><td>{money(item.sales)}</td><td>{formatNumber(item.orders)}</td><td>{formatPercent(item.cvr)}</td><td>{formatPercent(item.acos)}</td>
      </tr>) : <tr><td colSpan="10" className="analysis-table-empty">当前范围没有符合规则且点击≥30次的候选</td></tr>}</tbody>
    </table></HorizontalScroller>
  );
}

export default function PlacementAiAnalysis({ snapshot, range, datasetId, storeId, tenantId }) {
  const [activeTab, setActiveTab] = useState('ai');
  const { status, result, error, analyze, agentName } = usePersistentAnalysis({
    reportType: 'placement', datasetId, storeId, tenantId, range,
    createPayload: () => createPlacementModelPayload(snapshot, range, datasetId),
  });
  const startAnalysis = () => { setActiveTab('ai'); analyze(); };

  const sections = result ? parseSections(result.analysis) : [];
  return (
    <section className="panel ai-panel" aria-labelledby="placement-ai-title">
      <div className="ai-hero">
        <div className="ai-hero__icon"><Sparkles size={21} aria-hidden="true" /></div>
        <div className="ai-hero__copy"><h2 id="placement-ai-title">AI 全量数据洞察</h2><p>广告位结构、每日趋势、活动下钻与竞价策略组合 · 覆盖当前筛选后的全部数据</p></div>
        <div className="ai-hero__action"><span>{agentName} · 本地分析 Agent</span><button type="button" className="primary-button" onClick={startAnalysis} disabled={status === 'loading' || status === 'restoring' || !snapshot.daily.length}><>{status === 'loading' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Bot size={16} aria-hidden="true" />}</>{status === 'loading' ? '正在分析全部数据…' : result ? '重新分析' : '开始 AI 分析'}</button></div>
      </div>
      <div className="analysis-meta">
        <span>{range.startDate.replaceAll('-', '/')} – {range.endDate.replaceAll('-', '/')}</span>
        <span>{snapshot.placements.length} 类广告位</span><span>{formatNumber(snapshot.summary.campaignCount)} 个广告活动</span><span>{new Set(snapshot.daily.map((row) => row.date)).size} 天趋势</span>
        <span className="analysis-meta__note">点击分析即表示同意将上述汇总数据交由当前配置的 Agent 及其模型服务处理；可能消耗模型额度</span>
      </div>
      <div className="analysis-tabs" role="tablist" aria-label="广告位分析视图">
        {TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}<ChevronRight size={13} aria-hidden="true" /></button>)}
      </div>
      <div className="analysis-content" role="tabpanel">
        {activeTab === 'ai' && <>
          {status === 'idle' && <div className="ai-empty"><Bot size={28} aria-hidden="true" /><div><strong>让 {agentName} 阅读完整广告位汇总数据</strong><p>生成结构、趋势、活动与竞价策略拆解，并给出带风险和复核周期的建议。其他标签可直接查看确定性结果，无需调用模型。</p></div></div>}
          {status === 'restoring' && <div className="ai-loading" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><div><strong>正在读取已保存分析</strong><p>按当前报表、数据版本和日期范围恢复最新结果。</p></div></div>}
          {status === 'loading' && <div className="ai-loading" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><div><strong>{agentName} 正在分析当前全部数据</strong><p>数据量较大，可能需要一些时间。切换日期或报表会取消本次请求。</p></div></div>}
          {status === 'error' && <div className="ai-error" role="alert"><AlertCircle size={22} aria-hidden="true" /><div><strong>本次分析未完成</strong><p>{error}</p></div><button type="button" className="secondary-button" onClick={startAnalysis}><RefreshCw size={14} aria-hidden="true" />重试</button></div>}
          {status === 'success' && result && <div className="ai-report"><div className="ai-report__status"><span><span aria-hidden="true" />分析已完成 · 已保存</span><small>{result.model} · 第 {result.version} 版{result.configRevision ? ` · 配置 v${result.configRevision}` : ''} · {formatAnalysisTime(result.generatedAt)}</small></div><div className="ai-report__grid">{sections.map((section) => <article key={section.title}><h3>{section.title}</h3><p>{section.body}</p></article>)}</div><p className="ai-disclaimer">AI 结论用于辅助判断，请结合确定性表格、目标 ACOS 和利润复核；不会自动调整竞价、预算或广告位溢价。</p></div>}
        </>}
        {activeTab === 'placements' && <><div className="analysis-section-note">三类广告位均由当前范围基础字段汇总；占比是报告内结构，不是亚马逊市场展示份额。</div><PlacementSummary items={snapshot.placements} /></>}
        {activeTab === 'opportunities' && <><div className="analysis-section-note">最多展示10个相对高效候选。点击≥30次，ACOS与CVR优于整体或CPO低于整体20%；不代表盈利，扩量后需复核CPC和ACOS上升风险。</div><CandidateTable items={snapshot.opportunities} type="opportunity" /></>}
        {activeTab === 'risks' && <><div className="analysis-section-note">最多展示50个风险复核候选。点击≥30次，命中无订单、ACOS/CVR偏离整体或高CPC规则；止损可能损失订单，建议先下钻再于7天后复核。</div><CandidateTable items={snapshot.risks} type="risk" /></>}
      </div>
    </section>
  );
}
