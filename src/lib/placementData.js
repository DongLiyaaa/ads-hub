export const PLACEMENTS = Object.freeze([
  { id: 'topOfSearch', label: '搜索首页顶部', shortLabel: '搜索顶部', color: '#2a78d6' },
  { id: 'restOfSearch', label: '搜索结果其余位置', shortLabel: '其余搜索', color: '#eb6834' },
  { id: 'productPages', label: '商品页面', shortLabel: '商品页面', color: '#1baf7a' },
]);

export const PLACEMENT_MAP = new Map(PLACEMENTS.map((placement) => [placement.id, placement]));

export const TREND_METRICS = Object.freeze([
  { id: 'acos', label: 'ACOS', unit: 'percent' },
  { id: 'spend', label: '花费', unit: 'currency' },
  { id: 'sales', label: '销售额', unit: 'currency' },
  { id: 'orders', label: '订单', unit: 'number' },
  { id: 'ctr', label: 'CTR', unit: 'percent' },
  { id: 'cvr', label: 'CVR', unit: 'percent' },
  { id: 'cpc', label: 'CPC', unit: 'currency' },
  { id: 'roas', label: 'ROAS', unit: 'multiple' },
]);

const ratio = (numerator, denominator, multiplier = 1) => denominator > 0 ? numerator / denominator * multiplier : null;
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const placementName = (id) => PLACEMENT_MAP.get(id)?.label || id;

function newMetrics() {
  return {
    impressions: 0,
    clicks: 0,
    spend: 0,
    sales: 0,
    orders: 0,
    units: 0,
    rowCount: 0,
    dates: new Set(),
  };
}

function addMetrics(target, row) {
  target.impressions += numeric(row.impressions);
  target.clicks += numeric(row.clicks);
  target.spend += numeric(row.spend);
  target.sales += numeric(row.sales);
  target.orders += numeric(row.orders);
  target.units += numeric(row.units);
  target.rowCount += 1;
  if (row.date) target.dates.add(row.date);
  return target;
}

function finalizeMetrics(accumulator) {
  return {
    impressions: accumulator.impressions,
    clicks: accumulator.clicks,
    spend: accumulator.spend,
    sales: accumulator.sales,
    orders: accumulator.orders,
    units: accumulator.units,
    rowCount: accumulator.rowCount,
    activeDays: accumulator.dates.size,
    dateList: Array.from(accumulator.dates).sort(),
    ctr: ratio(accumulator.clicks, accumulator.impressions, 100),
    cpc: ratio(accumulator.spend, accumulator.clicks),
    cvr: ratio(accumulator.orders, accumulator.clicks, 100),
    cpo: ratio(accumulator.spend, accumulator.orders),
    acos: ratio(accumulator.spend, accumulator.sales, 100),
    roas: ratio(accumulator.sales, accumulator.spend),
  };
}

function campaignKey(row) {
  return `${row.portfolio}\u0000${row.campaign}`;
}

export function preparePlacementData(payload) {
  if (!payload || !Array.isArray(payload.rows)) throw new Error('广告位数据格式无效');
  const rows = payload.rows.filter((row) => (
    /^\d{4}-\d{2}-\d{2}$/.test(row.date)
    && PLACEMENT_MAP.has(row.placement)
    && String(row.campaign || '').trim()
    && String(row.portfolio || '').trim()
  )).map((row) => ({
    ...row,
    portfolio: String(row.portfolio).trim(),
    campaign: String(row.campaign).trim(),
    biddingStrategy: String(row.biddingStrategy || '未标注').trim(),
  }));
  const dates = Array.from(new Set(rows.map((row) => row.date))).sort();
  return {
    rows,
    dates,
    minDate: dates[0] || null,
    maxDate: dates.at(-1) || null,
    totalRows: payload.totalRows ?? payload.rows.length,
    skippedRows: (payload.skippedRows || 0) + payload.rows.length - rows.length,
    duplicateRows: payload.duplicateRows || 0,
    report: payload.report || 'US11 商品推广广告位报告',
  };
}

export function filterPlacementRows(rows, startDate, endDate) {
  return rows.filter((row) => row.date >= startDate && row.date <= endDate);
}

export function summarizePlacements(rows) {
  const total = newMetrics();
  const groups = new Map(PLACEMENTS.map((placement) => [placement.id, newMetrics()]));
  rows.forEach((row) => {
    addMetrics(total, row);
    addMetrics(groups.get(row.placement), row);
  });

  const summary = {
    ...finalizeMetrics(total),
    campaignCount: new Set(rows.map(campaignKey)).size,
    portfolioCount: new Set(rows.map((row) => row.portfolio)).size,
  };
  const placements = PLACEMENTS.map((placement) => ({
    ...placement,
    ...finalizeMetrics(groups.get(placement.id)),
    placement: placement.id,
    spendShare: ratio(groups.get(placement.id).spend, total.spend, 100),
    salesShare: ratio(groups.get(placement.id).sales, total.sales, 100),
    orderShare: ratio(groups.get(placement.id).orders, total.orders, 100),
    impressionShare: ratio(groups.get(placement.id).impressions, total.impressions, 100),
  }));
  return { summary, placements };
}

