# 虾米跨境采集助手

[下载与安装](https://cherler.github.io/xiamimate-crossborder/extension/) · [导入采集文件](https://cherler.github.io/xiamimate-crossborder/extension/import/)

支持 Amazon 和 TikTok Shop 当前商品页的公开资料、已加载评论，以及 Amazon 页面展示的口碑摘要。只有用户点击采集按钮才读取页面；不自动翻页，没有后台任务。

## 使用

1. 从下载页取得 ZIP，解压到固定目录。
2. 在 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions` 打开开发者模式，加载含 `manifest.json` 的文件夹。
3. 在商品页打开插件，采集商品或评论。手动翻页后可继续采集，评论篮按商品与站点隔离，最多 500 条。
4. 导出 JSON 文件，进入网站导入页核对后确认。导出不会清空插件内资料。
5. 在网站的评论分析与深度研究工作台使用这些样本；商品观察价不会覆盖成本和测算参数。

没有账号连接、积分、令牌或云端上传。平台摘要、评论样本和用户研究判断分别记录，不能当作完整评论库或自动 AI 研究结果。

## 开发

在仓库根目录执行：

```sh
npm ci
npm run build:extension
npm run test --workspace extension
npm run typecheck --workspace extension
```

产物在 `extension/dist/`，可直接加载到浏览器。网站构建时会重新打包，下载文件在 `public/downloads/`，构建产物不提交。

本地调试网页地址：

```sh
XM_SITE=http://localhost:3000 npm run dev --workspace extension
```

解析器在 `src/adapters/`，页面读取入口在 `src/content/collect.ts`。导入协议和校验器由插件与网站共用 `../shared/collector.ts`。回归测试使用保存并清理过的页面夹具，移除了无关脚本、追踪配置与评论人标识；真实网站改版仍可能导致字段缺失。

## 权限与数据

- `activeTab`：用户点击扩展时，临时访问当前标签页。
- `scripting`：点击采集按钮时注入只读解析脚本。
- `storage`：在扩展本地保存商品与评论篮。
- 无 `host_permissions`、常驻后台、远程脚本、Cookie 权限或统计上报。

诊断信息由用户主动复制；不会自动发送。卸载插件会移除其本地数据，网站资料需在「我的商品」另行导出备份。

## 源码来源

解析器与回归夹具来自作者维护的 `xiamimate-extension`，基线提交 `9e10f28`（0.2.13）。此目录从 0.3.0 起随虾米跨境发布，改用本地文件交接。旧账号连接与服务端导入流程不在本版中启用。许可沿用本仓库的 [AGPL-3.0](../LICENSE)。
