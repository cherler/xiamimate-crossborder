/**
 * 退出登录时清除本机的【用户业务数据】,防止同一浏览器的下一个用户 / 游客看到上一个账号的数据
 * (商品档案曾用 localStorage 做"本地权威副本",登录才镜像云端 —— 不清就会串号)。
 *
 * 只清用户数据;设备级/合规级偏好保留:
 *  - 保留:xm:eco(省流)、xm:pet:outfit(换装)、xm:legal-consent / xm:xborder-consent(同意留痕)
 *  - 清除:商品档案、扫描结果、费率模板、进行中的导入、最近工具、示例种子、注册引导标记
 *
 * ⚠️ **这份名单一度只有跨境那一摊**(全是 `xm:` 打头),于是虾米CS课堂并进来之后
 * 出了一个更糟的串号:课堂的学习记录 `cslab.progress.v1` 与游戏存档 `xmhub.*`
 * 留在本机 —— 下一个账号一登录、外壳一同步,**就把上一个人的错题记录写进了他的云端**,
 * 跟着他上任何设备。实测:全新浏览器登录 A,`/v1/lab/progress` 的 payload 里
 * 有 B 的记录。这比"看到上一个人的数据"严重一档:是**改写了别人的账**。
 *
 * 判断标准很简单:**这个键会不会被同步到账号上?** 会的就必须清。
 * 界面偏好(`cslab.nav` / `cslab.side` / `cslab.dockfold` / `cslab.skin` …)不同步、
 * 是这台设备的口味,故意留着 —— 换个人登录没道理把他的栏宽也改了。
 */
const USER_DATA_KEYS = [
  "xm:products:v1", "xm:product-model", "xm:product-project", // 商品档案(+ 旧键)
  "xm:cost-templates",     // 费率模板
  "xm:pending-import",     // 进行中的链接/ASIN 导入
  "xm:recent-tools",       // 最近使用的工具(用户活动痕迹)
  "xm:example-seeded:v1",  // 示例商品是否已种(清后给下一个用户重新种,无害)
  "xm_signup_welcome",     // 注册引导一次性弹窗标记
  //  虾米CS课堂:学习记录(答题/掌握度)。它会经 /v1/lab/progress 同步到账号,所以必须清。
  //  真源在 xiamimate-lab/web/src/progress.ts 的 KEY —— 改那边要改这里,
  //  由 tests/cross-repo-contracts.test.ts 钉住。
  "cslab.progress.v1",
];

/**
 * 前缀清除的名单。跟上面逐个列的是同一条标准:**会同步到账号的才清。**
 *
 * `xmhub.` 是课堂里各游戏的存档(`xmhub.cards` …,见各游戏 hub.ts 的 lsKey),
 * 它们跟学习记录挤在同一份云端 payload 的 `@games` 格子里,一起串号。
 * 游戏是会增减的,所以按前缀扫,不逐个列 —— 少列一个就是又一次静默串号。
 */
const USER_DATA_PREFIXES = ["xm:scan:", "xmhub."];

export function clearLocalUserData(): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of USER_DATA_KEYS) window.localStorage.removeItem(k);
    // 前缀键:扫描结果 xm:scan:*(每商品一条)、课堂各游戏存档 xmhub.*
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && USER_DATA_PREFIXES.some((pre) => k.startsWith(pre))) window.localStorage.removeItem(k);
    }
  } catch { /* 隐私模式 / quota 忽略 */ }
}

/* ---------------- 归属守卫(会话过期路径的兜底) ---------------- */

const OWNER_KEY = "xm:local-owner";

/**
 * 记录本机这批业务数据属于谁,并在归属变化时自动清除。
 *
 * 只靠「退出时清一次」是不够的:退出登录有多个入口(顶栏、账户中心设置页),
 * 而**会话自然过期**根本不经过任何退出代码 —— auth 那边只是 setUser(null)。
 * 于是上一个账号的商品档案、财务模型、事实库会原样留在浏览器里,
 * 下一个人登录就直接看到。
 *
 * 这里改成在「知道当前是谁」的那一刻做一次归属核对:对不上就清。
 * 无论用户是怎么离开的(点退出、关标签、Cookie 过期、换账号),都拦得住。
 *
 * 传 null 表示当前未登录:不清数据(游客本来就用本机数据干活),
 * 只是不更新归属标记 —— 真正的判定发生在下一次有人登录时。
 */
export function guardLocalOwner(userId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const prev = window.localStorage.getItem(OWNER_KEY);
    if (!userId) return;
    if (prev && prev !== userId) {
      clearLocalUserData();
    }
    if (prev !== userId) window.localStorage.setItem(OWNER_KEY, userId);
  } catch { /* 隐私模式忽略 */ }
}

/** 退出登录的统一收口:清本机数据 + 抹掉归属标记。 */
export function clearLocalUserDataAndOwner(): void {
  clearLocalUserData();
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(OWNER_KEY); } catch { /* 忽略 */ }
}
