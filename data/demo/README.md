# Demo 演示数据

此目录包含 ShareScope 的公开演示数据，仅用于独立 Demo 租户，不会导入正式工作区。用户已明确允许将这些数据随 Git 仓库发布并打包进本地 Docker 镜像。

| 文件 | 报表类型 | 用途 |
|---|---|---|
| `search-term-share.csv` | 搜索词展示份额 | Demo 启动时去重导入 |
| `placement-report.json` | 广告位 | Demo 启动时去重导入 |
| `purchased-product-report.json` | 已购买商品 | Demo 启动时去重导入 |

正式用户的数据通过三个报表页面的 `.xlsx` 上传入口导入，按租户、店铺＋站点和报表类型隔离。`data/local/` 仍保持 Git 忽略，不随仓库发布。
