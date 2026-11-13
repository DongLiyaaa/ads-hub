const round = (value) => value == null ? null : Number(value.toFixed(4));
const roundMetrics = (item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'number' ? round(value) : value]));
const toRows = (items, columns) => items.map((item) => columns.map((column) => item[column] ?? null));

export function createPurchasedProductModelPayload(snapshot, range, datasetId) {
  const purchasedColumns = ['purchasedAsin', 'sales', 'orders', 'units', 'salesShare', 'sourceAdvertisedCount', 'sourceCampaignCount', 'directAdvertisingRecord', 'role'];
  const advertisedColumns = ['advertisedAsin', 'sales', 'orders', 'units', 'purchasedAsinCount', 'campaignCount', 'skuCount', 'mainPurchasedAsin', 'mainPurchasedShare', 'role'];
  const pathColumns = ['advertisedAsin', 'purchasedAsin', 'sameAsin', 'sales', 'orders', 'units', 'salesShare', 'campaignCount', 'adGroupCount', 'targetCount', 'matchTypes', 'purchasedHasAdvertisingRecord', 'pathRole', 'action'];
  const dailyColumns = ['date', 'sales', 'orders', 'units'];
  const dailyPurchasedColumns = ['date', 'purchasedAsin', 'sales', 'orders', 'units'];
  const topAsins = new Set(snapshot.topPurchasedAsins);

  return {
    reportType: 'purchased-product',
    datasetId,
    report: 'US11 商品推广已购买商品报告',
    range,
    coverage: {
      days: snapshot.daily.length,
      sourceRows: snapshot.summary.sourceRowCount,
      positiveRows: snapshot.summary.positiveRowCount,
      advertisedAsins: snapshot.summary.advertisedAsinCount,
      purchasedAsins: snapshot.summary.purchasedAsinCount,
      paths: snapshot.summary.pathCount,
      note: '包含当前时间范围内全部已购买ASIN、全部广告投放ASIN、全部购买路径和每日趋势；不是表格当前页采样。',
    },
    summary: roundMetrics(snapshot.summary),
    daily: snapshot.daily,
    topPurchased: snapshot.purchased.slice(0, 10).map(roundMetrics),
    topAdvertised: snapshot.advertised.slice(0, 10).map(roundMetrics),
    allPurchased: { columns: purchasedColumns, rows: toRows(snapshot.purchased.map(roundMetrics), purchasedColumns) },
    allAdvertised: { columns: advertisedColumns, rows: toRows(snapshot.advertised.map(roundMetrics), advertisedColumns) },
    allPaths: { columns: pathColumns, rows: toRows(snapshot.paths.map(roundMetrics), pathColumns) },
    allDaily: { columns: dailyColumns, rows: toRows(snapshot.daily, dailyColumns) },
    topDailyPurchased: { columns: dailyPurchasedColumns, rows: toRows(snapshot.dailyPurchased.filter((row) => topAsins.has(row.purchasedAsin)), dailyPurchasedColumns) },
    methodology: {
      attribution: '销售额、订单和销售量均为源报表的7天内其他SKU归因指标，金额单位USD，占比字段单位为%。',
      calculation: 'Purchased ASIN销售占比=该购买ASIN销售额/当前范围其他SKU销售额；广告ASIN引流结果按投放ASIN汇总；路径按广告ASIN→购买ASIN汇总。',
      scope: '源报表非零记录全部为广告ASIN≠已购买ASIN，但字段本身是其他SKU口径，不能据此推断账户整体Same-ASIN或Cross-ASIN占比。',
      limitation: '缺少Spend、Clicks、Impressions、Purchased SKU、父子ASIN映射、利润、库存和购买ASIN直接投放效率，不计算ACOS/CPO，不强判同父体，不将承接候选直接等同于适合投流，不自动迁移预算。',
    },
  };
}
