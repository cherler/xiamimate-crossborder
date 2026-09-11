"use client";

/**
 * 像素虾米君(#58/#73)—— 页面右下角的电子宠物。
 *
 * 状态机:idle ↔ walk 随机切换;90 秒无操作入睡(23 点后戴睡帽),
 * 睡醒先伸个懒腰;摸它眯眼、戳它 wink、能抓起来拖着扔;
 * 右键小菜单:丢球给它追、喂一只米虾、送回家。
 * 产品事件:保存开心跳、深度报告跑完戴博士帽庆祝(xm-pet 事件)。
 *
 * 性能纪律(远程桌面卡顿教训):8fps 低频定时器,交互动画全部一次性限时,
 * 平滑交给 CSS transition;后台标签页零开销;无常驻物理循环。
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ACCESSORIES, COLS, FRAMES, FRAME_MS, lookAt, PALETTE, ROWS, SLEEP_NIGHT, type PetState } from "../../../lib/pet/sprites";
import { initEco, isEco, subscribeEco } from "../../../lib/eco-mode";

/**
 * 画格 → CSS 像素。**精灵从 14×16 换成 28×32 时这里从 4 改成 2** ——
 * 画布仍然是 56×64,屏幕上一格没变,只是每个画格更小、能画的更多。
 */
const SCALE = 2;
const OFF_KEY = "xm:pet:off";
/**
 * 眼神跟随的作用半径(#pet-p4)。**只在鼠标凑近时才跟。**
 *
 * Grok 那个角色引擎里指针跟随是**默认关掉的**(只有大预览开着) ——
 * 常驻跟随很快就烦人:人在读页面,角落里一双眼睛一直转。
 * 凑近了才抬头看你,才像它注意到了你。
 */
const GAZE_R = 160;
const GAZE_DEAD = 12;   // 正中间的死区,不然鼠标一抖眼珠就左右横跳

/**
 * 虾米君在哪些页面出没。
 *
 * 抽成纯函数是为了能测 —— 这个判断此前藏在 effect 里提前 return,
 * 而「提前 return」正是那个 bug 的成因:它让 off 保持初始值,
 * 于是「不该出现」被渲染成了「回家休息中」。
 */
