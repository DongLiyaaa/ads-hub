const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[$,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseReportDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match || !MONTHS[match[1]]) return null;
  return `${match[3]}-${MONTHS[match[1]]}-${String(match[2]).padStart(2, '0')}`;
}

function addMetrics(target, source) {
  target.shareWeighted += source.share * source.impressions;
  target.shareSum += source.share;
  target.rankWeighted += source.rank * source.impressions;
  target.impressions += source.impressions;
  target.clicks += source.clicks;
  target.orders += source.orders;
  target.cost += source.cost;
  target.sales += source.sales;
  target.count += 1;
  return target;
}

function newAccumulator(name) {
  return {
    keyword: name,
    shareWeighted: 0,
    shareSum: 0,
    rankWeighted: 0,
    impressions: 0,
    clicks: 0,
    orders: 0,
    cost: 0,
    sales: 0,
    count: 0,
  };
}

function finalizeAccumulator(item) {
  const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : null;
  return {
    keyword: item.keyword,
    share: item.count === 0 ? null : item.impressions > 0 ? item.shareWeighted / item.impressions : item.shareSum / item.count,
    averageRank: ratio(item.rankWeighted, item.impressions),
    impressions: item.impressions,
    clicks: item.clicks,
    orders: item.orders,
    cost: item.cost,
    sales: item.sales,
    ctr: ratio(item.clicks * 100, item.impressions),
    cpc: ratio(item.cost, item.clicks),
    conversionRate: ratio(item.orders * 100, item.clicks),
    acos: ratio(item.cost * 100, item.sales),
    roas: ratio(item.sales, item.cost),
    activeDays: item.count,
  };
}

export function prepareData(rows) {
  const dailyKeywords = new Map();
  const campaignRows = [];
  let skippedRows = 0;

  rows.forEach((row) => {
    const date = parseReportDate(row['日期']);
    const keyword = String(row['客户搜索词'] || '').trim();
    if (!date || !keyword) {
      skippedRows += 1;
      return;
    }

    const key = `${date}\u0000${keyword}`;
    const source = {
      impressions: parseNumber(row['展示量']),
      clicks: parseNumber(row['点击量']),
      orders: parseNumber(row['7天总订单数(#)']),
      cost: parseNumber(row['花费']),
      sales: parseNumber(row['7天总销售额']),
    };
    campaignRows.push({
      date,
      keyword,
      campaign: String(row['广告活动名称'] || '').trim() || '未命名广告活动',
      ...source,
    });
    const existing = dailyKeywords.get(key);
    if (existing) {
      existing.impressions += source.impressions;
      existing.clicks += source.clicks;
      existing.orders += source.orders;
      existing.cost += source.cost;
      existing.sales += source.sales;
      return;
    }

    dailyKeywords.set(key, {
      date,
      keyword,
      share: parseNumber(row['搜索词展示份额']),
      rank: parseNumber(row['搜索词展示量排名']),
      ...source,
    });
  });

  const entries = Array.from(dailyKeywords.values()).sort((a, b) =>
    a.date.localeCompare(b.date) || a.keyword.localeCompare(b.keyword),
  );
  const dates = Array.from(new Set(entries.map((entry) => entry.date))).sort();
  const { keywords } = aggregateEntries(entries);
  const topKeywords = [...keywords]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map((item) => item.keyword);

  return {
    entries,
    campaignRows,
    dates,
    minDate: dates[0] || null,
    maxDate: dates.at(-1) || null,
    totalRows: rows.length,
    skippedRows,
    duplicateRows: rows.length - skippedRows - entries.length,
    topKeywords,
  };
}

export function aggregateEntries(entries) {
  const total = newAccumulator('全部搜索词');
  const keywordMap = new Map();
  const uniqueKeywords = new Set();

  entries.forEach((entry) => {
    addMetrics(total, entry);
    uniqueKeywords.add(entry.keyword);
    if (!keywordMap.has(entry.keyword)) keywordMap.set(entry.keyword, newAccumulator(entry.keyword));
    addMetrics(keywordMap.get(entry.keyword), entry);
  });

  return {
    summary: { ...finalizeAccumulator(total), keywordCount: uniqueKeywords.size },
    keywords: Array.from(keywordMap.values()).map(finalizeAccumulator),
  };
}

export function filterEntriesByDate(entries, startDate, endDate) {
  return entries.filter((entry) => entry.date >= startDate && entry.date <= endDate);
}

export function buildOverallTrend(entries) {
  const byDate = new Map();
  entries.forEach((entry) => {
    if (!byDate.has(entry.date)) byDate.set(entry.date, newAccumulator(entry.date));
    addMetrics(byDate.get(entry.date), entry);
  });
  const points = Array.from(byDate.values()).map(finalizeAccumulator);
  return {
    dates: points.map((point) => point.keyword),
    series: [{ name: '整体加权份额', data: points.map((point) => Number(point.share.toFixed(4))) }],
  };
}

export function buildKeywordTrend(entries, dates, topKeywords) {
  const lookup = new Map(entries.map((entry) => [`${entry.date}\u0000${entry.keyword}`, entry]));
  return {
    dates,
    series: topKeywords.map((keyword) => ({
      name: keyword,
      data: dates.map((date) => {
        const entry = lookup.get(`${date}\u0000${keyword}`);
        return entry ? Number(entry.share.toFixed(4)) : null;
      }),
    })),
  };
}

export function shiftDate(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits }).format(value || 0);
}

export function formatCompact(value) {
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatPercent(value, digits = 2) {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}%`;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);
}
