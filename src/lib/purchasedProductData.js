export const PURCHASED_TREND_METRICS = Object.freeze([
  { id: 'sales', label: '销售额', unit: 'currency' },
  { id: 'orders', label: '订单', unit: 'number' },
  { id: 'units', label: '销售量', unit: 'number' },
]);

export const PURCHASED_TREND_COLORS = ['#17202b', '#2a78d6', '#eb6834', '#1baf7a'];

const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const ratio = (numerator, denominator, multiplier = 1) => denominator > 0 ? numerator / denominator * multiplier : null;
const pairKey = (advertisedAsin, purchasedAsin) => `${advertisedAsin}\u0000${purchasedAsin}`;
const hasPurchase = (row) => numeric(row.sales) > 0 || numeric(row.orders) > 0 || numeric(row.units) > 0;

function metrics() {
  return { sales: 0, orders: 0, units: 0, rowCount: 0 };
}

function addMetrics(target, row) {
  target.sales += numeric(row.sales);
  target.orders += numeric(row.orders);
  target.units += numeric(row.units);
  target.rowCount += 1;
  return target;
}

export function preparePurchasedProductData(payload) {
  if (!payload || !Array.isArray(payload.rows)) throw new Error('已购买商品数据格式无效');
  const rows = payload.rows.filter((row) => (
    /^\d{4}-\d{2}-\d{2}$/.test(row.date)
    && String(row.advertisedAsin || '').trim()
    && String(row.purchasedAsin || '').trim()
    && String(row.campaign || '').trim()
  )).map((row) => ({
    ...row,
    advertisedAsin: String(row.advertisedAsin).trim(),
    purchasedAsin: String(row.purchasedAsin).trim(),
    sales: numeric(row.sales),
    orders: numeric(row.orders),
    units: numeric(row.units),
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
    report: payload.report || 'US11 商品推广已购买商品报告',
    sourceSheet: payload.sourceSheet || '',
  };
}

export function filterPurchasedProductRows(rows, startDate, endDate) {
  return rows.filter((row) => row.date >= startDate && row.date <= endDate);
}

export function buildPurchasedProductSnapshot(rows) {
  const positiveRows = rows.filter(hasPurchase);
  const allAdvertisedAsins = new Set(rows.map((row) => row.advertisedAsin));
  const total = metrics();
  const purchasedGroups = new Map();
  const advertisedGroups = new Map();
  const pathGroups = new Map();
  const dailyGroups = new Map();
  const dailyPurchasedGroups = new Map();

  rows.forEach((row) => {
    if (!dailyGroups.has(row.date)) dailyGroups.set(row.date, { date: row.date, metrics: metrics() });
    addMetrics(dailyGroups.get(row.date).metrics, row);
  });

  positiveRows.forEach((row) => {
    addMetrics(total, row);
    if (!purchasedGroups.has(row.purchasedAsin)) {
      purchasedGroups.set(row.purchasedAsin, {
        purchasedAsin: row.purchasedAsin,
        metrics: metrics(),
        advertisedAsins: new Set(),
        campaigns: new Set(),
      });
    }
    const purchased = purchasedGroups.get(row.purchasedAsin);
    addMetrics(purchased.metrics, row);
    purchased.advertisedAsins.add(row.advertisedAsin);
    purchased.campaigns.add(row.campaign);

    if (!advertisedGroups.has(row.advertisedAsin)) {
      advertisedGroups.set(row.advertisedAsin, {
        advertisedAsin: row.advertisedAsin,
        metrics: metrics(),
        purchasedAsins: new Set(),
        campaigns: new Set(),
        skus: new Set(),
      });
    }
    const advertised = advertisedGroups.get(row.advertisedAsin);
    addMetrics(advertised.metrics, row);
    advertised.purchasedAsins.add(row.purchasedAsin);
    advertised.campaigns.add(row.campaign);
    advertised.skus.add(row.advertisedSku);

    const pathId = pairKey(row.advertisedAsin, row.purchasedAsin);
    if (!pathGroups.has(pathId)) {
      pathGroups.set(pathId, {
        id: pathId,
        advertisedAsin: row.advertisedAsin,
        purchasedAsin: row.purchasedAsin,
        sameAsin: row.advertisedAsin === row.purchasedAsin,
        metrics: metrics(),
        campaigns: new Set(),
        adGroups: new Set(),
        targets: new Set(),
        matchTypes: new Set(),
      });
    }
    const path = pathGroups.get(pathId);
    addMetrics(path.metrics, row);
    path.campaigns.add(row.campaign);
    path.adGroups.add(row.adGroup);
    path.targets.add(row.targeting);
    path.matchTypes.add(row.matchType);

    const dailyId = `${row.date}\u0000${row.purchasedAsin}`;
    if (!dailyPurchasedGroups.has(dailyId)) {
      dailyPurchasedGroups.set(dailyId, { date: row.date, purchasedAsin: row.purchasedAsin, metrics: metrics() });
    }
    addMetrics(dailyPurchasedGroups.get(dailyId).metrics, row);
  });

  const paths = Array.from(pathGroups.values()).map((group) => ({
    id: group.id,
    advertisedAsin: group.advertisedAsin,
    purchasedAsin: group.purchasedAsin,
    sameAsin: group.sameAsin,
    ...group.metrics,
    campaignCount: group.campaigns.size,
    adGroupCount: group.adGroups.size,
    targetCount: group.targets.size,
    matchTypes: Array.from(group.matchTypes).sort().join('、'),
    purchasedHasAdvertisingRecord: allAdvertisedAsins.has(group.purchasedAsin),
    pathRole: group.sameAsin ? '同 ASIN 的其他 SKU 归因记录' : '跨 ASIN 承接路径',
    action: '先验证购买 ASIN 的直接投放表现，不直接迁移预算',
    salesShare: ratio(group.metrics.sales, total.sales, 100),
  })).sort((a, b) => b.sales - a.sales || b.orders - a.orders || a.id.localeCompare(b.id));

  const purchased = Array.from(purchasedGroups.values()).map((group) => {
    const directAdvertisingRecord = allAdvertisedAsins.has(group.purchasedAsin);
    const sourceAdvertisedCount = group.advertisedAsins.size;
    return {
      id: group.purchasedAsin,
      purchasedAsin: group.purchasedAsin,
      ...group.metrics,
      sourceAdvertisedCount,
      sourceCampaignCount: group.campaigns.size,
      directAdvertisingRecord,
      role: sourceAdvertisedCount >= 3 ? '承接中心候选' : directAdvertisingRecord ? '承接款 · 待验证' : '被动承接候选',
      salesShare: ratio(group.metrics.sales, total.sales, 100),
    };
  }).sort((a, b) => b.sales - a.sales || b.orders - a.orders || a.purchasedAsin.localeCompare(b.purchasedAsin));

  const advertised = Array.from(advertisedGroups.values()).map((group) => {
    const relatedPaths = paths.filter((path) => path.advertisedAsin === group.advertisedAsin);
    return {
      id: group.advertisedAsin,
      advertisedAsin: group.advertisedAsin,
      ...group.metrics,
      purchasedAsinCount: group.purchasedAsins.size,
      campaignCount: group.campaigns.size,
      skuCount: group.skus.size,
      mainPurchasedAsin: relatedPaths[0]?.purchasedAsin || '—',
      mainPurchasedShare: ratio(relatedPaths[0]?.sales || 0, group.metrics.sales, 100),
      role: group.purchasedAsins.size >= 3 ? '多路径引流入口' : '引流入口候选',
    };
  }).sort((a, b) => b.sales - a.sales || b.orders - a.orders || a.advertisedAsin.localeCompare(b.advertisedAsin));

  const daily = Array.from(dailyGroups.values()).map((group) => ({ date: group.date, ...group.metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const dailyPurchased = Array.from(dailyPurchasedGroups.values()).map((group) => ({
    date: group.date,
    purchasedAsin: group.purchasedAsin,
    ...group.metrics,
  })).sort((a, b) => a.date.localeCompare(b.date) || a.purchasedAsin.localeCompare(b.purchasedAsin));

  return {
    summary: {
      ...total,
      sourceRowCount: rows.length,
      positiveRowCount: positiveRows.length,
      zeroRowCount: rows.length - positiveRows.length,
      campaignCount: new Set(positiveRows.map((row) => row.campaign)).size,
      advertisedAsinCount: advertised.length,
      purchasedAsinCount: purchased.length,
      pathCount: paths.length,
      allPositiveRowsAreCrossAsin: positiveRows.every((row) => row.advertisedAsin !== row.purchasedAsin),
    },
    purchased,
    advertised,
    paths,
    daily,
    dailyPurchased,
    topPurchasedAsins: purchased.slice(0, 3).map((item) => item.purchasedAsin),
  };
}

export function buildPurchasedProductTrend(snapshot, dates, metric) {
  const dailyLookup = new Map(snapshot.daily.map((row) => [row.date, row]));
  const purchasedLookup = new Map(snapshot.dailyPurchased.map((row) => [`${row.date}\u0000${row.purchasedAsin}`, row]));
  const series = [{
    name: '全部已购买商品',
    color: PURCHASED_TREND_COLORS[0],
    data: dates.map((date) => dailyLookup.get(date)?.[metric] ?? null),
  }, ...snapshot.topPurchasedAsins.map((asin, index) => ({
    name: asin,
    color: PURCHASED_TREND_COLORS[index + 1],
    data: dates.map((date) => purchasedLookup.get(`${date}\u0000${asin}`)?.[metric] ?? null),
  }))];
  return { dates, series };
}

export function formatPurchasedMetric(value, unit) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (unit === 'currency') return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return Math.round(value).toLocaleString('zh-CN');
}
