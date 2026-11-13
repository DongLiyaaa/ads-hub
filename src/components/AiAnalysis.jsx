import { useState } from 'react';
import { AlertCircle, Bot, ChevronRight, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import { createModelPayload } from '../lib/analysis.js';
import { formatCurrency, formatNumber, formatPercent } from '../lib/data.js';
import usePersistentAnalysis, { formatAnalysisTime } from '../hooks/usePersistentAnalysis.js';

const TABS = [
  { id: 'ai', label: 'AI 综合分析' },
  { id: 'core', label: '核心关键词' },
  { id: 'campaigns', label: '最差 5 个广告活动' },
  { id: 'worst', label: '最差 50 个关键词' },
];

function parseSections(markdown) {
  const sections = [];
  const matcher = /^##\s+(.+)$/gm;
  let match;
  while ((match = matcher.exec(markdown)) !== null) {
    const bodyStart = matcher.lastIndex;
    const nextHeading = /^##\s+/gm;
    nextHeading.lastIndex = bodyStart;
    const next = nextHeading.exec(markdown);
    sections.push({
      title: match[1].trim(),
      body: markdown.slice(bodyStart, next ? next.index : markdown.length).trim(),
    });
    if (next) matcher.lastIndex = next.index;
  }
  return sections.length ? sections : [{ title: 'AI 分析结果', body: markdown }];
}

function ScoreBreakdown({ item }) {
  return (
    <span className="score-breakdown" title={`花费 ${item.scoreParts.cost.toFixed(2)} + CVR ${item.scoreParts.conversionRate.toFixed(2)} + ACOS ${item.scoreParts.acos.toFixed(2)}`}>
      <strong>{item.inefficiencyScore.toFixed(2)}</strong>
      <small>{item.scoreParts.cost.toFixed(1)} / {item.scoreParts.conversionRate.toFixed(1)} / {item.scoreParts.acos.toFixed(1)}</small>
    </span>
  );
}

function EmptyTable({ colSpan, children }) {
  return <tr><td colSpan={colSpan} className="analysis-table-empty">{children}</td></tr>;
}

function CoreKeywords({ items }) {
  return (
    <div className="analysis-table-scroll">
      <table className="analysis-table core-table">
        <thead><tr><th className="align-left">核心关键词</th><th>销售额</th><th>订单</th><th>CVR</th><th>ACOS</th><th>花费</th><th>展示份额</th></tr></thead>
        <tbody>
          {items.length ? items.map((item) => (
            <tr key={item.keyword}>
              <td className="align-left keyword-cell" title={item.keyword}>{item.keyword}</td>
              <td>{formatCurrency(item.sales)}</td><td>{formatNumber(item.orders)}</td>
              <td>{formatPercent(item.conversionRate)}</td><td>{formatPercent(item.acos)}</td>
              <td>{formatCurrency(item.cost)}</td><td>{formatPercent(item.share)}</td>
            </tr>
          )) : <EmptyTable colSpan={7}>当前范围没有产生销售额的关键词</EmptyTable>}
        </tbody>
      </table>
    </div>
  );
}

function WorstCampaigns({ items }) {
  return (
    <div className="analysis-table-scroll">
      <table className="analysis-table campaign-table">
        <thead><tr><th>排名</th><th className="align-left">广告活动</th><th>低效分<br /><small>花费/CVR/ACOS</small></th><th>花费</th><th>销售额</th><th>CVR</th><th>ACOS</th><th>订单</th><th>关键词数</th></tr></thead>
        <tbody>
          {items.length ? items.map((item, index) => (
            <tr key={item.campaign}>
              <td>{index + 1}</td><td className="align-left keyword-cell" title={item.campaign}>{item.campaign}</td>
              <td><ScoreBreakdown item={item} /></td><td>{formatCurrency(item.cost)}</td><td>{formatCurrency(item.sales)}</td>
              <td>{formatPercent(item.conversionRate)}</td><td>{formatPercent(item.acos)}</td>
              <td>{formatNumber(item.orders)}</td><td>{formatNumber(item.keywordCount)}</td>
            </tr>
          )) : <EmptyTable colSpan={9}>当前范围没有有花费的广告活动</EmptyTable>}
        </tbody>
      </table>
    </div>
  );
}

function WorstKeywords({ items }) {
  return (
    <div className="analysis-table-scroll analysis-table-scroll--tall">
      <table className="analysis-table worst-table">
        <thead><tr><th>排名</th><th className="align-left">关键词</th><th>低效分<br /><small>花费/CVR/ACOS</small></th><th>花费</th><th>销售额</th><th>点击量</th><th>订单</th><th>CVR</th><th>ACOS</th></tr></thead>
        <tbody>
          {items.length ? items.map((item, index) => (
            <tr key={item.keyword}>
              <td>{index + 1}</td><td className="align-left keyword-cell" title={item.keyword}>{item.keyword}</td>
              <td><ScoreBreakdown item={item} /></td><td>{formatCurrency(item.cost)}</td><td>{formatCurrency(item.sales)}</td>
              <td>{formatNumber(item.clicks)}</td><td>{formatNumber(item.orders)}</td>
              <td>{formatPercent(item.conversionRate)}</td><td>{formatPercent(item.acos)}</td>
            </tr>
          )) : <EmptyTable colSpan={9}>当前范围没有有花费的关键词</EmptyTable>}
        </tbody>
      </table>
    </div>
  );
}

export default function AiAnalysis({ snapshot, range, datasetId }) {
  const [activeTab, setActiveTab] = useState('ai');
  const { status, result, error, analyze, agentName } = usePersistentAnalysis({
    reportType: 'search-share', datasetId, range,
    createPayload: () => createModelPayload(snapshot, range, datasetId),
  });
  const startAnalysis = () => { setActiveTab('ai'); analyze(); };

  const sections = result ? parseSections(result.analysis) : [];

  return (
    <section className="panel ai-panel" aria-labelledby="ai-analysis-title">
      <div className="ai-hero">
        <div className="ai-hero__icon"><Sparkles size={21} aria-hidden="true" /></div>
        <div className="ai-hero__copy">
          <h2 id="ai-analysis-title">AI 全量数据洞察</h2>
          <p>趋势与词云拆解、核心关键词、广告活动透视和低效评分 · 覆盖当前筛选后的全部数据</p>
        </div>
        <div className="ai-hero__action">
          <span>{agentName} · 本地分析 Agent</span>
          <button type="button" className="primary-button" onClick={startAnalysis} disabled={status === 'loading' || status === 'restoring' || !snapshot.daily.length}>
            {status === 'loading' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Bot size={16} aria-hidden="true" />}
            {status === 'loading' ? '正在分析全部数据…' : result ? '重新分析' : '开始 AI 分析'}
          </button>
        </div>
      </div>

      <div className="analysis-meta">
        <span>{range.startDate.replaceAll('-', '/')} – {range.endDate.replaceAll('-', '/')}</span>
        <span>{formatNumber(snapshot.keywords.length)} 个关键词</span>
        <span>{formatNumber(snapshot.campaigns.length)} 个广告活动</span>
        <span>{formatNumber(snapshot.daily.length)} 天趋势</span>
        <span className="analysis-meta__note">点击分析即表示同意将上述汇总数据交由当前配置的 Agent 及其模型服务处理；可能消耗模型额度</span>
      </div>

      <div className="analysis-tabs" role="tablist" aria-label="分析视图">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>
            {tab.label}<ChevronRight size={13} aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="analysis-content" role="tabpanel">
        {activeTab === 'ai' && (
          <>
            {status === 'idle' && (
              <div className="ai-empty">
                <Bot size={28} aria-hidden="true" />
                <div><strong>让 {agentName} 阅读完整汇总数据</strong><p>生成趋势图与词云拆解，并解释核心关键词、最差广告活动和低效关键词。下方其他标签可直接查看确定性透视结果，无需调用模型。</p></div>
              </div>
            )}
            {status === 'restoring' && (
              <div className="ai-loading" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><div><strong>正在读取已保存分析</strong><p>按当前报表、数据版本和日期范围恢复最新结果。</p></div></div>
            )}
            {status === 'loading' && (
              <div className="ai-loading" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><div><strong>{agentName} 正在分析当前全部数据</strong><p>数据量较大，可能需要一些时间。切换日期会取消本次请求。</p></div></div>
            )}
            {status === 'error' && (
              <div className="ai-error" role="alert"><AlertCircle size={22} aria-hidden="true" /><div><strong>本次分析未完成</strong><p>{error}</p></div><button type="button" className="secondary-button" onClick={startAnalysis}><RefreshCw size={14} />重试</button></div>
            )}
            {status === 'success' && result && (
              <div className="ai-report">
                <div className="ai-report__status"><span><span aria-hidden="true" />分析已完成 · 已保存</span><small>{result.model} · 第 {result.version} 版{result.configRevision ? ` · 配置 v${result.configRevision}` : ''} · {formatAnalysisTime(result.generatedAt)}{result.usage?.outputTokens != null ? ` · ${formatNumber(result.usage.outputTokens)} 输出 tokens` : ''}</small></div>
                <div className="ai-report__grid">
                  {sections.map((section) => <article key={section.title}><h3>{section.title}</h3><p>{section.body}</p></article>)}
                </div>
                <p className="ai-disclaimer">AI 结论用于辅助判断，请结合确定性评分表与业务目标复核，不建议直接批量调整广告。</p>
              </div>
            )}
          </>
        )}
        {activeTab === 'core' && <><div className="analysis-section-note">按当前范围销售额排序的 TOP 10；用于定位核心贡献词，不代表全部词都应加大投放。</div><CoreKeywords items={snapshot.coreKeywords} /></>}
        {activeTab === 'campaigns' && <><div className="analysis-section-note">从原始广告活动行独立透视，再按低效分排序；低效分 = 花费 50 + CVR 30 + ACOS 20。</div><WorstCampaigns items={snapshot.worstCampaigns} /></>}
        {activeTab === 'worst' && <><div className="analysis-section-note">仅包含有花费关键词；分数越高越差。得分小项依次为花费 / CVR / ACOS，无点击 CVR 项计 30，无销售 ACOS 项计 20。</div><WorstKeywords items={snapshot.worstKeywords} /></>}
      </div>
    </section>
  );
}
