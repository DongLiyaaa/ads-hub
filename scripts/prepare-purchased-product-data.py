"""Convert an Amazon SP purchased product XLSX report into normalized JSON.

Usage: python3 -I scripts/prepare-purchased-product-data.py input.xlsx output.json
Requires openpyxl. The source workbook is not copied into the web application.
"""

import json
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

HEADERS = [
    "日期", "广告组合名称", "货币", "广告活动名称", "广告组名称", "广告SKU", "广告ASIN",
    "投放", "匹配类型", "已购买的ASIN", "7天内其他SKU销售量(#)",
    "7天内其他SKU订单数(#)", "7天内其他SKU销售额",
]
METRIC_FIELDS = {
    "7天内其他SKU销售量(#)": "units",
    "7天内其他SKU订单数(#)": "orders",
    "7天内其他SKU销售额": "sales",
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
            required_text = ["广告组合名称", "广告活动名称", "广告组名称", "广告SKU", "广告ASIN", "已购买的ASIN"]
            text = {field: str(source_row[indexes[field]] or "").strip() for field in required_text}
            if any(not value for value in text.values()):
                raise ValueError("广告组合、活动、广告组或 ASIN/SKU 为空")
            row = {
                "date": row_date,
                "portfolio": text["广告组合名称"],
                "campaign": text["广告活动名称"],
                "adGroup": text["广告组名称"],
                "advertisedSku": text["广告SKU"],
                "advertisedAsin": text["广告ASIN"],
                "targeting": str(source_row[indexes["投放"]] or "未标注").strip(),
                "matchType": str(source_row[indexes["匹配类型"]] or "未标注").strip(),
                "purchasedAsin": text["已购买的ASIN"],
                "currency": str(source_row[indexes["货币"]] or "USD").strip(),
            }
            for source_field, target_field in METRIC_FIELDS.items():
                row[target_field] = number(source_row[indexes[source_field]])
        except (ValueError, KeyError) as error:
            skipped_rows += 1
            print(f"跳过第 {len(rows) + skipped_rows + 1} 行：{error}", file=sys.stderr)
            continue

        grain = tuple(row[key] for key in (
            "date", "portfolio", "campaign", "adGroup", "advertisedSku", "advertisedAsin",
            "targeting", "matchType", "purchasedAsin",
        ))
        grain_counts[grain] += 1
        rows.append(row)

    if not rows:
        raise ValueError("没有可用的已购买商品数据")
    currencies = sorted({row["currency"] for row in rows})
    if currencies != ["USD"]:
        raise ValueError(f"当前看板仅支持单一 USD 币种，实际为：{currencies}")

    rows.sort(key=lambda row: (
        row["date"], row["portfolio"], row["campaign"], row["adGroup"],
        row["advertisedAsin"], row["purchasedAsin"],
    ))
    payload = {
        "report": "US11 商品推广已购买商品报告",
        "sourceFile": Path(source).name,
        "sourceSheet": sheet.title,
        "attribution": "7天内其他SKU",
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
        raise SystemExit("用法：python3 -I scripts/prepare-purchased-product-data.py input.xlsx output.json")
    main(sys.argv[1], sys.argv[2])
