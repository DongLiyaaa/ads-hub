import { useState } from 'react';
import { AlertCircle, Bot, ChevronRight, LoaderCircle, RefreshCw, Route, Sparkles } from 'lucide-react';
import HorizontalScroller from '../HorizontalScroller.jsx';
import { createPurchasedProductModelPayload } from '../../lib/purchasedProductAnalysis.js';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/data.js';
import usePersistentAnalysis, { formatAnalysisTime } from '../../hooks/usePersistentAnalysis.js';

const TABS = [
  { id: 'ai', label: 'AI 综合分析' },
  { id: 'purchased', label: '承接商品 Top 10' },
  { id: 'advertised', label: '引流商品 Top 10' },
  { id: 'paths', label: '高销售路径' },
];
const money = (value) => formatCurrency(value ?? 0);

function parseSections(markdown) {
  const sections = [];
  const matcher = /^##\s+(.+)$/gm;
  let match;
  while ((match = matcher.exec(markdown)) !== null) {
    const nextHeading = /^##\s+/gm;
    nextHeading.lastIndex = matcher.lastIndex;
    const next = nextHeading.exec(markdown);
    sections.push({ title: match[1].trim(), body: markdown.slice(matcher.lastIndex, next ? next.index : markdown.length).trim() });
    if (next) matcher.lastIndex = next.index;
  }
  return sections.length ? sections : [{ title: 'AI 分析结果', body: markdown }];
}

function PurchasedTable({ items }) {
  return <HorizontalScroller className="analysis-table-scroll" label="承接商品表"><table className="analysis-table purchased-ai-table"><thead><tr><th className="align-left">已购买 ASIN</th><th>销售额</th><th>订单</th><th>销售量</th><th>销售占比</th><th>来源广告 ASIN</th><th>商品角色</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="align-left keyword-cell">{item.purchasedAsin}</td><td>{money(item.sales)}</td><td>{formatNumber(item.orders)}</td><td>{formatNumber(item.units)}</td><td>{formatPercent(item.salesShare)}</td><td>{formatNumber(item.sourceAdvertisedCount)}</td><td><span className="product-role">{item.role}</span></td></tr>)}</tbody></table></HorizontalScroller>;
}

function AdvertisedTable({ items }) {
  return <HorizontalScroller className="analysis-table-scroll" label="引流商品表"><table className="analysis-table purchased-ai-table"><thead><tr><th className="align-left">广告投放 ASIN</th><th>带动销售额</th><th>订单</th><th>购买 ASIN 数</th><th>主要购买 ASIN</th><th>主要路径占比</th><th>商品角色</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="align-left keyword-cell">{item.advertisedAsin}</td><td>{money(item.sales)}</td><td>{formatNumber(item.orders)}</td><td>{formatNumber(item.purchasedAsinCount)}</td><td>{item.mainPurchasedAsin}</td><td>{formatPercent(item.mainPurchasedShare)}</td><td><span className="product-role">{item.role}</span></td></tr>)}</tbody></table></HorizontalScroller>;
}

function PathTable({ items }) {
  return <HorizontalScroller className="analysis-table-scroll analysis-table-scroll--tall" label="高销售购买路径表"><table className="analysis-table purchased-path-ai-table"><thead><tr><th>排名</th><th className="align-left">广告投放 ASIN</th><th className="align-left">已购买 ASIN</th><th>销售额</th><th>订单</th><th>路径占比</th><th>活动数</th><th className="align-left">路径判断</th><th className="align-left">建议</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td className="align-left keyword-cell">{item.advertisedAsin}</td><td className="align-left keyword-cell">{item.purchasedAsin}</td><td>{money(item.sales)}</td><td>{formatNumber(item.orders)}</td><td>{formatPercent(item.salesShare)}</td><td>{formatNumber(item.campaignCount)}</td><td className="align-left"><span className="product-role"><Route size={12} aria-hidden="true" />{item.pathRole}</span></td><td className="align-left path-action" title={item.action}>{item.action}</td></tr>)}</tbody></table></HorizontalScroller>;
}