export function petBelongsHere(pathname: string): boolean {
  // 虾米君跟着页脚走：页脚在哪个模块，它就在哪个模块。
  //
  // 2026-08-11 之前这里只列了跨境与首页，因为页脚只有主站在用。现在页脚进了
  // 制品、子应用也挂同一份，范围要跟上 —— 否则子应用的页脚里挂着一个
  // **什么都不渲染的组件**，而使用者看到的是「宠物没出现」，查不出原因。
  //
  // 仍然是白名单而不是「除了这几页都有」：/privacy、/terms、/account 这些
  // 页面上不该有一只虾在爬（用户 2026-08-02 报过 /extension 上的类似问题）。
  const modules = ["/crossborder", "/stocks", "/atlas"];
  return pathname === "/" || modules.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

// 换装可选项(#pet-p2/#pet-p3)。id 对应 sprites 里的 ACCESSORIES 键;null = 不戴。
const HEAD_WEAR: { id: string | null; label: string }[] = [
  { id: null, label: "无" }, { id: "strawhat", label: "草帽" }, { id: "partyhat", label: "派对帽" },
  { id: "bow", label: "蝴蝶结" }, { id: "crown", label: "小皇冠" }, { id: "beret", label: "贝雷帽" },
];
const NECK_WEAR: { id: string | null; label: string }[] = [
  { id: null, label: "无" }, { id: "scarf", label: "围巾" },
  { id: "bowtie", label: "领结" }, { id: "pearls", label: "珍珠项链" },
];
const BODY_WEAR: { id: string | null; label: string }[] = [
  { id: null, label: "无" }, { id: "overalls", label: "背带裤" }, { id: "dress", label: "小裙子" },
  { id: "sailor", label: "水手衫" }, { id: "cape", label: "小披风" },
];
// 一键套装(#pet-p3):一次穿好整套 —— 给爱换装的小朋友。
type Outfit = { head: string | null; neck: string | null; body: string | null };
const SUITS: { label: string; fit: Outfit }[] = [
  { label: "👑 小公主", fit: { head: "crown", neck: "pearls", body: "dress" } },
  { label: "⚓ 小水手", fit: { head: "beret", neck: "bowtie", body: "sailor" } },
  { label: "🦸 小侠客", fit: { head: null, neck: "scarf", body: "cape" } },
  { label: "🎀 甜心", fit: { head: "bow", neck: "pearls", body: "dress" } },
  { label: "👖 工装日", fit: { head: "strawhat", neck: null, body: "overalls" } },
];

/**
 * 表情池(#pet-p4)。**只放表情,不放动作** —— 走 / 坐 / 睡不是表情,
 * 混进来会让「做个表情」变成「随便干点什么」。
 */
const FACES: PetState[] = ["love", "surprise", "cool", "shy", "cry", "angry",
  "think", "laugh", "wave", "happy", "eager", "yawn", "dizzy", "starry", "tease"];

/**
 * 飘字:像素画到 14×16 表达不了「气得冒烟」这类抽象情绪,拿一枚字符补足。
 * 💤 和 🍤 早就是这么做的,这里只是把它推广成一张表。
 */
const DECOR: Partial<Record<PetState, string>> = {
  love: "\u{1F497}", angry: "\u{1F4A2}", think: "\u{1F4AD}", cool: "\u2728",
  surprise: "\u2757", cry: "\u{1F4A7}", wave: "\u{1F44B}",
  dizzy: "\u{1F4AB}", starry: "\u2b50", tease: "\u{1F61C}",
};

/**
 * 出场表演(#pet-p4)。**每次会话第一次见面时演一遍,之后交回随机调度。**
 *
 * ## 为什么要这一段
 *
 * 待机调度是概率驱动的(每 tick 抽一次),自然,但代价是**新用户三分钟里
 * 大概率只看得到站着和溜达**—— 我们画了二十多个状态,绝大多数人一个都撞不上。
 * 好东西藏在中段,和宣传片「4 秒划走」是同一个病。
 *
 * 所以开头这一段是确定性的:把最能看的几个表情按顺序演一遍,每个中间回一次
 * 中性态(表情 → idle → 表情 → idle)—— 不回中性的话几个表情连着切,
 * 看着像动画在抽,而不是「它在做表情」。
 *
 * 只演一次(每会话),不重播:同一个标签页里翻第二页还从头演一遍,那是骚扰。
 */
const DEBUT: { state: PetState; ms: number }[] = [
  { state: "wave", ms: 1150 },
  { state: "idle", ms: 260 },
  { state: "love", ms: 900 },
  { state: "idle", ms: 260 },
  { state: "surprise", ms: 780 },
  { state: "idle", ms: 260 },
  { state: "cool", ms: 1000 },
  { state: "idle", ms: 260 },
  { state: "laugh", ms: 950 },
];
const DEBUT_MS = DEBUT.reduce((a, b) => a + b.ms, 0);
const DEBUT_KEY = "xm:pet:debut";

const TIPS = [
  "保本 ACoS = 毛利率 —— 广告费吃完毛利就白干。",
  "先算到岸成本,再谈售价;顺序反了会亏得很整齐。",
  "体积重和实重,承运商按贵的那个收。",
  "悲观档还赚钱的价,才扛得住促销季。",
  "退款率 +1pt,净利率大约掉 1pt —— 别小看它。",
  "换品不换店:佣金费率存成成本底座,一键铺底。",
  "同一个商品的多次测算会记成版本,可以对比。",
];

type Emote = { text: string; big?: boolean } | null;
type XY = { dx: number; dy: number };

const isNight = () => { const h = new Date().getHours(); return h >= 23 || h < 6; };

export function PetWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [off, setOff] = useState(true);          // SSR 先不渲染,挂载后读偏好
  /**
   * 这个页面该不该有虾米君 —— 与 off 是**两件事**,不能共用一个布尔。
   *
   * 原来只有 off:出没范围之外的页面直接 return、不设 off,于是它停在初始的 true,
   * 而 `if (off)` 那一支渲染的是「虾米君回家休息中 —— 点这里唤回」。
   * 结果是 /extension、/privacy 这些页面上都挂着一个「回家休息」按钮 ——
   * 一个从没发生过的状态被显示成既成事实,用户点了还会把它请到不该出现的页面上。
   * (实测:用户在 /extension 上每次进来都看到「回家休息」。)
   *
   * off = 用户让它回家了;belongs = 这一页本来就有它。前者要留唤回入口,
   * 后者什么都不该渲染。又一次「一个变量兼了两个含义」。
   */
  const [belongs, setBelongs] = useState(false);
  const [emote, setEmote] = useState<Emote>(null);
  const [x, setX] = useState(0);                 // 相对右下角基准的水平位移
  const [flip, setFlip] = useState(false);
  const [perch, setPerch] = useState<XY | null>(null);   // 首页切换台栖停点
  const [drag, setDrag] = useState<XY | null>(null);     // 被拎起时的实时位置
  const [falling, setFalling] = useState(false);         // 松手掉落(弹地补间)
  const [entered, setEntered] = useState(false);         // 掉落入场播完
  const [menu, setMenu] = useState(false);               // 右键小菜单
  const [picker, setPicker] = useState(false);           // 换装选择面板(#pet-p2)
  const [outfit, setOutfit] = useState<Outfit>({ head: null, neck: null, body: null });
  const [chaseMs, setChaseMs] = useState<number | null>(null);   // 追球中:覆盖 transform 过渡时长
  const [hopping, setHopping] = useState(false);                 // 接球小跳(canvas 动画)
  const [snack, setSnack] = useState(false);
  /**
   * 宠物挂在 body 上,**不留在页脚里**(#pet-p5)。
   *
   * 起因(2026-08-19,使用者在虾米看股发现):追球跑到左边之后,宠物被侧边栏挡住,
   * 只露出下半截。查下来不是 z-index 不够 —— 是**它的 z-index 根本没在跟侧栏比**:
   * `.site-footer` 带着 `position:relative; z-index:2`,那是一个层叠上下文,
   * 宠物的 70 只在页脚内部有效;对整页而言,宠物这一摞是 2,输给侧栏的 20。
   *
   * 把 <footer> 的 z-index 改高会动到所有模块的页脚层级,不该为宠物动它。
   * 宠物本来就是**视口级浮层**(position:fixed),待在页脚里只是当初挂载位置的历史 ——
   * 搬到 body 上,它的 70 才真正参与整页的层叠。球早就是这么做的。
   *
   * 挂载点要带 `xm-embedded-chrome`:所有 `.pet-*` 样式都写在那个作用域下面。
   */
  const [host, setHost] = useState<HTMLElement | null>(null);
  /**
   * 当前状态的**只读镜像**,给 React 用。
   *
   * 动画状态本体在 st.current(ref)里 —— 逐帧改 state 会把 React 拖垮。
   * 但飘字、💤、呼噜泡这些是 DOM,ref 改了 React 不会重画。
   * 原来 💤 直接读 `st.current.state`:**它能不能出现,取决于此刻碰巧有没有
   * 别的 setState** —— 睡着时正好没有,所以 💤 常常不出现,而且时有时无。
   * 这里只在**状态真的变了**的那一刻同步一次(不是每帧),开销可以忽略。
   */
  const [face, setFace] = useState<PetState>("idle");
  /** 「做个表情」上一次挑中的 —— 连着两次一样,会被当成点了没反应。 */
  const lastFace = useRef<PetState | null>(null);
  const outfitRef = useRef(outfit);

  const st = useRef({
    state: "idle" as PetState, frame: 0, lastFrame: 0,
    lastActive: Date.now(), until: 0, dir: -1,
    hold: false,          // true = 剧本动作接管(追球/吃饭),tick 不自动挪位置
    props: [] as string[],   // 叠加道具(#pet-p1):如 ["magnifier"] / ["coffee"]
    researchUntil: 0,        // >now 时研究进行中,一直举放大镜;心跳过期自动放下
    /** 排期(#pet-p4):出场表演 / 「做个表情」把要演的一串塞这儿,由 tick 一格格往下走。
     *  **不另起定时器** —— 常驻循环只许有一个,多一个就是多一份远程桌面卡顿的来源。 */
    queue: [] as { state: PetState; ms: number }[],
    gx: 0 as -1 | 0 | 1, gy: 0 as -1 | 0 | 1,   // 上一帧的视线方向,用来判断要不要重画
  });
  const faceRef = useRef<PetState>("idle");
  const flipRef = useRef(false);
  /** 鼠标位置 + 最后一次移动的时刻。**鼠标不动就不去读 getBoundingClientRect** ——
   *  那是一次强制布局,没必要每 tick 都付。 */
  const ptrRef = useRef({ x: -1e4, y: -1e4, at: 0 });
  const perchRef = useRef<XY | null>(null);
  const xRef = useRef(0);
  const dragRef = useRef(false);
  // 丢球 v2:当前这一投的现场(球 DOM + 全部剧本定时器)。再丢一球时整体作废 ——
  // 虾米君立刻中断小跳/开心收尾,转身去接新球。
  const throwCtx = useRef<{ el: HTMLDivElement; timers: number[] } | null>(null);
  const ecoRef = useRef(false);          // 省流模式:定格静态、不动
  const ecoStaticRef = useRef(false);

  useEffect(() => { perchRef.current = perch; }, [perch]);
  useEffect(() => { outfitRef.current = outfit; }, [outfit]);
  useEffect(() => { if (!menu) setPicker(false); }, [menu]);
  // 换装记忆(#pet-p2):挂载读回上次穿的
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("xm:pet:outfit");
      if (raw) setOutfit({ head: null, neck: null, body: null, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  const chooseOutfit = (next: Outfit) => {
    setOutfit(next);
    try { window.localStorage.setItem("xm:pet:outfit", JSON.stringify(next)); } catch { /* ignore */ }
    st.current.lastActive = Date.now();
  };

  // 省流总闸:进省流让宠物定格并回角落;退出恢复动画。
  useEffect(() => {
    initEco();
    ecoRef.current = isEco();
    if (ecoRef.current) setPerch(null);
    return subscribeEco((v) => {
      ecoRef.current = v;
      ecoStaticRef.current = false;      // 让 tick 重画一帧(进省流画静态、出省流恢复动画)
      if (v) setPerch(null);
    });
  }, []);
  useEffect(() => { xRef.current = x; }, [x]);
  useEffect(() => {
    if (!belongs) return;
    const el = document.createElement("div");
    el.className = "xm-embedded-chrome xm-pet-host";
    document.body.appendChild(el);
    setHost(el);
    return () => { el.remove(); setHost(null); };
  }, [belongs]);
  useEffect(() => { flipRef.current = flip; }, [flip]);

  useEffect(() => {
    // 在虾米跨境与首页出没;用户关过就不再出现
    const here = petBelongsHere(window.location.pathname);
    setBelongs(here);
    if (!here) return;
    try { setOff(window.localStorage.getItem(OFF_KEY) === "1"); } catch { setOff(false); }
  }, []);

  /**
   * 首次出场:**先演一段表情,再提示右键**(每会话各一次)。
   *
   * 两件事必须排队。同时来的话,气泡正好挡在脸前面 ——
   * 挡住的就是这段表演唯一要给人看的东西。
   */
  useEffect(() => {
    if (off) return;
    let debut = false, hinted = true;
    try {
      debut = sessionStorage.getItem(DEBUT_KEY) !== "1";
      hinted = sessionStorage.getItem("xm:pet:hinted") === "1";
    } catch { /* ignore */ }
    if (ecoRef.current) debut = false;        // 省流模式定格不动,演了也看不见

    const timers: number[] = [];
    if (debut) {
      try { sessionStorage.setItem(DEBUT_KEY, "1"); } catch { /* ignore */ }
      /**
       * **当场就排好队,不用定时器。**
       *
       * 原来隔 1100ms 再排(等掉落入场 pet-drop 播完)。可待机调度只看
       * 「s.until 空不空」,这 1100ms 里它是空的 —— 于是表演开始前会先蹦出
       * 一个随机动作(实测撞到过 stretch)。开场那一下就不干净了。
       * 现在第一格就是这 1100ms 的等待本身,队列从头到尾占着 s.until。
       */
      const s = st.current;
      s.queue = DEBUT.slice();
      s.state = "idle"; s.until = performance.now() + 1100;
    }
    if (!hinted) {
      timers.push(window.setTimeout(() => {
        setEmote({ text: "右键点我,有球🎾 和小虾米🍤" });
        window.setTimeout(() => setEmote((e) => (e && e.text.includes("右键") ? null : e)), 5200);
        try { sessionStorage.setItem("xm:pet:hinted", "1"); } catch { /* ignore */ }
      }, debut ? 1100 + DEBUT_MS + 500 : 2200));
    }
    return () => timers.forEach(window.clearTimeout);
  }, [off]);

  // 交互唤醒 + 产品事件(保存开心 / 报告完成戴帽庆祝)
  useEffect(() => {
    if (off) return;
    const wake = () => { st.current.lastActive = Date.now(); };
    const onPet = (e: Event) => {
      const mood = (e as CustomEvent).detail?.mood;
      const s = st.current;
      s.lastActive = Date.now(); s.queue = [];
      if (mood === "happy") {
        s.state = "happy"; s.until = performance.now() + 2400; s.hold = false;
        setEmote({ text: "存好了!", big: true });
        setTimeout(() => setEmote(null), 2400);
      } else if (mood === "celebrate") {
        s.researchUntil = 0; s.props = [];        // 研究收工:放下放大镜再庆祝
        s.state = "celebrate"; s.until = performance.now() + 3600; s.hold = false;
        setEmote({ text: "报告写完啦!", big: true });
        setTimeout(() => setEmote(null), 3600);
      } else if (mood === "eager") {
        // 期待/兴冲冲:任务开跑时。开启研究心跳,bounce 结束后自动切「举放大镜工作」态。
        s.researchUntil = performance.now() + 8000;
        s.state = "eager"; s.until = performance.now() + 2400; s.hold = false;
        setEmote({ text: (e as CustomEvent).detail?.text || "来喽!" });
        setTimeout(() => setEmote(null), 2400);
      } else if (mood === "researching") {
        // 研究进行中心跳(报告页每次轮询派发):续命放大镜。放大镜是叠加层,
        // 可盖在任何待机动作上;但庆祝/期待等「弹跳态」时先不加,免得画面挤。
        s.researchUntil = performance.now() + 8000;
        const bouncing = s.state === "eager" || s.state === "celebrate" || s.state === "happy";
        if (!bouncing) { s.props = ["magnifier"]; if (!s.until) s.state = "work"; }
      } else if (mood === "sigh") {
        s.researchUntil = 0; s.props = [];        // 失败:放下放大镜再叹气
        s.state = "sigh"; s.until = performance.now() + 1800; s.hold = false;
      }
    };
    const track = (e: PointerEvent) => { ptrRef.current = { x: e.clientX, y: e.clientY, at: Date.now() }; };
    window.addEventListener("pointermove", track, { passive: true });
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("xm-pet", onPet);
    // 栖停协议:detail.rect = 目标行 DOMRect;空 = 放开回角落
    const onPerch = (e: Event) => {
      if (dragRef.current || ecoRef.current) return;   // 省流模式不栖停(不产生移动串流)
      const rect = (e as CustomEvent).detail?.rect as DOMRect | undefined;
      const s2 = st.current;
      if (!rect) { setPerch(null); return; }
      s2.state = "idle"; s2.until = 0; s2.hold = false; s2.lastActive = Date.now();
      // 角落基准(right:22 bottom:14,画布 56×64)→ 目标:行右端、脚踩行底线
      const left0 = window.innerWidth - 22 - 56;
      const top0 = window.innerHeight - 14 - 64;
      const mode = (e as CustomEvent).detail?.mode as string | undefined;
      if (mode === "cardfoot") {
        // 趴在卡片右下角内侧,脚踩卡片底边
        setPerch({ dx: Math.round(rect.right - 80 - left0), dy: Math.round(rect.bottom - 62 - top0) });
      } else {
        // 首页切换台行:行尾右端是「徽章 + 箭头」(约 150px 宽),蹲在它们左侧不挡字
        setPerch({ dx: Math.round(rect.right - 215 - left0), dy: Math.round(rect.bottom - 60 - top0) });
      }
      setFlip(false);
    };
    window.addEventListener("xm-pet-perch", onPerch);
    return () => {
      window.removeEventListener("pointermove", track);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("xm-pet", onPet);
      window.removeEventListener("xm-pet-perch", onPerch);
    };
  }, [off]);

  // 菜单开着时,点别处关掉
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.(".pet-menu, .pet-canvas")) setMenu(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  // 主循环:低频定时器(8fps),不用 rAF ——
  // 60fps 的持续重绘在远程桌面 / 跳板环境会把整页拖卡;像素宠物根本不需要那么快。
  useEffect(() => {
    if (off) return;
    const TICK = 125;                       // 8fps 足够所有帧率(最快 FRAME_MS=200)
    const paint = (grid: string[], hop: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, COLS * SCALE, ROWS * SCALE);
      const layer = (g: string[]) => {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const ch = g[r]?.[c];
            if (!ch || ch === ".") continue;
            ctx.fillStyle = PALETTE[ch] ?? "#000";
            ctx.fillRect(c * SCALE, (r + hop) * SCALE, SCALE, SCALE);
          }
        }
      };
      layer(grid);
      // 穿戴装扮(#pet-p2):用户选的头顶 / 脖子,画在情境道具之下。
      // 庆祝博士帽 / 深夜睡帽这类瞬时态,基础帧自带帽子 —— 此时藏掉穿戴帽,免得叠两顶。
      const o = outfitRef.current;
      const baseHatted = st.current.state === "celebrate" || (st.current.state === "sleep" && isNight());
      // 侧躺打盹时身体横铺,竖版衣服对不上 —— 衣服只在站姿系动作叠加
      const lying = st.current.state === "doze";
      if (o.body && !lying && ACCESSORIES[o.body]) layer(ACCESSORIES[o.body].grid);
      if (o.head && !baseHatted && ACCESSORIES[o.head]) layer(ACCESSORIES[o.head].grid);
      if (o.neck && !lying && ACCESSORIES[o.neck]) layer(ACCESSORIES[o.neck].grid);
      // 情境道具(#pet-p1):放大镜 / 咖啡杯,盖在最上。
      for (const id of st.current.props) { const a = ACCESSORIES[id]; if (a) layer(a.grid); }
    };
    const tick = () => {
      if (document.hidden) return;          // 后台标签页零开销
      const s = st.current;
      // 省流模式:定格一帧静态造型,不再逐帧重绘 / 不溜达(远程桌面 / 慢网串流归零)。
      if (ecoRef.current) {
        if (!ecoStaticRef.current) { paint(FRAMES.idle[0], 0); ecoStaticRef.current = true; }
        return;
      }
      ecoStaticRef.current = false;
      const now = performance.now();
      // 状态迁移:定时态到点。**排期(出场表演/做个表情)排在最前** ——
      // 有下一格就走下一格,没有才回待机。
      if (s.until && now > s.until && s.queue.length) {
        const nx = s.queue.shift()!;
        s.state = nx.state; s.until = now + nx.ms; s.hold = false;
        s.frame = 0; s.lastFrame = 0;      // 换表情从第一帧起播,不接着上一个表情的相位
      } else if (s.until && now > s.until) {
        s.until = 0; s.hold = false;
        if (s.researchUntil > now) { s.state = "work"; s.props = ["magnifier"]; }
        else { s.state = "idle"; s.props = []; }
      }
      // 研究心跳过期(页面离开/跑完没通知)→ 自愈放下放大镜
      if (s.researchUntil && now > s.researchUntil) {
        s.researchUntil = 0;
        s.props = s.props.filter((p) => p !== "magnifier");
        if (s.state === "work") s.state = "idle";
      }
      // 待机调度(#pet-p0):心情随「闲多久」推进 —— 惬意 → 无聊 → 犯困 → 睡。
      // 低频(每 tick ~2.4%)、克制;栖停/拖拽/摸头/研究进行中不打扰。
      if (!s.until && s.state !== "drag" && s.state !== "petted" && !perchRef.current && s.researchUntil <= now) {
        const idleMs = Date.now() - s.lastActive;
        const walk = () => { s.state = "walk"; s.until = now + 2200 + Math.random() * 2400; s.dir = Math.random() < 0.5 ? -1 : 1; setFlip(s.dir > 0); };
        if (idleMs > 90_000) {
          s.state = "sleep";
        } else if (s.state === "sleep") {
          s.state = "stretch"; s.until = now + 900;                 // 睡醒先伸个懒腰
        } else if (s.state === "idle" && Math.random() < 0.024) {
          const r = Math.random();
          if (idleMs > 55_000) {
            // 犯困:打哈欠 / 趴下打盹
            if (r < 0.5) { s.state = "yawn"; s.until = now + 1400; }
            else { s.state = "doze"; s.until = now + 5000 + Math.random() * 4000; setFlip(false); } // 侧躺帧头朝左,固定不镜像
          } else if (idleMs > 25_000) {
            // 无聊:东张西望 / 坐下 / 溜达
            if (r < 0.34) { s.state = "bored"; s.until = now + 2600; }
            else if (r < 0.67) { s.state = "sit"; s.until = now + 3500 + Math.random() * 3000; }
            else walk();
          } else {
            // 惬意:大多站着,偶尔伸懒腰 / 坐 / 走 / 做个表情
            // 表情只占约三成 —— 再多就成了「一直在挤眉弄眼」,反而不像活的。
            if (r < 0.3) { s.state = FACES[Math.floor(Math.random() * FACES.length)]; s.until = now + 1500; }
            else if (r < 0.55) { s.state = "stretch"; s.until = now + 800; }
            else if (r < 0.78) { s.state = "sit"; s.until = now + 3000 + Math.random() * 2500; }
            else walk();
          }
        }
      }
      // 走路位移:每 tick 挪 4px(≈32px/s),CSS transition 负责补间;栖停/剧本时不溜达
      if (s.state === "walk" && !s.hold && !perchRef.current) {
        setX((cur) => {
          const nx = cur + s.dir * 4;
          if (nx < -220) { s.dir = 1; setFlip(true); return -220; }
          if (nx > 0) { s.dir = -1; setFlip(false); return 0; }
          return nx;
        });
      }
      // 眼神跟随:鼠标两秒内动过才去量位置(getBoundingClientRect 是强制布局)。
      // 视线方向按**屏幕坐标**算,再换算回画格 —— 画布是 scaleX(-1) 镜像的,
      // 朝右走的时候不换算,眼睛会往反方向看。
      let gx: -1 | 0 | 1 = 0, gy: -1 | 0 | 1 = 0;
      const p = ptrRef.current;
      if (Date.now() - p.at < 2000 && canvasRef.current) {
        const b = canvasRef.current.getBoundingClientRect();
        const dx = p.x - (b.left + b.width / 2), dy = p.y - (b.top + b.height / 2);
        if (Math.hypot(dx, dy) < GAZE_R) {
          // 左右要换算镜像(画布是 scaleX(-1)),**上下不用** —— 镜像只翻横轴。
          if (Math.abs(dx) > GAZE_DEAD) gx = (dx > 0 ? 1 : -1) * (flipRef.current ? -1 : 1) as -1 | 1;
          if (Math.abs(dy) > GAZE_DEAD) gy = (dy > 0 ? 1 : -1) as -1 | 1;
        }
      }
      // 帧推进 + 绘制(只在到点时画,画布仅 56×64)。
      // **视线变了也要重画** —— 否则待机态 480ms 才动一帧,眼珠跟着卡半秒。
      const frames = FRAMES[s.state];
      /**
       * **帧号是上一个状态留下的,先归零再用。**
       *
       * 原来只有「到点换帧」一条画的路径,取模就在那一行,所以帧号永远合法。
       * 加了「视线变了也画」之后多了一条**不经过取模**的路径 ——
       * 从 4 帧的状态切到 2 帧的状态,frames[3] 是 undefined,paint 直接抛。
       * 而它抛在 setInterval 里:定时器照跑,画面停在上一帧,
       * 看上去就是「眼睛偶尔不跟」,一点也不像崩溃。
       */
      if (s.frame >= frames.length) s.frame = 0;
      const stepped = now - s.lastFrame > FRAME_MS[s.state];
      if (stepped || gx !== s.gx || gy !== s.gy) {
        if (stepped) { s.frame = (s.frame + 1) % frames.length; s.lastFrame = now; }
        s.gx = gx; s.gy = gy;
        const grid = s.state === "sleep" && isNight() ? SLEEP_NIGHT : frames[s.frame];
        const hop = (s.state === "happy" || s.state === "eager") && s.frame === 0 ? -4 : 0;   // 单位是画格:28×32 之后一格只有 2px,要 -4 才和以前跳得一样高
        paint(lookAt(grid, gx, gy), hop);
      }
      if (s.state !== faceRef.current) { faceRef.current = s.state; setFace(s.state); }
    };
    const iv = setInterval(tick, TICK);
    return () => clearInterval(iv);
  }, [off]);

  // 不是它的出没范围 —— 什么都不渲染。**必须排在 off 之前判**,
  // 否则「这一页没有它」会被显示成「它回家休息了」。
  if (!belongs) return null;
  if (!host) return null;          // 挂载点还没建好(挂载后的第一帧)

  // 回家休息后:不再彻底消失,留一个低调的「唤回」小按钮,随时点回来(不必清站点数据)
  if (off) {
    return createPortal(
      <button className="pet-recall" type="button"
        onClick={() => { try { window.localStorage.removeItem(OFF_KEY); } catch { /* ignore */ } setOff(false); }}
        title="虾米君回家休息中 —— 点这里把它唤回来">
        <span className="pet-recall-face" aria-hidden>🦐</span>
        <span className="pet-recall-txt">唤回虾米君</span>
      </button>, host);
  }

  function poke() {
    const s = st.current;
    s.lastActive = Date.now(); s.queue = [];
    s.state = "boop";
    s.until = performance.now() + 600;
    setTimeout(() => {
      if (st.current.state === "boop" || st.current.state === "idle") {
        st.current.state = "happy"; st.current.until = performance.now() + 1400;
      }
    }, 600);
    setEmote({ text: TIPS[Math.floor(Math.random() * TIPS.length)] });
    window.clearTimeout((poke as unknown as { t?: number }).t);
    (poke as unknown as { t?: number }).t = window.setTimeout(() => setEmote(null), 4200);
  }

  // 抓起来拖:pointerdown 起手,挪超过 6px 算拖,松手掉落弹地;没挪动算点(boop)
  function onGrab(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY;
    const base: XY = perchRef.current ?? { dx: xRef.current, dy: 0 };
    let moved = false;
    const s = st.current;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      if (!moved) {
        moved = true; dragRef.current = true;
        s.state = "drag"; s.until = 0; s.hold = false;
        setPerch(null); setMenu(false); setEmote(null);
      }
      setDrag({ dx: base.dx + ev.clientX - startX, dy: base.dy + ev.clientY - startY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) { poke(); return; }
      dragRef.current = false;
      // 松手:横向落在放开的位置(限制在屏内),纵向掉回地面弹一下
      const endDx = Math.max(-Math.min(340, window.innerWidth - 130), Math.min(0, base.dx + ev.clientX - startX));
      s.state = "idle"; s.lastActive = Date.now(); s.queue = [];
      setDrag(null);
      setX(endDx);
      setFalling(true);
      setTimeout(() => setFalling(false), 650);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // 摸头:悬停眯眼享受(睡着时会被摸醒 → 伸懒腰交给 tick)
  function onStroke() {
    const s = st.current;
    s.lastActive = Date.now(); s.queue = [];
    if (s.state === "idle" || s.state === "walk") { s.state = "petted"; s.until = 0; }
  }
  function onStrokeEnd() {
    const s = st.current;
    if (s.state === "petted") { s.state = "idle"; s.until = 0; }
  }

  // 丢球 v2:球从随机方向入场(左缘/右缘/高空掉落),真实重力 + 2~3 次弹跳 +
  // 滚动,停在随机落点 —— 不再"落向宠物",而是虾米君跑去接:
  //   · 赶得上第一次弹跳 → 空中起跳接住(球被叼走);
  //   · 到得早 → 在落点仰头等球(eager);到得晚 → 球停了赶过去用头顶。
  // 轨迹由 JS 物理采样 + WAAPI 播放(球是一次性 DOM,播完即删,不进 React)。
  /** 作废上一投:清剧本定时器、旧球快淡出、收掉小跳;并把宠物冻结在当前视觉位置
   *  (追跑用长 transition,直接撤类会瞬移到旧目标 —— 先把 x 定格在此刻的实际坐标)。 */
  function cancelThrow() {
    const c = throwCtx.current;
    if (!c) return;
    c.timers.forEach((id) => clearTimeout(id));
    c.el.style.opacity = "0";
    window.setTimeout(() => c.el.remove(), 240);
    throwCtx.current = null;
    setHopping(false);
    if (!dragRef.current && !perchRef.current) {
      const petEl = document.querySelector<HTMLElement>(".pet");
      if (petEl) {
        const m = new DOMMatrixReadOnly(getComputedStyle(petEl).transform);
        if (Number.isFinite(m.m41)) { xRef.current = m.m41; setX(m.m41); }
      }
    }
    setChaseMs(null);
  }

  function playBall() {
    setMenu(false);
    const s = st.current;
    cancelThrow();                                      // 场上还有球/收尾没播完:立刻中断,接新球
    s.until = 0; s.hold = false;
    s.lastActive = Date.now(); s.queue = [];
    setPerch(null);
    const vw = window.innerWidth, vh = window.innerHeight;
    const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const groundY = vh - 22;                            // 球心贴地(球 13px + 底边距 16)

    // 出手点:左缘 / 右缘 / 高空各随机(高度 22%~67% 视口,高空则横位随机)
    const r = Math.random();
    const x0 = r < 0.38 ? -16 : r < 0.76 ? vw + 16 : vw * (0.15 + Math.random() * 0.7);
    const y0 = r < 0.76 ? vh * (0.22 + Math.random() * 0.45) : -16;
    // 首落点:视口 15%~85%,且与出手点拉开至少 200px(飞出点距离才有"扔"感)
    let land1 = vw * (0.15 + Math.random() * 0.7);
    if (Math.abs(land1 - x0) < 200) land1 = x0 < vw / 2 ? Math.min(vw * 0.85, x0 + 260) : Math.max(vw * 0.15, x0 - 260);

    // 物理采样:重力 + 弹跳(恢复系数 ~0.45)+ 滚动摩擦,记录第一次触地(空接窗口)
    const G = 2400, DT = 1 / 90;
    const T1 = 0.5 + Math.random() * 0.3;
    let vx = (land1 - x0) / T1;
    let vy = (groundY - y0 - 0.5 * G * T1 * T1) / T1;
    const pts: Array<{ x: number; y: number; a: number; t: number }> = [{ x: x0, y: y0, a: 0, t: 0 }];
    const touchdowns: Array<{ t: number; x: number }> = [];   // 前两次触地(扑接窗口)
    let x1 = x0, y1 = y0, t = 0, ang = 0, rolling = false, bounces = 0;
    while (t < 3.5) {
      vy += G * DT; x1 += vx * DT; y1 += vy * DT; ang += vx * DT * 8.8; t += DT;
      // 左右墙壁反弹:球永远停在视口里(否则宠物追到屏幕边也够不着)
      if (x1 < 10) { x1 = 10; vx = Math.abs(vx) * 0.7; }
      else if (x1 > vw - 10) { x1 = vw - 10; vx = -Math.abs(vx) * 0.7; }
      if (y1 >= groundY) {
        y1 = groundY;
        if (!rolling && Math.abs(vy) > 260 && bounces < 3) {
          if (touchdowns.length < 2) touchdowns.push({ t, x: x1 });
          vy = -Math.abs(vy) * (0.4 + Math.random() * 0.12); vx *= 0.74; bounces += 1;
        } else { rolling = true; vy = 0; }
      }
      if (rolling) { vx *= Math.pow(0.12, DT); }
      pts.push({ x: x1, y: y1, a: ang, t });
      if (rolling && Math.abs(vx) < 14) break;
    }
    const total = pts[pts.length - 1].t;
    const restX = pts[pts.length - 1].x;

    // 球:一次性 DOM + WAAPI(左上角定位 + translate 到球心,keyframes 逐段线性)
    const el = document.createElement("div");
    el.className = "pet-ball";
    el.style.cssText = "left:-6px;top:-6px;right:auto;bottom:auto";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    const ctx = { el, timers: [] as number[] };
    throwCtx.current = ctx;
    const later = (fn: () => void, ms: number) => ctx.timers.push(window.setTimeout(fn, ms));
    const speed = reduced ? 0.35 : 1;                   // 减少动态:整体 3 倍速放完
    const kf = pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1).map((p) => ({
      offset: Math.min(1, p.t / total),
      transform: `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.a}deg)`,
    }));
    kf[kf.length - 1].offset = 1;
    el.animate(kf, { duration: (total * 1000) / (speed === 1 ? 1 : 3), easing: "linear", fill: "forwards" });
    const ballMs = (total * 1000) / (speed === 1 ? 1 : 3);
    const cleanup = (fadeAt: number) => {
      later(() => { el.style.opacity = "0"; }, fadeAt);
      later(() => {
        el.remove();
        if (throwCtx.current === ctx) { throwCtx.current = null; setChaseMs(null); }
      }, fadeAt + 620);
    };

    // 宠物:跑向目标(优先赌第一次弹跳的空接;赶不上就奔最终落点)
    const petBase = vw - 50;                            // .pet right:22 + 画布中心 28
    const clampX = (v: number) => Math.max(-(vw - 100), Math.min(0, v));
    const react = 200 + Math.random() * 220;            // 反应半拍
    const RUN = 0.30;                                   // 常速追:≈300px/s
    const SPRINT = 0.46;                                // 扑接冲刺:≈460px/s(拼一把才够得着)
    // 扑接窗口:前两次触地里挑第一个冲刺赶得上的(第二跳时间更宽裕,接得成的多是它)
    const catchable = reduced ? undefined : touchdowns.find((td) => {
      const tk = (td.t * 1000) / (speed === 1 ? 1 : 3);
      return react + Math.abs(clampX(td.x - petBase) - xRef.current) / SPRINT <= tk + 120;
    });
    const canCatch = !!catchable && Math.random() < 0.6;   // 赶得上也不是每次都跳 —— 有悬念
    const tCatch = catchable ? (catchable.t * 1000) / (speed === 1 ? 1 : 3) : 0;
    const targetX = canCatch ? clampX(catchable.x - petBase) : clampX(restX - petBase);
    const dist = Math.abs(targetX - xRef.current);
    const runMs = Math.max(300, Math.min(2600, dist / (canCatch ? SPRINT : RUN)));
    const arriveAt = react + runMs;
    // 会合时刻:空接=第一次弹跳;否则=双方都到位(晚到的一方说了算)
    const meetAt = canCatch ? Math.max(tCatch, arriveAt) : Math.max(ballMs, arriveAt);

    later(() => {                                       // 起跑(拖拽中则不跑,球自己滚完)
      if (dragRef.current) return;
      s.state = "walk"; s.hold = true; s.until = performance.now() + runMs + 60;
      s.dir = targetX > xRef.current ? 1 : -1; setFlip(s.dir > 0);
      setChaseMs(runMs);
      setX(targetX);
    }, react);
    if (!canCatch && arriveAt < ballMs - 150) {
      later(() => {                                     // 到得早:仰头盯球等它落
        if (dragRef.current) return;
        s.state = "eager"; s.hold = true; s.until = performance.now() + (ballMs - arriveAt) + 200;
      }, arriveAt);
    }
    type CatchKind = "air" | "ground";
    const isTouchingBall = () => {
      const br = el.getBoundingClientRect();
      const pr = canvasRef.current?.getBoundingClientRect();
      if (!pr || !el.isConnected) return false;
      const ballX = br.left + br.width / 2;
      const ballY = br.top + br.height / 2;
      const petX = pr.left + pr.width / 2;
      const petMouthY = pr.top + pr.height * 0.62;
      return Math.abs(ballX - petX) <= 38 && Math.abs(ballY - petMouthY) <= 30;
    };
    const caught = (kind: CatchKind) => {
      // 先完成视觉上的「拿到球」,下一拍才庆祝;不能边追球边提前跳。
      setHopping(false);
      el.getAnimations().forEach((a) => a.cancel());
      el.remove();
      setChaseMs(null);
      s.state = "idle"; s.hold = true; s.until = performance.now() + 1800;
      later(() => {
        if (throwCtx.current !== ctx) return;
        s.state = "happy"; s.hold = true; s.until = performance.now() + 1400;
        if (kind === "air") setHopping(true);
      }, 120);
      if (kind === "air") {
        later(() => setEmote({ text: "接住了!⚾" }), 120);
        later(() => setHopping(false), 580);
        later(() => setEmote((e) => (e && e.text.includes("接住") ? null : e)), 1920);
      } else {
        later(() => setEmote({ text: "捡到啦~" }), 120);
        later(() => setEmote((e) => (e && e.text.includes("捡到") ? null : e)), 1520);
      }
      later(() => {
        if (throwCtx.current === ctx) throwCtx.current = null;
      }, kind === "air" ? 1940 : 1540);
    };
    const missed = () => {
      // 最终没碰到:只懊恼收尾,绝不进入 happy / hopping。
      setHopping(false);
      s.state = "sigh"; s.hold = true; s.until = performance.now() + 1500;
      setEmote({ text: "没接到…" });
      setTimeout(() => setEmote((e) => (e && e.text.includes("没接到") ? null : e)), 1600);
      cleanup(620);
    };
    later(() => {                                       // 会合:先验货,够得着才庆祝
      if (dragRef.current) { cleanup(600); return; }
      // 预计会合只决定「何时检查」;成功必须同时满足横向、纵向真实接触。
      // 只量横向会在球还飞着、虾米君还没追完时提前触发庆祝。
      if (isTouchingBall()) { caught(canCatch ? "air" : "ground"); return; }
      // 扑空:懊恼一拍 → 转身追球的最终停点 → 到位后再次实测是否真的捡到。
      s.state = "sigh"; s.hold = true; s.until = performance.now() + 700;
      setEmote({ text: "哎呀,差一点!" });
      setTimeout(() => setEmote((e) => (e && e.text.includes("差一点") ? null : e)), 1400);
      const target2 = clampX(restX - petBase);
      const run2 = Math.max(280, Math.min(2200, Math.abs(target2 - xRef.current) / RUN));
      const wait = 640;                                 // 懊恼节拍
      later(() => {
        if (dragRef.current) { cleanup(400); return; }
        s.state = "walk"; s.hold = true; s.until = performance.now() + run2 + 60;
        s.dir = target2 > xRef.current ? 1 : -1; setFlip(s.dir > 0);
        setChaseMs(run2); setX(target2);
      }, wait);
      // 第二段会合:自己到位且球已停后再验一次距离,不再无条件判成功。
      later(() => {
        if (dragRef.current) { cleanup(400); return; }
        if (isTouchingBall()) caught("ground");
        else missed();
      }, Math.max(wait + run2, ballMs - meetAt + 150));
    }, meetAt);
  }

  // 投喂:一只像素米虾,吃完打个嗝
  function feed() {
    setMenu(false);
    const s = st.current;
    s.lastActive = Date.now(); s.queue = [];
    s.state = "eat"; s.until = performance.now() + 1800; s.hold = true;
    setSnack(true);
    setTimeout(() => {
      setSnack(false);
      setEmote({ text: "嗝~ 谢谢投喂" });
      setTimeout(() => setEmote(null), 2000);
    }, 1800);
  }

  // 喝咖啡(#pet-p1):举起咖啡杯(叠加道具)+ 抿两口,提提神。
  function drink() {
    setMenu(false);
    const s = st.current;
    s.lastActive = Date.now(); s.queue = [];
    s.props = ["coffee"]; s.state = "eat"; s.until = performance.now() + 3000; s.hold = true;
    setTimeout(() => {
      setEmote({ text: "☕ 提提神~" });
      setTimeout(() => setEmote(null), 2000);
    }, 2600);
  }

  /** 做个表情:随机挑一个,不重复上一个。 */
  function makeFace() {
    setMenu(false);
    const s = st.current;
    s.lastActive = Date.now(); s.queue = [];
    const pool = FACES.filter((f) => f !== lastFace.current);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastFace.current = pick;
    s.state = pick; s.until = performance.now() + 1800; s.hold = false; s.props = [];
    s.frame = 0; s.lastFrame = 0;
  }

  function goHome() {
    setMenu(false);
    // 确认弹窗只在第一次出现(告知「唤回」按钮在哪);之后点了就直接回家,不再打扰。
    try {
      if (window.localStorage.getItem("xm:pet:home-hinted") !== "1") {
        if (!window.confirm("让虾米君回家休息?(右下角会留一个「🦐 唤回」小按钮,随时点它请回来)")) return;
        window.localStorage.setItem("xm:pet:home-hinted", "1");
      }
      window.localStorage.setItem(OFF_KEY, "1");
    } catch { /* ignore */ }
    setOff(true);
  }

  const pos: XY = drag ?? perch ?? { dx: x, dy: 0 };
  const cls = ["pet"];
  if (!entered) cls.push("pet-enter");
  if (drag) cls.push("is-dragging");
  else if (falling) cls.push("is-falling");
  else if (perch) cls.push("is-perched");
  if (chaseMs !== null && !drag && !perch) cls.push("is-chasing");

  return createPortal(
    <>
      <div className={cls.join(" ")}
        /* 当前状态挂到 DOM 上:表情是画在 canvas 里的,**从外面看不见** ——
           没有这个属性,「出场表演有没有按顺序演」这件事就没法测,只能靠肉眼盯。 */
        data-face={face}
        style={{ transform: `translate3d(${pos.dx}px, ${pos.dy}px, 0)`,
                 ...(chaseMs !== null ? { "--run-ms": `${chaseMs}ms` } as CSSProperties : {}) }}
        onAnimationEnd={() => setEntered(true)}>
        {emote && <div className={`pet-bubble${emote.big ? " big" : ""}`}>{emote.text}</div>}
        {(face === "sleep" || face === "doze") && <div className="pet-zzz">💤</div>}
        {face === "doze" && <div className="pet-snore" aria-hidden />}
        {DECOR[face] && <div className="pet-emo" aria-hidden>{DECOR[face]}</div>}
        {snack && <div className="pet-snack" aria-hidden>🍤</div>}
        {menu && !picker && (
          <div className="pet-menu" role="menu">
            <button role="menuitem" onClick={playBall}>⚾ 丢个球</button>
            <button role="menuitem" onClick={feed}>🍤 喂一只米虾</button>
            <button role="menuitem" onClick={drink}>☕ 喝杯咖啡</button>
            <button role="menuitem" onClick={makeFace}>🎭 做个表情</button>
            <button role="menuitem" onClick={() => setPicker(true)}>👕 换装…</button>
            <button role="menuitem" onClick={goHome}>🏠 回家休息</button>
          </div>
        )}
        {menu && picker && (
          <div className="pet-menu pet-wardrobe" role="menu">
            <div className="pw-row">
              <span className="pw-lab">头顶</span>
              {HEAD_WEAR.map((o) => (
                <button key={o.id ?? "none"} type="button"
                  className={`pw-chip${outfit.head === o.id ? " on" : ""}`}
                  onClick={() => chooseOutfit({ ...outfit, head: o.id })}>{o.label}</button>
              ))}
            </div>
            <div className="pw-row">
              <span className="pw-lab">脖子</span>
              {NECK_WEAR.map((o) => (
                <button key={o.id ?? "none"} type="button"
                  className={`pw-chip${outfit.neck === o.id ? " on" : ""}`}
                  onClick={() => chooseOutfit({ ...outfit, neck: o.id })}>{o.label}</button>
              ))}
            </div>
            <div className="pw-row">
              <span className="pw-lab">身上</span>
              {BODY_WEAR.map((o) => (
                <button key={o.id ?? "none"} type="button"
                  className={`pw-chip${outfit.body === o.id ? " on" : ""}`}
                  onClick={() => chooseOutfit({ ...outfit, body: o.id })}>{o.label}</button>
              ))}
            </div>
            <div className="pw-row">
              <span className="pw-lab">套装</span>
              {SUITS.map((su) => {
                const on = outfit.head === su.fit.head && outfit.neck === su.fit.neck && outfit.body === su.fit.body;
                return (
                  <button key={su.label} type="button" className={`pw-chip${on ? " on" : ""}`}
                    onClick={() => chooseOutfit(su.fit)}>{su.label}</button>
                );
              })}
            </div>
            <button className="pw-back" type="button" onClick={() => setPicker(false)}>‹ 返回</button>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={COLS * SCALE}
          height={ROWS * SCALE}
          className={`pet-canvas${hopping ? " is-hop" : ""}`}
          // flip 走 CSS 变量:接球小跳的 keyframes 里能同时保住镜像方向
          style={{ "--flip": flip ? -1 : 1 } as CSSProperties}
          onPointerDown={onGrab}
          onPointerEnter={onStroke}
          onPointerLeave={onStrokeEnd}
          onContextMenu={(e) => { e.preventDefault(); setMenu((v) => !v); }}
          title="像素虾米君 · 摸摸 / 抓起来拖 / 右键有菜单"
          aria-label="像素虾米君"
        />
      </div>
    </>, host);
}
