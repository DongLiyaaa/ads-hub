import { buildKeywordTrend, buildOverallTrend } from './data.js';

export const INEFFICIENCY_WEIGHTS = Object.freeze({ cost: 50, conversionRate: 30, acos: 20 });

const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : null;
const round = (value) => value == null ? null : Number(value.toFixed(4));

function summarizeRows(rows, nameKey) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row[nameKey];
    if (!groups.has(name)) {
      groups.set(name, {
        [nameKey]: name,
        impressions: 0,
        clicks: 0,
        orders: 0,
        cost: 0,
        sales: 0,
        dates: new Set(),
        keywords: new Set(),
      });
    }
    const group = groups.get(name);
    group.impressions += row.impressions;
    group.clicks += row.clicks;
    group.orders += row.orders;
    group.cost += row.cost;
    group.sales += row.sales;
    group.dates.add(row.date);
    group.keywords.add(row.keyword);
  });

  return Array.from(groups.values()).map((group) => ({
    [nameKey]: group[nameKey],
    impressions: group.impressions,
    clicks: group.clicks,
    orders: group.orders,
    cost: group.cost,
    sales: group.sales,
    ctr: ratio(group.clicks * 100, group.impressions),
    conversionRate: ratio(group.orders * 100, group.clicks),
    acos: ratio(group.cost * 100, group.sales),
    roas: ratio(group.sales, group.cost),
    activeDays: group.dates.size,
    keywordCount: group.keywords.size,
  }));
}

export function aggregateCampaigns(campaignRows) {
  return summarizeRows(campaignRows, 'campaign');
}

export function rankByInefficiency(items, nameKey = 'keyword', limit = 50) {
  const eligible = items.filter((item) => item.cost > 0);
  const maxCost = Math.max(0, ...eligible.map((item) => item.cost));
  const maxConversionRate = Math.max(0, ...eligible.map((item) => item.conversionRate || 0));
  const maxAcos = Math.max(0, ...eligible.map((item) => item.acos || 0));

  return eligible.map((item) => {
    const costScore = maxCost > 0 ? item.cost / maxCost * INEFFICIENCY_WEIGHTS.cost : 0;
    const conversionRateScore = maxConversionRate > 0
      ? (maxConversionRate - (item.conversionRate || 0)) / maxConversionRate * INEFFICIENCY_WEIGHTS.conversionRate
      : INEFFICIENCY_WEIGHTS.conversionRate;
    const acosScore = item.acos == null
      ? INEFFICIENCY_WEIGHTS.acos
      : maxAcos > 0 ? item.acos / maxAcos * INEFFICIENCY_WEIGHTS.acos : 0;
    const inefficiencyScore = round(costScore + conversionRateScore + acosScore);

    return {
      ...item,
      inefficiencyScore,
      scoreParts: {
        cost: round(costScore),
        conversionRate: round(conversionRateScore),
        acos: round(acosScore),
      },
    };
  }).sort((a, b) =>
    b.inefficiencyScore - a.inefficiencyScore
    || b.cost - a.cost
    || String(a[nameKey]).localeCompare(String(b[nameKey])),
  ).slice(0, limit);
}

export function selectCoreKeywords(keywords, limit = 10) {
  return keywords
    .filter((item) => item.sales > 0)
    .sort((a, b) => b.sales - a.sales || b.orders - a.orders || a.cost - b.cost || a.keyword.localeCompare(b.keyword))
    .slice(0, limit);
}

export function buildDailyMetrics(entries) {
  const rows = summarizeRows(entries.map((entry) => ({ ...entry, campaign: entry.date })), 'campaign');
  const overall = buildOverallTrend(entries);
  const shareByDate = new Map(overall.dates.map((date, index) => [date, overall.series[0].data[index]]));
  return rows
    .sort((a, b) => a.campaign.localeCompare(b.campaign))
    .map((row) => ({
      date: row.campaign,
      share: shareByDate.get(row.campaign) ?? null,
      impressions: row.impressions,
      clicks: row.clicks,
      orders: row.orders,
      cost: round(row.cost),
      sales: round(row.sales),
      ctr: round(row.ctr),
      conversionRate: round(row.conversionRate),
      acos: round(row.acos),
    }));
}

