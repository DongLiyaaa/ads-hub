"""Convert an Amazon SP placement XLSX report into normalized JSON.

Usage: python3 -I scripts/prepare-placement-data.py input.xlsx data/local/placement-report.json
Requires openpyxl. No source workbook is copied into the web application.
"""

import json
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

HEADERS = [
    "日期", "广告组合名称", "货币", "广告活动名称", "竞价策略", "放置",
    "展示量", "点击量", "花费", "7天总销售额", "7天总订单数(#)", "7天总销售量(#)",
]
PLACEMENTS = {
    "亚马逊上第一个页面的热门搜索": "topOfSearch",
    "亚马逊上搜索结果的其余位置": "restOfSearch",
    "亚马逊上的商品页面": "productPages",
}
METRIC_FIELDS = {
    "展示量": "impressions",
    "点击量": "clicks",
    "花费": "spend",
    "7天总销售额": "sales",
    "7天总订单数(#)": "orders",
    "7天总销售量(#)": "units",
}


def iso_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raise ValueError(f"无法识别日期：{value!r}")


def number(value):
    if value is None or value == "":
        return 0
    result = float(value)
    return int(result) if result.is_integer() else result


def main(source, destination):
    workbook = load_workbook(source, read_only=False, data_only=True)
    sheet = workbook.active
    values = sheet.iter_rows(values_only=True)
    headers = list(next(values))
    missing = [field for field in HEADERS if field not in headers]
    if missing:
        raise ValueError(f"缺少必要字段：{', '.join(missing)}")
    indexes = {field: headers.index(field) for field in HEADERS}

    rows = []
    grain_counts = Counter()
    skipped_rows = 0
    for source_row in values:
        if not any(value is not None for value in source_row):
            continue
        try:
            row_date = iso_date(source_row[indexes["日期"]])
            placement_label = str(source_row[indexes["放置"]] or "").strip()
            placement = PLACEMENTS[placement_label]
            portfolio = str(source_row[indexes["广告组合名称"]] or "").strip()
            campaign = str(source_row[indexes["广告活动名称"]] or "").strip()
            if not portfolio or not campaign:
                raise ValueError("广告组合或广告活动为空")
        except (ValueError, KeyError) as error:
            skipped_rows += 1
            print(f"跳过第 {len(rows) + skipped_rows + 1} 行：{error}", file=sys.stderr)
            continue

        grain_counts[(row_date, portfolio, campaign, placement)] += 1
        row = {
            "date": row_date,
            "portfolio": portfolio,
            "campaign": campaign,
            "biddingStrategy": str(source_row[indexes["竞价策略"]] or "未标注").strip(),
            "placement": placement,
            "currency": str(source_row[indexes["货币"]] or "USD").strip(),
        }
        for source_field, target_field in METRIC_FIELDS.items():
            row[target_field] = number(source_row[indexes[source_field]])
        rows.append(row)

    if not rows:
        raise ValueError("没有可用的广告位数据")
    currencies = sorted({row["currency"] for row in rows})
    if currencies != ["USD"]:
        raise ValueError(f"当前看板仅支持单一 USD 币种，实际为：{currencies}")

    rows.sort(key=lambda row: (row["date"], row["portfolio"], row["campaign"], row["placement"]))
    payload = {
        "report": "US11 商品推广广告位报告",
        "sourceFile": Path(source).name,
        "placementLabels": {value: key for key, value in PLACEMENTS.items()},
        "totalRows": len(rows) + skipped_rows,
        "skippedRows": skipped_rows,
        "duplicateRows": sum(count - 1 for count in grain_counts.values()),
        "rows": rows,
    }
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"已生成 {output}：{len(rows)} 行，跳过 {skipped_rows} 行，重复粒度行 {payload['duplicateRows']} 行")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("用法：python3 -I scripts/prepare-placement-data.py input.xlsx output.json")
    main(sys.argv[1], sys.argv[2])
