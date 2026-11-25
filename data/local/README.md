# 本地报表数据

此目录仅用于本地正式报表导入，不参与 Vite 静态发布，不会被复制到 `dist/`。除本说明外，此目录内容均被 Git 忽略；公开演示数据独立放在 `data/demo/`，不会导入正式工作区。

| 文件 | 用途 |
|---|---|
| `search-term-share.csv` | 搜索词展示份额报表 |
| `placement-report.json` | 广告位标准数据 |
| `purchased-product-report.json` | 已购买商品标准数据 |

配置 PostgreSQL 后，在项目根目录执行 `npm run db:import`。除本说明外，此目录内容均被 Git 忽略。