export function buildAnalysisSnapshot({ entries, campaignRows, summary, keywords, dates, topKeywords }) {
  const campaigns = aggregateCampaigns(campaignRows);
  const worstKeywords = rankByInefficiency(keywords, 'keyword', 50);
  const worstCampaigns = rankByInefficiency(campaigns, 'campaign', 5);
  const keywordScores = new Map(worstKeywords.map((item) => [item.keyword, item.inefficiencyScore]));

  return {
    summary,
    daily: buildDailyMetrics(entries),
    keywordTrend: buildKeywordTrend(entries, dates, topKeywords),
    wordCloud: [...keywords]
      .sort((a, b) => b.impressions - a.impressions || a.keyword.localeCompare(b.keyword))
      .slice(0, 100)
      .map((item) => ({ keyword: item.keyword, impressions: item.impressions, clicks: item.clicks, orders: item.orders })),
    coreKeywords: selectCoreKeywords(keywords),
    worstCampaigns,
    worstKeywords,
    keywords: keywords.map((item) => ({ ...item, inefficiencyScore: keywordScores.get(item.keyword) ?? null })),
    campaigns,
  };
}

export function createModelPayload(snapshot, range, datasetId) {
  const metricColumns = ['keyword', 'impressions', 'clicks', 'orders', 'cost', 'sales', 'share', 'ctr', 'conversionRate', 'acos', 'inefficiencyScore'];
  const campaignColumns = ['campaign', 'impressions', 'clicks', 'orders', 'cost', 'sales', 'ctr', 'conversionRate', 'acos', 'activeDays', 'keywordCount', 'inefficiencyScore'];
  const toRows = (items, columns) => items.map((item) => columns.map((column) => item[column] ?? null));
  const roundMetrics = (item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'number' ? round(value) : value]));

  return {
    reportType: 'search-share',
    datasetId,
    report: 'US1 商品推广搜索词展示量份额',
    range,
    coverage: {
      days: snapshot.daily.length,
      keywords: snapshot.keywords.length,
      campaigns: snapshot.campaigns.length,
      wordCloudWords: snapshot.wordCloud.length,
      note: '包含当前时间范围内全部关键词、全部广告活动、全部每日趋势；不是表格当前页采样。',
    },
    summary: roundMetrics(snapshot.summary),
    daily: snapshot.daily,
    topKeywordTrend: snapshot.keywordTrend,
    wordCloud: snapshot.wordCloud,
    coreKeywords: snapshot.coreKeywords.map(roundMetrics),
    worstCampaigns: snapshot.worstCampaigns.map(roundMetrics),
    worstKeywords: snapshot.worstKeywords.map(roundMetrics),
    allKeywords: { columns: metricColumns, rows: toRows(snapshot.keywords.map(roundMetrics), metricColumns) },
    allCampaigns: { columns: campaignColumns, rows: toRows(snapshot.campaigns.map(roundMetrics), campaignColumns) },
    methodology: {
      share: '同一日期和搜索词的展示份额只计一次，时间范围内按展示量加权。',
      rates: 'CTR=点击/展示，CVR=订单/点击，ACOS=花费/销售额；百分比字段单位为%。',
      coreKeywords: '销售额最高的10个关键词，仅用于确定核心词清单。',
      inefficiency: '仅纳入花费>0的项目。花费得分=花费/集合最高花费*50；CVR得分=(集合最高CVR-当前CVR)/集合最高CVR*30，无点击计30；ACOS得分=ACOS/集合最高有限ACOS*20，无销售计20。总分越高越差。',
    },
  };
}
