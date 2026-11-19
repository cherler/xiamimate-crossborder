# 虾米跨境 · Xiamimate Crossborder

**把一个商品的账，算清楚。**

从商品采集、评论研究到成本、利润与定价，用同一份商品档案串起跨境经营中的日常判断。打开浏览器就能使用，资料保存在本机，也可以导出备份。

[在线使用](https://cherler.github.io/xiamimate-crossborder/) · [视频演示](https://cherler.github.io/xiamimate-crossborder/promo/) · [安装采集助手](https://cherler.github.io/xiamimate-crossborder/extension/) · [文档导航](docs/README.md)

## 40 秒看一遍：这个品，还能做吗？

[![虾米跨境宣传视频：这个品，还能做吗？点击播放](public/promo/cover.png)](https://cherler.github.io/xiamimate-crossborder/promo/)

[▶ 播放宣传视频](https://cherler.github.io/xiamimate-crossborder/promo/) · 40 秒 · 1080p · 点击封面播放

视频展示录制时的主站流程与报告样例；当前公开版的可用功能见下文，访问入口以本页为准。

## 它能帮你做什么

| 你想解决的问题 | 对应工具 |
| --- | --- |
| 这一件卖出去，实际还剩多少？ | 利润计算器、到岸成本估算、综合测算 |
| 目标利润下，售价与广告空间是多少？ | 定价决策模拟器、广告盈亏规划器 |
| 包装尺寸变一点，运费能省多少？ | 计费重与包装优化 |
| 商品页和评论里的资料，怎样留住？ | Amazon / TikTok Shop 采集助手、商品档案 |
| 用户在抱怨什么，竞品有什么不同？ | 评论样本分析、竞品对比、研究底稿 |
| Listing 和售后回复怎样有据可查？ | 商品事实库、Listing 检查、客服回复工作台 |

## 一份档案，贯穿一次选品判断

1. **采集或建档**：用浏览器插件采集当前商品页，导出文件，再核对并导入。
2. **研究资料**：查看评论原文、来源与采样范围，整理需求、问题和竞品差异。
3. **核算经营**：补齐真实成本与售价，把利润、广告和定价放在一起算。
4. **保存依据**：把资料、测算记录和研究底稿留在商品档案，按需导出。

采集价格与经营参数分开保存；导入观察资料不会覆盖你填写的测算成本与售价。

## 现在就能用

- **五类计算器 + 综合测算**：固定公式计算，可核对输入与依据。
- **三类研究**：口碑与需求、竞品对比、商品综合研究，提供完整报告样例和本地资料整理。
- **浏览器采集助手**：采集已展示的商品资料、评论样本与平台摘要，保留来源与采集范围。
- **本地工作台**：关键词主题分析、Listing 事实检查、客服模板、档案备份与恢复。

公开版无需账号，没有积分或充值。AI 联网研究与截图识别尚未接入；评论统计使用关键词规则，研究判断由你填写。报告样例为演示数据。

## 本地运行

需要 Node.js 22.13+。

```bash
git clone https://github.com/cherler/xiamimate-crossborder.git
cd xiamimate-crossborder
npm ci
npm run dev
```

打开 <http://localhost:3000/>。完整构建、检查与 GitHub Pages 发布步骤见 [开发与部署指南](docs/DEVELOPMENT.md)。

## 项目结构

```text
app/                 页面、计算器、研究工作台与采集导入
lib/                 计算逻辑、商品档案和本地存储
shared/              网页与插件共用的采集数据格式
extension/           浏览器采集助手源码
public/promo/        宣传视频、封面与播放页
scripts/             构建、打包和浏览器检查
tests/               计算与数据处理测试
docs/                开发指南与文档导航
```

## 使用与参与

- 商品资料保存在当前浏览器，清除网站数据或换设备前请导出备份。
- 计算结果取决于实际输入；示例费率和采集价格不是实时经营数据。
- 插件只在你点击时采集当前页，不自动翻页、后台采集或上传。
- 代码采用 [AGPL-3.0](LICENSE)。问题反馈请附上复现步骤，并去除敏感经营资料。
- [虾米伙伴主站](https://xiamimate.com/crossborder/)为个人维护，可能随时关闭或失效；推荐使用上方 GitHub Pages。

## 虾米伙伴系列

[虾米跨境](https://github.com/cherler/xiamimate-crossborder) · [虾米看 AI](https://github.com/cherler/xiamimate-ai-atlas) · [虾米看股](https://github.com/cherler/xiamimate-stock-lab) · [虾米 CS 课堂](https://github.com/cherler/xiamimate-cs-lab) · [模型工坊](https://github.com/cherler/xiamimate-model-lab)

这些项目由个人持续维护。欢迎通过仓库 Issues 反馈问题、提出具体使用场景；觉得有用，也欢迎 Star 或分享。
