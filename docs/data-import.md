# 数据导入指南

Ads Hub 使用你自己的亚马逊商品推广报表。仓库不附带演示业务数据，也不会自动下载报表。

本地源文件统一放在 `data/local/`。该目录中的数据文件被 Git 和 Docker 构建排除，不属于 `public/`，不会作为静态文件对外提供；请勿提交真实业务数据。

## 文件要求

| 本地路径 | 用途 | 准备方式 |
|---|---|---|
| `data/local/search-term-share.csv` | 搜索词展示份额报表 | 直接使用亚马逊导出的 CSV，保留原始字段名 |
| `data/local/placement-report.json` | 广告位标准数据 | 使用转换脚本从广告位 XLSX 生成 |
| `data/local/purchased-product-report.json` | 已购买商品标准数据 | 使用转换脚本从已购买商品 XLSX 生成 |

原始 XLSX 不要放入 `public/` 或 Web 静态目录。

## 转换广告位报表

前置条件：Python 环境已安装 `openpyxl`。在项目根目录执行：

```bash
python3 -I scripts/prepare-placement-data.py \
  "/path/to/商品推广广告位报告.xlsx" \
  data/local/placement-report.json
```

脚本校验必要字段、日期、三类广告位、单一 USD 币种和重复粒度，并输出标准化 JSON。

## 转换已购买商品报表

```bash
python3 -I scripts/prepare-purchased-product-data.py \
  "/path/to/商品推广已购买商品报告.xlsx" \
  data/local/purchased-product-report.json
```

脚本保留零值行以维持日期覆盖，同时校验必要字段、日期、USD 币种和重复粒度。

## 导入 PostgreSQL

1. 参考 `.env.example` 配置本地 `.env`，设置 PostgreSQL 连接及 `MODEL_CONFIG_ENCRYPTION_KEY`。
2. 将三个文件放入上表所列路径。
3. 在项目根目录执行：

```bash
npm run db:import
```

导入脚本启动时执行数据库迁移，并根据源文件 SHA-256 避免重复导入相同数据集。默认导入到默认租户和默认店铺；导入其他租户时，必须同时指定已启用且属于该租户的店铺：

```bash
SHARESCOPE_TENANT_ID=<租户 UUID> \
SHARESCOPE_STORE_ID=<店铺 UUID> \
npm run db:import
```

未导入数据时，看板会显示空数据或无权限状态。替换本地文件不会自动更新 PostgreSQL，需要重新执行导入命令。
