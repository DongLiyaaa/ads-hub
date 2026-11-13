import {
  buildCampaignPlacementRows,
  buildDailyPlacementRows,
  buildStrategyPlacementRows,
  summarizePlacements,
} from './placementData.js';

const MIN_CLICKS = 30;
const round = (value) => value == null ? null : Number(value.toFixed(4));

export function getRiskReasons(item, summary) {
  if (item.spend <= 0 || item.clicks < MIN_CLICKS) return [];
  const reasons = [];
  if (item.orders === 0) reasons.push(`点击≥${MIN_CLICKS}次且无订单`);
  if (item.acos != null && summary.acos != null && item.acos > summary.acos * 1.25) reasons.push('ACOS高于整体25%以上');
  if (item.cvr != null && summary.cvr != null && item.cvr < summary.cvr * 0.75) reasons.push('CVR低于整体25%以上');
  if (item.cpc != null && summary.cpc != null && item.cpc > summary.cpc * 1.25) reasons.push('CPC高于整体25%以上');
  return reasons;
}

export function getOpportunityReasons(item, summary) {
  if (item.spend <= 0 || item.clicks < MIN_CLICKS || item.orders <= 0) return [];
  const reasons = [];
  if (
    item.acos != null && summary.acos != null && item.acos < summary.acos
    && item.cvr != null && summary.cvr != null && item.cvr >= summary.cvr
  ) reasons.push('ACOS低于整体且CVR不低于整体');
  if (item.cpo != null && summary.cpo != null && item.cpo <= summary.cpo * 0.8) reasons.push('CPO低于整体20%以上');
  return reasons;
}

function rankCandidates(items, summary, type, limit) {
  const getReasons = type === 'risk' ? getRiskReasons : getOpportunityReasons;
  return items.map((item) => ({ ...item, reasons: getReasons(item, summary) }))
    .filter((item) => item.reasons.length)
    .sort((a, b) => type === 'risk'
      ? b.spend - a.spend || a.campaign.localeCompare(b.campaign, 'zh-CN')
      : b.sales - a.sales || b.orders - a.orders || a.campaign.localeCompare(b.campaign, 'zh-CN'))
    .slice(0, limit);
}

export function buildPlacementAnalysisSnapshot(rows) {
  const { summary, placements } = summarizePlacements(rows);
  const daily = buildDailyPlacementRows(rows);
  const campaigns = buildCampaignPlacementRows(rows);
  const strategies = buildStrategyPlacementRows(rows);
  return {
    summary,
    placements,
    daily,
    campaigns,
    strategies,
    opportunities: rankCandidates(campaigns, summary, 'opportunity', 10),
    risks: rankCandidates(campaigns, summary, 'risk', 50),
  };
}

export function createPlacementModelPayload(snapshot, range, datasetId) {
  const placementColumns = ['placementLabel', 'impressions', 'clicks', 'spend', 'sales', 'orders', 'units', 'spendShare', 'salesShare', 'orderShare', 'ctr', 'cpc', 'cvr', 'cpo', 'acos', 'roas'];
  const dailyColumns = ['date', 'placementLabel', 'impressions', 'clicks', 'spend', 'sales', 'orders', 'ctr', 'cpc', 'cvr', 'cpo', 'acos', 'roas'];
  const campaignColumns = ['portfolio', 'campaign', 'placementLabel', 'biddingStrategy', 'impressions', 'clicks', 'spend', 'sales', 'orders', 'ctr', 'cpc', 'cvr', 'cpo', 'acos', 'roas', 'activeDays', 'riskReasons', 'opportunityReasons'];
  const candidateColumns = ['portfolio', 'campaign', 'placementLabel', 'biddingStrategy', 'impressions', 'clicks', 'spend', 'sales', 'orders', 'ctr', 'cpc', 'cvr', 'cpo', 'acos', 'roas', 'activeDays', 'reasons'];
  const strategyColumns = ['biddingStrategy', 'placementLabel', 'campaignCount', 'rowCount', 'spend', 'sales', 'orders', 'cpc', 'cvr', 'cpo', 'acos', 'roas'];
  const roundMetrics = (item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [
    key,
    typeof value === 'number' ? round(value) : value,
  ]));
  const toRows = (items, columns) => items.map((item) => columns.map((column) => item[column] ?? null));
  const toObjects = (items, columns) => items.map((item) => Object.fromEntries(columns.map((column) => [column, item[column] ?? null])));
  const campaigns = snapshot.campaigns.map((item) => ({
    ...roundMetrics(item),
    riskReasons: getRiskReasons(item, snapshot.summary).join('；'),
    opportunityReasons: getOpportunityReasons(item, snapshot.summary).join('；'),
  }));

  return {
    reportType: 'placement',
    datasetId,
    report: 'US11 商品推广广告位报告',
    range,
    coverage: {
      days: new Set(snapshot.daily.map((row) => row.date)).size,
      placements: snapshot.placements.length,
      campaigns: snapshot.summary.campaignCount,
      campaignPlacementRows: snapshot.campaigns.length,
      note: '包含当前时间范围内全部广告位、全部广告活动与广告位组合、全部每日趋势；不是表格当前页采样。',
    },
    summary: roundMetrics(snapshot.summary),
    placements: snapshot.placements.map(roundMetrics),
    daily: snapshot.daily.map(roundMetrics),
    opportunities: toObjects(snapshot.opportunities.map(roundMetrics), candidateColumns),
    risks: toObjects(snapshot.risks.map(roundMetrics), candidateColumns),
    allPlacements: { columns: placementColumns, rows: toRows(snapshot.placements.map(roundMetrics), placementColumns) },
    allDaily: { columns: dailyColumns, rows: toRows(snapshot.daily.map(roundMetrics), dailyColumns) },
    allCampaigns: { columns: campaignColumns, rows: toRows(campaigns, campaignColumns) },
    allStrategies: { columns: strategyColumns, rows: toRows(snapshot.strategies.map(roundMetrics), strategyColumns) },
    methodology: {
      attribution: '订单、销售额和销售量均为7天归因；金额单位USD，比率字段单位为%。',
      rates: '所有比率均由汇总基础字段重算：CTR=点击/展示，CPC=花费/点击，CVR=订单/点击，CPO=花费/订单，ACOS=花费/销售额，ROAS=销售额/花费。',
      candidates: `仅纳入花费>0且点击≥${MIN_CLICKS}次的广告活动×广告位。风险规则为无订单、ACOS高于整体25%、CVR低于整体25%或CPC高于整体25%；扩量规则为ACOS低于整体且CVR不低于整体，或CPO低于整体20%。`,
      limitation: '候选仅表示相对表现，不代表盈利。缺少毛利、目标ACOS、预算、当前广告位溢价、关键词、匹配模式和ASIN，不得虚构这些维度或直接给出自动调价指令。',
    },
  };
}
