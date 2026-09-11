/**
 * 平台模块清单 —— 页眉的模块切换器与「模块广场」共用同一份数据。
 * 母品牌 › 子模块：只有 live 的能进，接入中 / 规划中如实标注、不可点。
 */

import type { ComponentType } from "react";
import {
  BookOpenCheck, FlaskConical, Globe2, Network,
} from "lucide-react";

// live 已上线 · trial 试运行(有 demo 可看、功能在打磨)· planned 规划中
export type ModuleStatus = "live" | "trial" | "planned";

export type PlatformModule = {
  key: string;
  title: string;
  desc: string;
  role: string;         // 这个模块「是什么」的一句话（异质：工具 / 实验室 / 清单 / 研究）
  audience: string;     // 面向谁（首页人群路由用）
  pain: string;         // 这拨人的一句真实痛点（口语，首页人群路由用）
  href?: string;        // 仅 live 模块有可进入的地址
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  tone: string;         // 模块图标色调（module-home 卡片用）
  status: ModuleStatus;
  /**
   * 登录弹窗的副标题：**在这个模块里，登录到底给你带来什么。**
   *
   * ⚠️ 2026-09-10 加。在此之前 login-modal 的默认副标题写死成
   * 「登录后,你的商品模型云端保存、多设备同步。」，而 `intro` 这个 prop
   * **一个调用方都没有** —— 于是从虾米看股、虾米看AI、虾米CS课堂、首页
   * 任何地方点登录，看到的都是跨境的那句话。课堂没有"商品模型"。
   * （顺带：产品里的叫法早就是「商品档案」了，那句连跨境自己都不对。）
   *
   * 不填就回落到一句中性的平台文案 —— 宁可说得笼统，也不能说别的模块的事。
   */
  loginIntro?: string;
};

export const MODULES: PlatformModule[] = [
  { key: "crossborder", title: "跨境经营", desc: "利润、定价、广告、物流与税费，快速算清楚", role: "一套把账算清的工具", audience: "做跨境电商", pain: "利润、定价、广告账太烦，还老算错。", href: "/crossborder", icon: Globe2, tone: "", status: "live",
    loginIntro: "登录后，你的商品档案云端保存、多设备同步。" },
  { key: "stocks", title: "虾米看股", desc: "记下你为什么买，并在事实变化时提醒你", role: "长期研究工作台：公司档案、买入理由与复核提醒", audience: "认真买股票", pain: "买的时候有理由，过几个月全忘了；跌了只能干着急。", href: "/stocks/", icon: BookOpenCheck, tone: "teal",
    loginIntro: "登录后，你的公司档案与买入理由云端保存，复核提醒跟着你走。",
    // **保持 planned —— 这是刻意的，不是没做完。**
    //
    // 2026-08-05 起线上 /stocks/ 已经通了（Caddy、systemd、RDS 都好了），
    // 但产品决定是「上线不公开」：服务端 STOCK_ACCESS=owner 只放站主，
    // 这里保持 planned 让首页不出现入口。两道要一起在——
    // 只关服务端等于「有入口但所有人 403」，只藏入口等于「知道地址就能用」。
    //
    // 所以别因为「路由已经通了」就把它翻成 live。真要开放给普通用户，
    // 得同时改服务器 .env 的 STOCK_ACCESS=multi，两处一起动。
    // href 留着：本机点「显示规划中」仍进得去，不影响开发。
    //
    // **保持 planned。** 这个字段只是「运营台还没保存过时」的兜底默认值：
    // live → 默认显示，planned → 默认隐藏。可见性的真源是运营台的「模块显隐」。
    //
    // 2026-08-11 我把它翻成 live 过一次，于是在运营台保存之前，主站按兜底值
    // 把入口显示了出来 —— 而运营台界面上明明是「隐藏」。兜底值要偏安全：
    // 没人说过话的时候，不要自作主张把入口露出去。
    status: "planned" },

  { key: "atlas", title: "虾米看AI", desc: "AI 能力核验：谁能做什么、什么时候长出来的、拿什么跑",
    role: "带来源的 AI 能力核验地图", audience: "选 AI 工具",
    pain: "满屏都说自己最强，没人告诉你哪句是官方写过的。",
    href: "/atlas", icon: Network, tone: "teal",
    // **保持 planned —— 和虾米看股同一条纪律（见上一条的长注释）。**
    //
    // /atlas 是静态导出，没有登录也没有计费，路由通了就能访问 ——
    // 正因为如此，**藏入口是这里唯一的一道门**，翻成 live 就等于对外公布。
    // 本篇的并入做法见 wiki/27-stock-lab-platform-integration.md：
    // 路由 ✓（basePath /atlas）· 身份 —（公开只读）· 外观 ✓（消费 /chrome 制品）
    // · 数据 —（静态 JSON）· 计费 —（运行时不调模型）。
    // 五件里只有路由和外观适用，另外三件不是「没做」，是**不适用**。
    status: "planned" },

  { key: "cslab", title: "虾米CS课堂", desc: "把课本上静止的图，一步一步走一遍",
    role: "计算机专业课的交互仿真实验室", audience: "学计算机",
    pain: "课本上的图是静的，考试要的是走一遍，脑子里过不去。",
    href: "/cslab/", icon: FlaskConical, tone: "amber",
    //  课堂真正会同步的就这两样（见 /v1/lab/progress 的 payload）：实验进度 + 错题本。
    //  AI 学伴那句是实话:游客有当天的体验额度,登录之后花的是自己账户里的积分。
    loginIntro: "登录后，你做过的实验和错题本云端保存，换台设备接着练；AI 学伴也用你自己的积分。",
    // **保持 planned —— 和虾米看股、虾米看AI 同一条纪律。**
    //
    // status 只是「运营台还没保存过时」的兜底默认值,兜底要偏安全:
    // 没人说过话的时候,不要自作主张把入口露出去。
    //
    // 本篇是纯静态站 + 主站的 /v1/lab/progress,没有自己的后端进程 ——
    // 也就是说**藏入口是这里唯一的一道门**(账号接口本身有鉴权,但页面是公开的),
    // 翻成 live 就等于对外公布。
    //
    // 并入做法见 wiki/27:
    // 路由 ✓(VITE_BASE=/cslab/)· 身份 ✓(同源 Cookie,登录只影响进度同步)
    // · 外观 ✓(消费 /chrome 制品)· 数据 ✓(app.lab_progress)· 计费 —(运行时不调模型)
    //
    // ⚠️ 2026-09-10 用户把 key 与 URL 从 lab 改成 cslab。**后端那条 /v1/lab/progress
    // 和 app.lab_progress 表故意没跟着改** —— 改表要迁移、改路由要两仓同时上，收益是零。
    // 别看着 key 是 cslab 就去后端找 /v1/cslab/*，那条不存在。
    status: "planned" },
];

