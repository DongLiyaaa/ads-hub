# 本地报表数据

此目录不包含随仓库发布的演示数据。请将自行准备的数据文件放在本地，不要提交真实业务数据。

| 文件 | 用途 |
|---|---|
| `search-term-share.csv` | 搜索词展示份额报表 |
| `placement-report.json` | 广告位标准数据 |
| `purchased-product-report.json` | 已购买商品标准数据 |

配置 PostgreSQL 后，在项目根目录执行 `npm run db:import`。除本说明外，此目录内容均被 Git 忽略。