export default function PurchasedProductAiAnalysis({ snapshot, range, datasetId, storeId, tenantId }) {
  const [activeTab, setActiveTab] = useState('ai');
  const { status, result, error, analyze, agentName } = usePersistentAnalysis({
    reportType: 'purchased-product', datasetId, storeId, tenantId, range,
    createPayload: () => createPurchasedProductModelPayload(snapshot, range, datasetId),
  });
  const startAnalysis = () => { setActiveTab('ai'); analyze(); };

  const sections = result ? parseSections(result.analysis) : [];
  return (
    <section className="panel ai-panel" aria-labelledby="purchased-ai-title">
      <div className="ai-hero"><div className="ai-hero__icon"><Sparkles size={21} aria-hidden="true" /></div><div className="ai-hero__copy"><h2 id="purchased-ai-title">AI 全量数据洞察</h2><p>购买承接、广告引流、ASIN 路径与商品角色 · 覆盖当前筛选后的全部汇总数据</p></div><div className="ai-hero__action"><span>{agentName} · 本地分析 Agent</span><button type="button" className="primary-button" onClick={startAnalysis} disabled={status === 'loading' || status === 'restoring' || !snapshot.daily.length}>{status === 'loading' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Bot size={16} aria-hidden="true" />}{status === 'loading' ? '正在分析全部数据…' : result ? '重新分析' : '开始 AI 分析'}</button></div></div>
      <div className="analysis-meta"><span>{range.startDate.replaceAll('-', '/')} – {range.endDate.replaceAll('-', '/')}</span><span>{formatNumber(snapshot.summary.purchasedAsinCount)} 个购买 ASIN</span><span>{formatNumber(snapshot.summary.advertisedAsinCount)} 个广告 ASIN</span><span>{formatNumber(snapshot.summary.pathCount)} 条购买路径</span><span className="analysis-meta__note">点击分析即表示同意将上述汇总数据交由当前配置的 Agent 及其模型服务处理；可能消耗模型额度</span></div>
      <div className="analysis-tabs" role="tablist" aria-label="已购买商品分析视图">{TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}<ChevronRight size={13} aria-hidden="true" /></button>)}</div>
      <div className="analysis-content" role="tabpanel">
        {activeTab === 'ai' && <>
          {status === 'idle' && <div className="ai-empty"><Bot size={28} aria-hidden="true" /><div><strong>让 {agentName} 阅读完整购买路径汇总数据</strong><p>区分投流入口与购买承接，输出保留、观察和小预算验证建议。其他标签可直接查看确定性结果，无需调用模型。</p></div></div>}
          {status === 'restoring' && <div className="ai-loading" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><div><strong>正在读取已保存分析</strong><p>按当前报表、数据版本和日期范围恢复最新结果。</p></div></div>}
          {status === 'loading' && <div className="ai-loading" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><div><strong>{agentName} 正在分析当前全部数据</strong><p>切换日期或报表会取消本次请求。</p></div></div>}
          {status === 'error' && <div className="ai-error" role="alert"><AlertCircle size={22} aria-hidden="true" /><div><strong>本次分析未完成</strong><p>{error}</p></div><button type="button" className="secondary-button" onClick={startAnalysis}><RefreshCw size={14} aria-hidden="true" />重试</button></div>}
          {status === 'success' && result && <div className="ai-report"><div className="ai-report__status"><span><span aria-hidden="true" />分析已完成 · 已保存</span><small>{result.model} · 第 {result.version} 版{result.configRevision ? ` · 配置 v${result.configRevision}` : ''} · {formatAnalysisTime(result.generatedAt)}</small></div><div className="ai-report__grid">{sections.map((section) => <article key={section.title}><h3>{section.title}</h3><p>{section.body}</p></article>)}</div><p className="ai-disclaimer">缺少利润、库存和购买 ASIN 直接投放效率；AI 结论只用于辅助复核，不会自动迁移预算或调整广告。</p></div>}
        </>}
        {activeTab === 'purchased' && <><div className="analysis-section-note">按其他 SKU 销售额排序。承接中心候选只表示多个广告 ASIN 导向它，不代表适合直接放量。</div><PurchasedTable items={snapshot.purchased.slice(0, 10)} /></>}
        {activeTab === 'advertised' && <><div className="analysis-section-note">按广告 ASIN 带动的其他 SKU 销售额排序。引流入口候选不代表可计算 ACOS，也不建议直接暂停。</div><AdvertisedTable items={snapshot.advertised.slice(0, 10)} /></>}
        {activeTab === 'paths' && <><div className="analysis-section-note">展示销售额最高的 20 条路径。所有路径均需结合搜索词、利润、库存和购买 ASIN 直接投放表现复核。</div><PathTable items={snapshot.paths.slice(0, 20)} /></>}
      </div>
    </section>
  );
}