export const MODULE_STATUS_TEXT: Record<ModuleStatus, string> = {
  live: "已上线", trial: "试运行", planned: "规划中",
};

export const moduleByKey = (key: string) => MODULES.find((m) => m.key === key);

/**
 * 默认可见性:live / trial 对所有人可见,planned 默认隐藏。
 * 运营台可对任意模块下 show/hide 覆盖(存后端 modules:vis),覆盖优先。
 */
export function moduleVisibleDefault(m: PlatformModule): boolean {
  return m.status !== "planned";
}
export function isModuleVisible(m: PlatformModule, overrides: Record<string, boolean>): boolean {
  return overrides[m.key] ?? moduleVisibleDefault(m);
}

/**
 * 牌子上写什么 —— **由「运营台放没放出来」推导，不是另一个要单独维护的开关。**
 *
 * 2026-08-11：运营台把虾米看股勾成可见，首页入口和页眉切换器都出来了，
 * 而牌子上仍写着「规划中」。因为可见性早就是运行时的（运营台的 modules_vis），
 * 而状态还是这个文件里的编译期常量 —— 两个开关分开维护，必然漂开，
 * 漂开的表现就是「入口在，牌子上写着还没做」。
 *
 * 规则一句话：**放出来了就是已上线**，除非它自己声明了 trial（试运行是
 * 「开放了但还在打磨」，运营台放出来不代表它出了试运行期，这一档要留住）。
 * 藏着的照旧按声明值显示 —— 首页那个「显示规划中」的开关点开后，
 * 看到的仍该是「规划中」。
 *
 * 于是 status 这个常量退回它唯一还成立的职责：**运营台没保存过时的兜底默认值**
 * （live/trial 默认显示、planned 默认隐藏，见 moduleVisibleDefault）。
 */
export function statusWhenVisible(declared: ModuleStatus, visible: boolean): ModuleStatus {
  return visible && declared === "planned" ? "live" : declared;
}

export function moduleStatus(m: PlatformModule, overrides: Record<string, boolean>): ModuleStatus {
  return statusWhenVisible(m.status, isModuleVisible(m, overrides));
}