export function buildCampaignPlacementRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const id = `${campaignKey(row)}\u0000${row.placement}`;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        campaignKey: campaignKey(row),
        portfolio: row.portfolio,
        campaign: row.campaign,
        placement: row.placement,
        placementLabel: placementName(row.placement),
        strategies: new Set(),
        metrics: newMetrics(),
      });
    }
    const group = groups.get(id);
    group.strategies.add(row.biddingStrategy);
    addMetrics(group.metrics, row);
  });
  return Array.from(groups.values()).map((group) => ({
    id: group.id,
    campaignKey: group.campaignKey,
    portfolio: group.portfolio,
    campaign: group.campaign,
    placement: group.placement,
    placementLabel: group.placementLabel,
    biddingStrategy: Array.from(group.strategies).sort().join('、'),
    ...finalizeMetrics(group.metrics),
  })).sort((a, b) => b.spend - a.spend || a.campaign.localeCompare(b.campaign, 'zh-CN'));
}

export function buildCampaignHierarchy(details) {
  const groups = new Map();
  details.forEach((detail) => {
    if (!groups.has(detail.campaignKey)) {
      groups.set(detail.campaignKey, {
        campaignKey: detail.campaignKey,
        portfolio: detail.portfolio,
        campaign: detail.campaign,
        strategies: new Set(),
        dates: new Set(),
        metrics: newMetrics(),
        placements: [],
      });
    }
    const group = groups.get(detail.campaignKey);
    detail.biddingStrategy.split('、').filter(Boolean).forEach((strategy) => group.strategies.add(strategy));
    detail.dateList.forEach((date) => group.dates.add(date));
    addMetrics(group.metrics, detail);
    group.placements.push(detail);
  });
  return Array.from(groups.values()).map((group) => ({
    campaignKey: group.campaignKey,
    portfolio: group.portfolio,
    campaign: group.campaign,
    biddingStrategy: Array.from(group.strategies).sort().join('、'),
    ...finalizeMetrics({ ...group.metrics, dates: group.dates }),
    placements: group.placements.sort((a, b) => (
      PLACEMENTS.findIndex((item) => item.id === a.placement) - PLACEMENTS.findIndex((item) => item.id === b.placement)
    )),
  }));
}

export function buildStrategyPlacementRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const id = `${row.biddingStrategy}\u0000${row.placement}`;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        biddingStrategy: row.biddingStrategy,
        placement: row.placement,
        placementLabel: placementName(row.placement),
        campaigns: new Set(),
        metrics: newMetrics(),
      });
    }
    groups.get(id).campaigns.add(campaignKey(row));
    addMetrics(groups.get(id).metrics, row);
  });
  return Array.from(groups.values()).map((group) => ({
    id: group.id,
    biddingStrategy: group.biddingStrategy,
    placement: group.placement,
    placementLabel: group.placementLabel,
    campaignCount: group.campaigns.size,
    ...finalizeMetrics(group.metrics),
  })).sort((a, b) => a.biddingStrategy.localeCompare(b.biddingStrategy, 'zh-CN')
    || PLACEMENTS.findIndex((item) => item.id === a.placement) - PLACEMENTS.findIndex((item) => item.id === b.placement));
}

export function buildDailyPlacementRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const id = `${row.date}\u0000${row.placement}`;
    if (!groups.has(id)) groups.set(id, { date: row.date, placement: row.placement, metrics: newMetrics() });
    addMetrics(groups.get(id).metrics, row);
  });
  return Array.from(groups.values()).map((group) => ({
    date: group.date,
    placement: group.placement,
    placementLabel: placementName(group.placement),
    ...finalizeMetrics(group.metrics),
  })).sort((a, b) => a.date.localeCompare(b.date)
    || PLACEMENTS.findIndex((item) => item.id === a.placement) - PLACEMENTS.findIndex((item) => item.id === b.placement));
}

export function buildPlacementTrend(dailyRows, dates, metric) {
  const lookup = new Map(dailyRows.map((row) => [`${row.date}\u0000${row.placement}`, row]));
  return {
    dates,
    series: PLACEMENTS.map((placement) => ({
      name: placement.label,
      placement: placement.id,
      color: placement.color,
      data: dates.map((date) => lookup.get(`${date}\u0000${placement.id}`)?.[metric] ?? null),
    })),
  };
}

export function formatPlacementMetric(value, unit) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (unit === 'percent') return `${value.toFixed(2)}%`;
  if (unit === 'currency') return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (unit === 'multiple') return `${value.toFixed(2)}×`;
  return Math.round(value).toLocaleString('zh-CN');
}
