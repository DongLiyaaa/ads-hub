import { Component, useEffect, useMemo } from 'react';
import { A2uiSurface, createComponentImplementation } from '@a2ui/react';
import { MessageProcessor } from '@a2ui/web_core/v1_0';
import { ColumnApi } from '@a2ui/web_core/v1_0';
import {
  createShareScopeCatalog, DataScopeApi, MetricGroupApi, MetricTableApi,
  RecommendationListApi, SHARE_SCOPE_SURFACE_ID,
} from '../../../shared/a2uiCatalog.js';
import {
  CompositionBarChart, ConversionFunnel, DataTable, formatValue, PurchasePathChart,
  QuadrantScatterChart, RankingBarChart, TrendChart,
} from './A2uiChartComponents.jsx';
import { ChatViewStateProvider, useChatViewState } from './ChatViewState.jsx';

function SectionHeading({ title, detail }) {
  return <div className="a2ui-section-heading"><h3>{title}</h3>{detail ? <span>{detail}</span> : null}</div>;
}

const Column = createComponentImplementation(ColumnApi, ({ props, buildChild }) => (
  <div className="a2ui-chat-column">{(props.children || []).map((child) => buildChild(child))}</div>
));

const DataScope = createComponentImplementation(DataScopeApi, ({ props }) => {
  const scope = props.data || {};
  const { viewState } = useChatViewState();
  return <section className="a2ui-block a2ui-scope">
    <SectionHeading title={props.title || '数据范围'} detail="仅包含当前授权店铺与站点" />
    <div className="a2ui-scope__context"><strong>{scope.storeName || '当前店铺'}</strong><span>{scope.marketplace || '站点未标注'}</span><time>{scope.startDate} 至 {scope.endDate}</time></div>
    {viewState.comparePrevious && scope.previousStartDate ? <div className="a2ui-scope__previous">上期对比：{scope.previousStartDate} 至 {scope.previousEndDate}（等长周期）</div> : null}
    <div className="a2ui-scope__reports">{(scope.reports || []).map((report) => <div key={report.id} className={report.available ? 'is-available' : 'is-unavailable'}><span>{report.label}</span><strong>{report.available ? `${formatValue(report.matchedRowCount, 'integer')} 行匹配` : '未导入'}</strong></div>)}</div>
  </section>;
});

const MetricGroup = createComponentImplementation(MetricGroupApi, ({ props }) => {
  const { viewState } = useChatViewState();
  return <section className="a2ui-block">
    <SectionHeading title={props.title || '核心指标'} detail={viewState.comparePrevious ? '本期与上一等长周期对比' : '由服务端汇总数据计算'} />
    <div className="a2ui-metric-grid">{(props.data || []).map((metric) => <div className="a2ui-metric" key={metric.id}><span>{metric.label}</span><strong>{formatValue(metric.value, metric.format)}</strong>{viewState.comparePrevious && metric.previousValue !== null ? <small>上期 {formatValue(metric.previousValue, metric.format)} · 变化 {formatValue(metric.delta, metric.format)}</small> : null}</div>)}</div>
  </section>;
});

const MetricTable = createComponentImplementation(MetricTableApi, ({ props }) => {
  const data = props.data || { columns: [], rows: [] };
  const { viewState, selectEntity } = useChatViewState();
  const selected = viewState.selectedEntity?.type === data.entityType ? viewState.selectedEntity : null;
  return <section className="a2ui-block a2ui-detail-table">
    <div className="a2ui-section-heading a2ui-section-heading--action"><div><h3>{props.title || data.title || '指标明细'}</h3><span>{selected ? `已联动：${selected.id}` : `显示 ${data.shownRows || data.rows.length} / ${data.totalRows || data.rows.length} 组；点击图表对象可筛选`}</span></div>{selected ? <button type="button" className="a2ui-clear-selection" onClick={() => selectEntity(null)}>清除联动</button> : null}</div>
    <DataTable data={data} />
  </section>;
});

const RecommendationList = createComponentImplementation(RecommendationListApi, ({ props }) => (
  <section className="a2ui-block a2ui-recommendations">
    <SectionHeading title={props.title || '建议列表'} detail="AI 建议，需人工复核后执行" />
    {(props.data || []).length ? <ol>{props.data.map((item) => <li key={item.id}><span>{item.text}</span></li>)}</ol> : <div className="a2ui-empty">本轮没有单独的结构化建议</div>}
  </section>
));

const catalog = createShareScopeCatalog([
  Column, DataScope, MetricGroup, TrendChart, RankingBarChart, CompositionBarChart,
  QuadrantScatterChart, ConversionFunnel, PurchasePathChart, MetricTable, RecommendationList,
]);

class A2uiErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <div className="a2ui-fallback" role="status">结构化视图暂时不可用，已保留上方文字分析。</div>;
    return this.props.children;
  }
}

function Surface({ ui }) {
  const processor = useMemo(() => {
    const next = new MessageProcessor([catalog], undefined, { version: '1.0' });
    next.processMessages(ui.messages);
    return next;
  }, [ui.messages]);
  useEffect(() => () => processor.dispose(), [processor]);
  const surface = processor.model.getSurface(SHARE_SCOPE_SURFACE_ID);
  return surface ? <A2uiSurface surface={surface} /> : <div className="a2ui-fallback">结构化视图缺少可渲染内容，已保留文字分析。</div>;
}

export default function A2uiChatSurface({ ui, messageId, storeId, viewState }) {
  if (!ui || ui.status !== 'ready' || !Array.isArray(ui.messages)) return null;
  return <ChatViewStateProvider messageId={messageId} storeId={storeId} value={viewState}>
    <A2uiErrorBoundary><div className="a2ui-chat-surface"><Surface ui={ui} /></div></A2uiErrorBoundary>
  </ChatViewStateProvider>;
}
