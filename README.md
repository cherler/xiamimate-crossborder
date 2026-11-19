# 虾米跨境 · Xiamimate Crossborder

把一个商品的账算清楚。跨境经营工具可直接在浏览器中使用。

**在线使用：[GitHub Pages](https://cherler.github.io/xiamimate-crossborder/)**
**源码：[cherler/xiamimate-crossborder](https://github.com/cherler/xiamimate-crossborder)**

## 功能

| 功能 | 用途 |
| --- | --- |
| 利润计算器 | 单件净利润、保本价、成本模块与计算依据 |
| 定价决策模拟器 | 目标净利率倒推售价、情景表与折扣空间 |
| 广告盈亏规划器 | 保本 ACoS、目标 ACoS、CPC 与预算测算 |
| 计费重与包装优化 | 实重、体积重、包装方案与运费比较 |
| 到岸成本估算 | 关税、VAT、头程及单件到岸成本 |
| 综合测算 | 用同一份商品模型串起成本、利润、广告与定价 |
| Listing 检查与事实库 | 手动确认商品事实、编辑文案、检查关键词和事实缺口 |
| 评论与竞品样本分析 | CSV 导入、可编辑关键词主题、样本统计、原文和竞品对比 |
| 客服回复工作台 | 中英文售后模板、编辑、脱敏和常见风险表达检查 |
| 我的商品 | 建档、改名、竞品记录、合并、测算历史、备份导出与恢复 |
| 深度研究 | 口碑与需求、竞品对比、综合研究；报告样例、资料整理、底稿保存与导出 |
| 浏览器采集助手 | Amazon、TikTok Shop 当前页采集；商品、评论样本与平台摘要导入 |
| 学习资料 | 跨境词典、入门教程 |

五个计算器沿用原项目的确定性计算引擎。评论分析使用明确可编辑的关键词规则，客服工作台使用场景模板，Listing 由用户录入和核对事实；这些功能不调用大模型，也不代替平台审核。研究报告样例明确标注为演示资料，不代表实时研究结果。

## 浏览器采集助手

[下载与安装](https://cherler.github.io/xiamimate-crossborder/extension/) · [导入采集文件](https://cherler.github.io/xiamimate-crossborder/extension/import/) · [插件源码](./extension/)

下载 ZIP 并解压，在 Chrome / Edge 的扩展管理页启用开发者模式，加载含 `manifest.json` 的目录。点击插件采集当前商品页，导出 JSON，再到网站核对并确认导入。

- 同商品、同站点合并档案；重复导入同一份文件不会增加记录。
- 采集资料与经营测算分开，观察价格不会覆盖用户填写的成本与售价。
- 评论保留来源页、采集时间、排序和筛选信息；平台摘要单独标注。
- 插件不自动翻页、后台采集或上传数据，导出后仍保留本地采集结果。
- 手动安装的版本需手动更新，详见 [插件说明](./extension/README.md)。

## 深度研究

[研究首页](https://cherler.github.io/xiamimate-crossborder/crossborder/research/) 提供三类研究入口和四种完整报告样例。

当前可用：整理插件采集资料、查看去重评论、按关键词统计主题、对比商品档案、补充来源与判断、保存和导出研究底稿。底稿是本地固定结构整理，判断由用户填写。

原版的商品识别、公开网页扫描、联网检索、AI 报告生成和任务续跑依赖在线服务，当前 GitHub Pages 站点尚未接入。演示报告、本地底稿与自动研究的边界会在页面分别说明。

## 数据保存

- 商品资料和测算保存在当前浏览器的本地存储中。
- 在「我的商品」导出 JSON 备份，可在另一浏览器或设备导入；备份包括商品事实、竞品、测算记录和成本模板。
- 导入会合并档案，同一档案保留较新版本。格式错误或写入失败会停止恢复，保留原数据。
- 清除浏览器数据、换域名或使用无痕模式可能影响本地记录，请定期导出备份。
- 页面不提供账号、积分、充值或云同步，不向主站发送资料或用量统计。

分享计算器链接会把该次输入放进链接，请自行决定是否分享其中的经营参数。

## 本地运行

需要 Node.js 22.13 或更新版本。

```bash
npm ci
npm run dev
# http://localhost:3000/
npm test
npm run lint
```

## GitHub Pages 部署

推送 `main` 后，GitHub Actions 会运行网站与插件测试，重新构建插件 ZIP、网站和静态链接检查，再通过浏览器验证后发布 `out/`。

```bash
npm run build:extension  # 单独构建插件与下载包
npm run build:pages      # 同时构建插件和网站
npm run check:static
npm run test:browser
node scripts/serve-static.mjs
# http://127.0.0.1:4179/xiamimate-crossborder/
```

浏览器验证使用本机 Chrome；可设置 `CHROME_PATH`。Actions 使用 Ubuntu 自带 Chrome。
`npm run test:extension:browser` 会安装下载包，并使用页面夹具验证采集、导入和研究流程；真实商店页面改版仍可能影响解析。
Pages 发布来源选择 GitHub Actions。仓库名改动时，请同时更新构建路径、工作流及站点链接。

## 其他入口

[虾米伙伴](https://xiamimate.com/) 为个人维护，可能随时关闭，导航链接也可能失效。本项目的 GitHub Pages 页面独立运行。

## 许可与计算口径

[AGPL-3.0](./LICENSE)。计算结果取决于输入参数；示例费率不是实时费率，请按实际平台、物流和税费规则更新。工作台仅辅助检查，不保证覆盖所有平台规则。
