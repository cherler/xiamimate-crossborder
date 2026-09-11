import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 纯静态导出：next build 产出 out/ 静态站，线上交给 Caddy 托管。
   *
   * **只在构建时开。** dev 下要留着 rewrites 的能力（见下方 rewrites 注释），
   * 而 `output: "export"` 与 rewrites 互斥 —— Next 会直接忽略后者。
   * 构建产物不受影响：next build 时 NODE_ENV 就是 production。
   */
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  // 静态导出不做动态图片优化（原来走 Cloudflare Images Worker，已移除）。
  images: { unoptimized: true },
  // Next 16 dev 默认只放行 localhost 来源;用 127.0.0.1 打开会被拒(HMR/hydration 静默失败,整页点不动)。
  allowedDevOrigins: ["127.0.0.1"],
  /**
   * dev 下把 `/atlas/*` 转给能力地图的 dev server（:3400）。
   *
   * **为什么必须有这条。** 线上 `/atlas` 由 Caddy 分流到静态产物，主站根本不参与；
   * 但 dev 下没有 Caddy，于是从首页点「选 AI 工具」跳到 /atlas 就是 404 ——
   * **主页上有入口、点进去是死的**，而这条链路恰恰是「并入主页」要保证的那一条。
   * 让开发环境和线上在**用户实际走的路径**上表现一致，比让他记住换个端口重要。
   *
   * 只在 dev 生效：生产是静态导出，这里返回空数组，分流仍归 Caddy
   * （规则见 xiamimate-ai-atlas/deploy/caddy-snippet.conf）。
   * :3400 没起时这条会 502 —— 那是「地图没启动」，比 404 好查。
   */
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    const atlas = process.env.ATLAS_DEV_ORIGIN ?? "http://127.0.0.1:3400";
    const main = process.env.MAIN_API_ORIGIN ?? "http://127.0.0.1:8200";
    // 虾米看股：直接转给它的 Vite dev（:5217）与后端（:8108）。
    //
    // **HMR 不走这一层。** 试过一版让它转，结果是从 /stocks 点任何东西都卡
    // 十几秒：Vite 的 HMR 每秒重连一次，每次的 WebSocket 升级都在代理这层
    // 挂住一条连接，浏览器对同一主机只有 6 条并发，六条占满之后点击、跳转、
    // 接口全排在后面 —— 页面渲染得好好的，所以完全不像网络问题。
    //
    // 解法在 stock-lab 的 vite.config：写死 hmr.clientPort=5217，
    // 浏览器无论从哪个源拿到页面都直连 Vite。**这一层只管普通 HTTP。**
    const stocks = process.env.STOCKS_DEV_ORIGIN ?? "http://127.0.0.1:5217";
    const stocksApi = process.env.STOCKS_API_ORIGIN ?? "http://127.0.0.1:8108";
    // 虾米做实验：转给它的 Vite dev（:5178）。
    //
    // **没有第二条 `-api`**：那个仓一个后端进程都没有，学习进度直接打主站的
    // `/v1/lab/progress`，由下面那条 `/v1/:path*` 一起转走。
    //
    // 那边的 dev server 必须用 `npm run web:lab` 起（`VITE_BASE=/cslab/`），
    // 否则它挂在根上、HTML 里的资源链接是 `/assets/...`，转过来会落到主站身上。
    // HMR 同样不走这一层，理由见上面虾米看股那段。
    const cslab = process.env.LAB_DEV_ORIGIN ?? "http://127.0.0.1:5178";
    const cslabAi = process.env.LAB_AI_ORIGIN ?? "http://127.0.0.1:8300";
    // ⚠️ 2026-09-10 用户把模块从 `/lab` 改名成 `/cslab`（key 也一起改了）。
    //    **`/v1/lab/progress` 和 `app.lab_progress` 表故意没跟着改**：改表要迁移、
    //    改路由要两仓同时上，收益是零。**页面路径是 cslab，账号接口仍是 lab。**
    // Transformer 图解：**2026-09-10 起不再是独立服务。**
    //
    // 这里原来转给一个 SvelteKit dev（:5174）+ 推理服务（:8123）。查下来那两个
    // 已经不存在了：`~/projects/xiamimate/` 下没有任何 explainer 仓，
    // `/cslab/explainer-api` 全平台一处引用都没有。
    // 现在这条路由由 lab 自己提供 —— `experiments/explainer-hub/`，一张自足的门厅页
    // （并排摆着 poloclub 那份图解和我们这份浏览器推理 `/cslab/explainer-live`）。
    // 所以它跟 cards 一样，走下面那组 cslab 子应用规则。
    return [
      { source: "/atlas", destination: `${atlas}/atlas` },
      { source: "/atlas/:path*", destination: `${atlas}/atlas/:path*` },
      { source: "/stocks", destination: `${stocks}/stocks/` },
      { source: "/stocks/:path*", destination: `${stocks}/stocks/:path*` },
      // 剥掉 /stocks-api 前缀，跟线上 Caddy 的 handle_path 一致。
      { source: "/stocks-api/:path*", destination: `${stocksApi}/:path*` },
      // ── cslab 的三个子应用：cards / explainer / explainer-live ────
      //
      // ⚠️ 这里原来还有 world（探索游戏，games/xiami-world）。
      // **2026-09-10 用户拍板从虾米CS课堂去掉：完成度太差。** 代码留在 lab 仓里、
      // 能单独跑，只是不再挂到 /cslab 下（lab 那边的 vite 子应用表、Caddy、网关同步摘了）。
      //
      // ⚠️ **每一个都必须单独写一条「目的地带斜杠」的规则，而且要排在 `/cslab/:path*` 之前。**
      //
      // 不写的话会撞上一个**无限重定向**（用户 2026-09-10 报「算法游戏、探索游戏、
      // Transformer 图解都没法访问」）：
      //   `/cslab/cards` 落进下面的 `/cslab/:path*` → 原样转给 :5178 的 `/cslab/cards`
      //   → lab 那边的 subapps 中间件认为"少个斜杠"，308 到 `/cslab/cards/`
      //   → 浏览器回到主站要 `/cslab/cards/` → Next 默认 `trailingSlash: false`，308 去掉斜杠
      //   → 回到 `/cslab/cards` …… 来回弹到 ERR_TOO_MANY_REDIRECTS。
      //
      // 解法跟上面 `/stocks`、下面 `/cslab` 是同一个：**把斜杠补在目的地上**，
      // 这样它只是代理路径的一部分，永远不会变成发回浏览器的重定向。
      // AI 学伴（出题 / 答疑 / 复习）是 cslab 自己的 Node 进程（server/index.ts，:8300）——
      // 出题要 import 内核跑 trace、答案由引擎钉死，所以它是进程、不是静态文件。
      //
      // ⚠️ **这条原来根本没有**，只有线上 Caddy 和 lab 自己的 :8090 网关配了。
      // 结果是从主站 :3000 进 /cslab 时 `/cslab/ai/experiments` 一路 404，
      // 页面还照常渲染 —— 只有 AI 学伴那一块是哑的，**首页看不出坏**。
      // 2026-09-10 补。**必须排在下面 `/cslab/:path*` 之前**，否则被当静态文件转走。
      { source: "/cslab/ai/:path*", destination: `${cslabAi}/cslab/ai/:path*` },
      { source: "/cslab/cards", destination: `${cslab}/cslab/cards/` },
      { source: "/cslab/cards/:path*", destination: `${cslab}/cslab/cards/:path*` },
      { source: "/cslab/explainer", destination: `${cslab}/cslab/explainer/` },
      { source: "/cslab/explainer/:path*", destination: `${cslab}/cslab/explainer/:path*` },
      { source: "/cslab/explainer-live", destination: `${cslab}/cslab/explainer-live/` },
      { source: "/cslab/explainer-live/:path*", destination: `${cslab}/cslab/explainer-live/:path*` },
      { source: "/cslab", destination: `${cslab}/cslab/` },
      { source: "/cslab/:path*", destination: `${cslab}/cslab/:path*` },
      // **主站自己的接口也要转。**
      //
      // 线上是单域名：/v1/* 由 Caddy 转 8200，跟页面同源。dev 下主站自己的
      // React 代码带着绝对地址打 8200，所以看着一切正常；但**嵌进来的页眉制品
      // 用的是相对路径 /v1/session**（它在线上就该同源），在 :3000 上是 404，
      // 于是判定「主站后端连不上」，右上角变成「独立模式」——没有登录按钮、
      // 没有积分胶囊。页面本身渲染得好好的，所以完全不像是路由问题。
      //
      // 少了这几条，:3000 就不是线上那套环境的镜像，而是第三种环境。
      { source: "/v1/:path*", destination: `${main}/v1/:path*` },
      { source: "/media/:path*", destination: `${main}/media/:path*` },
    ];
  },
};

export default nextConfig;
