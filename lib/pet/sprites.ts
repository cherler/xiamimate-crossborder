/**
 * 像素虾米君 · 精灵表(#58/#67/#pet-p4)。
 *
 * 形象依据创始人提供的虾米君三视图:橙色圆润身体、两根内卷触须、
 * 黑框圆眼镜、浅色肚皮、深橙小脚。帧为字符矩阵,'.' 透明。
 *
 * ## 为什么从 14×16 换成 28×32(2026-08-19)
 *
 * 老版 224 格里,**黑镜框自己占 30 格,而且它是死的、不能变形**;
 * 真正能改的只有两片镜片内部 6 格加一行嘴 12 格 —— 全画布的 8%。
 * 一双眼睛 6 个格子,一个表情最多动 4 格:实测 `idle` 和 `work` 差 **0 格**,
 * `happy` 和 `eager` 差 2 格。**「表情看不出区别」是算出来的必然,不是画功问题。**
 *
 * 换到 28×32 后表情预算 18 格 → 132 格(15%),而**屏幕上尺寸一格不变** ——
 * pet-widget 的 SCALE 从 4 改成 2,画布仍是 56×64 CSS px。
 *
 * 行位置刻意对齐老版的 2 倍,这样 13 件道具/衣服 2× 放大就能直接对上:
 *
 *   rows 0-7   触须          (老 0-3)
 *   row  8-9   头顶 + 眉毛区  (老 4)     ← 帽子落在这儿
 *   row  10    镜框上缘       (老 5)
 *   rows 11-14 镜片 4 行      (老 6 只有 1 行)
 *   row  15    镜框下缘       (老 7)
 *   rows 16-17 脸颊/腮红      (老 8)     ← 围巾落在这儿
 *   rows 18-20 嘴 3 行        (老 9)
 *   rows 21-22 胸
 *   rows 23-28 肚皮          (老 10-13)
 *   row  29    身底          (老 14)
 *   rows 30-31 脚            (老 15)
 *
 * ## 不再一个状态手画一整格
 *
 * 二十九个状态各写 32 行字符串,没人维护得动,而且改一处形象要改二十九遍。
 * 现在是**姿势 × 眼 × 眉 × 嘴**四层组合:11 种眼 × 5 种眉 × 9 种嘴 × 十来个姿势,
 * 零件加起来不到四十个,能拼出的组合远多于我们用得上的。
 *
 * 想用眼睛看:`node scripts/pet-sheet.mjs`(渲染成一张拼版 PNG,`S=14` 放大)。
 */

export const PALETTE: Record<string, string> = {
  o: "#f59d52",   // 身体橙
  O: "#d1772e",   // 深橙(触须/脚/举起的手臂/腮红)
  b: "#fbc98e",   // 肚皮浅橙
  k: "#2b2530",   // 黑(镜框/嘴)
  w: "#ffffff",   // 眼白 / 闪光
  p: "#6f4a26",   // 瞳仁棕
  R: "#c9503f",   // 睡帽红
  g: "#c8912f",   // 帽穗金 / 闪光 / 星星眼
  B: "#4f8fd0",   // 服装蓝 / 眼泪
  P: "#ef92b8",   // 服装粉 / 爱心眼 / 舌头
};

export type PetState = "idle" | "walk" | "happy" | "sleep" | "work" | "drag" | "petted" | "boop" | "stretch" | "eat" | "celebrate"
  | "sit" | "doze" | "yawn" | "bored" | "eager" | "sigh"
  // #pet-p4 表情扩容
  | "love" | "surprise" | "cool" | "shy" | "cry" | "angry" | "think" | "laugh" | "wave"
  // 28×32 之后新加的(旧分辨率画不出来)
  | "dizzy" | "starry" | "tease";

export const COLS = 28;
export const ROWS = 32;

/* ── 画布助手 ────────────────────────────────────────────────────── */
type G = string[][];
const blank = (): G => Array.from({ length: ROWS }, () => Array<string>(COLS).fill("."));
/** 涂一段横线。越界自动裁掉 —— 手臂、鼓起来的身子都会画到画布边上。 */
const sp = (g: G, y: number, x0: number, x1: number, ch: string) => {
  if (y < 0 || y >= ROWS) return;
  for (let x = Math.max(0, x0); x <= Math.min(COLS - 1, x1); x++) g[y][x] = ch;
};
const out = (g: G): string[] => g.map((r) => r.join(""));
const parse = (rows: string[]): G => rows.map((r) => [...r]);

/* ── 身体 ────────────────────────────────────────────────────────── */
type Feeler = "curl" | "droop" | "up";
/** 触须:环(rows 0-3)+ 杆(rows 4-7)。`droop` 整根往外倒,`up` 炸直成两根杆。 */
function feelers(g: G, kind: Feeler = "curl", dy = 0): G {
  for (const a of [4, 18]) {
    const lean = a < 14 ? -1 : 1;
    if (kind === "up") {
      for (let y = 0; y < 8; y++) for (const x of [a + 2, a + 3]) g[y + dy][x] = y < 5 ? "O" : "o";
      continue;
    }
    const ring = kind === "curl" ? 0 : 2;
    sp(g, ring + dy, a + 1, a + 3, "O");
    for (const y of [ring + 1, ring + 2]) { g[y + dy][a] = "O"; g[y + dy][a + 4] = "O"; }
    sp(g, ring + 3 + dy, a + 1, a + 3, "O");
    for (let y = ring + 4, k = 0; y < 8; y++, k++) {
      const dx = kind === "curl" || k === 0 ? 0 : lean;
      for (const x of [a + 2 + dx, a + 3 + dx]) g[y + dy][x] = y < 6 ? "O" : "o";
    }
  }
  return g;
}

/** 头身一体的圆润方块。`arms` 是垂在两侧的手,`belly` 是浅色肚皮。 */
function body(g: G, { top = 8, bottom = 29, arms = true, belly = true } = {}): G {
  for (let y = top; y <= bottom; y++) sp(g, y, 2, 25, "o");
  if (arms) for (let y = 23; y <= 27; y++) { sp(g, y, 0, 1, "o"); sp(g, y, 26, 27, "o"); }
  if (belly) {
    sp(g, 23, 7, 20, "b");
    for (let y = 24; y <= 28; y++) sp(g, y, 5, 22, "b");
    sp(g, 29, 7, 20, "b");
  }
  return g;
}

/** 细边圆框 + 6×4 的大镜片。**边框只有 1px** —— 老版是实心黑条,把整张脸吃掉了。 */
function glasses(g: G, y0 = 10): G {
  for (const [l, r] of [[3, 10], [17, 24]]) {
    sp(g, y0, l + 1, r - 1, "k"); sp(g, y0 + 5, l + 1, r - 1, "k");
    for (let y = y0 + 1; y <= y0 + 4; y++) { g[y][l] = "k"; g[y][r] = "k"; sp(g, y, l + 1, r - 1, "w"); }
  }
  for (const y of [y0 + 2, y0 + 3]) { sp(g, y, 11, 16, "k"); sp(g, y, 0, 2, "k"); sp(g, y, 25, 27, "k"); }
  return g;
}

function feet(g: G, kind: "stand" | "l" | "r" | "wide" = "stand", dy = 0): G {
  const pairs = { stand: [[5, 10], [17, 22]], l: [[3, 8], [18, 23]], r: [[6, 11], [20, 25]], wide: [[1, 7], [20, 26]] }[kind];
  for (const y of [30 + dy, 31 + dy]) for (const [a, b] of pairs) sp(g, y, a, b, "O");
  return g;
}

/** 举起的手臂。**用深橙**:和身体同色又贴在一起,不管留不留空都看不出是手(实测过)。 */
const arm = (g: G, side: "l" | "r" | "both", y0: number, y1: number): G => {
  for (let y = y0; y <= y1; y++) {
    if (side !== "r") sp(g, y, 0, 1, "O");
    if (side !== "l") sp(g, y, 26, 27, "O");
  }
  return g;
};
const dropArms = (g: G, side: "l" | "r" | "both" = "both"): G => {
  for (let y = 23; y <= 27; y++) {
    if (side !== "r") sp(g, y, 0, 1, ".");
    if (side !== "l") sp(g, y, 26, 27, ".");
  }
  return g;
};

const stand = (fe: Feeler = "curl", ft: "stand" | "l" | "r" | "wide" = "stand"): G =>
  feet(glasses(body(feelers(blank(), fe))), ft);
const armsUp = (g: G, side: "l" | "r" | "both" = "both"): G => arm(dropArms(g, side), side, 11, 17);
const waveLow = (g: G): G => arm(dropArms(g, "r"), "r", 15, 21);
/** 双手贴到脸颊。比举手低、比垂手高 —— 位置就是它和「举手」的全部区别。 */
const cheeks = (g: G): G => arm(dropArms(g), "both", 16, 20);
/** 鼓起来:身子涨到满宽。**这个尺寸下姿态永远比五官好认。** */
function puff(g: G): G {
  // 从**脸颊**就开始鼓,不只是肚子 —— 只鼓下半身和垂着的手臂几乎分不出来(实测)。
  for (let y = 16; y <= 29; y++) sp(g, y, 0, 27, "o");
  sp(g, 23, 5, 22, "b");
  for (let y = 24; y <= 28; y++) sp(g, y, 3, 24, "b");
  sp(g, 29, 5, 22, "b");
  return g;
}
/** 坐下:整体沉两行、屁股摊到满宽、双脚朝外岔开。脸也要跟着沉(face 的 dy=2)。 */
function sitPose(): G {
  const g = feelers(blank(), "curl", 2);
  body(g, { top: 10, belly: false });
  for (let y = 28; y <= 29; y++) sp(g, y, 0, 27, "o");
  sp(g, 25, 7, 20, "b");
  for (let y = 26; y <= 28; y++) sp(g, y, 5, 22, "b");
  return feet(glasses(g, 12), "wide");
}
/** 被拎起来:**脚蜷起来离地**。脚还踩在地上的话,和站着一模一样。 */
function hang(sway = 0): G {
  const g = glasses(body(feelers(blank()), { bottom: 27 }));
  for (const y of [28, 29]) { sp(g, y, 6 + sway, 11 + sway, "O"); sp(g, y, 17 + sway, 22 + sway, "O"); }
  return g;
}
/** 侧躺打盹:整个横过来,头在左、闭眼、身子横铺、触须朝上、脚蜷起。d=1 是呼吸帧。 */
function lying(d = 0): string[] {
  const g = blank();
  sp(g, 9 + d, 3, 5, "O"); g[10 + d][2] = "O"; g[10 + d][6] = "O";
  sp(g, 11 + d, 3, 5, "O");
  for (const y of [12 + d, 13 + d]) sp(g, y, 4, 5, "O");
  for (let y = 14 + d; y <= 24 + d; y++) sp(g, y, y < 15 + d ? 3 : 2, y < 15 + d ? 13 : 25, "o");
  sp(g, 25 + d, 4, 23, "o");
  for (let y = 16 + d; y <= 18 + d; y++) sp(g, y, 2, 8, "k");
  sp(g, 17 + d, 3, 7, "w"); sp(g, 17 + d, 4, 6, "k");
  for (let y = 20 + d; y <= 23 + d; y++) sp(g, y, 10, 23, "b");
  for (const y of [26 + d, 27 + d]) { sp(g, y, 8, 12, "O"); sp(g, y, 16, 20, "O"); }
  return out(g);
}

/* ── 脸 ──────────────────────────────────────────────────────────── */
/** 两片镜片内部的起始列。镜片是 6 宽 × 4 高。 */
const LENS = [4, 18];
const EYE_TOP = 11;          // 站姿时镜片内部的第一行

export type EyeKind = "gaze" | "closed" | "smile" | "squint" | "wide" | "heart" | "dark" | "star" | "dizzy";
/**
 * 眼睛。`gaze` 是睁着的正常眼,瞳仁位置由 (dx, dy) 决定 ——
 * **三列 × 三行九个方向**,老版只有左中右三个。
 */
function eyes(g: G, kind: EyeKind, r = EYE_TOP, dx = 0, dy = 0): G {
  for (const a of LENS) {
    for (let y = r; y <= r + 3; y++) sp(g, y, a, a + 5, "w");
    const b = a + 5;
    if (kind === "gaze") {
      const px = a + 2 + dx * 2, py = r + 1 + dy;
      sp(g, py, px, px + 1, "p"); sp(g, py + 1, px, px + 1, "p");
    } else if (kind === "wide") {                       // 吓一跳:只剩一点小瞳孔
      sp(g, r + 1, a + 2, a + 3, "p");
    } else if (kind === "closed") {                     // 闭眼:下弯的弧
      g[r + 1][a] = "k"; g[r + 1][b] = "k"; sp(g, r + 2, a + 1, a + 4, "k");
    } else if (kind === "smile") {                      // 眯眼笑:上弯的弧
      g[r + 2][a] = "k"; g[r + 2][b] = "k"; sp(g, r + 1, a + 1, a + 4, "k");
    } else if (kind === "squint") {
      sp(g, r + 1, a, b, "k");
    } else if (kind === "heart") {
      sp(g, r, a + 1, a + 2, "P"); sp(g, r, a + 3, a + 4, "P");
      sp(g, r + 1, a, b, "P"); sp(g, r + 2, a + 1, a + 4, "P"); sp(g, r + 3, a + 2, a + 3, "P");
    } else if (kind === "dark") {
      for (let y = r; y <= r + 3; y++) sp(g, y, a, b, "k");
    } else if (kind === "star") {
      sp(g, r, a + 2, a + 3, "g"); sp(g, r + 1, a, b, "g");
      sp(g, r + 2, a + 1, a + 4, "g"); g[r + 3][a + 1] = "g"; g[r + 3][a + 4] = "g";
    } else if (kind === "dizzy") {                      // ✕ 眼
      for (let i = 0; i < 4; i++) { g[r + i][a + 1 + i] = "k"; g[r + i][b - 1 - i] = "k"; }
    }
  }
  return g;
}

export type BrowKind = "angry" | "up" | "sad" | "one";
/** 眉毛在 rows 8-9(镜框正上方)。**平时没有眉毛 —— 有眉毛本身就是信息。** */
function brow(g: G, kind: BrowKind, dy = 0): G {
  const y1 = 8 + dy, y2 = 9 + dy;
  if (kind === "angry") {                               // 内低外高
    sp(g, y2, 6, 10, "k"); sp(g, y1, 6, 8, "k"); sp(g, y1, 3, 5, "k");
    sp(g, y2, 17, 21, "k"); sp(g, y1, 19, 21, "k"); sp(g, y1, 22, 24, "k");
  } else if (kind === "up") {                           // 惊讶:整条抬高
    sp(g, y1, 4, 9, "k"); sp(g, y1, 18, 23, "k");
  } else if (kind === "sad") {                          // 八字眉:内高外低
    sp(g, y1, 7, 10, "k"); sp(g, y2, 4, 6, "k");
    sp(g, y1, 17, 20, "k"); sp(g, y2, 21, 23, "k");
  } else if (kind === "one") {                          // 挑一边:琢磨 / 坏笑
    sp(g, y1, 4, 9, "k");
  }
  return g;
}

export type MouthKind = "smile" | "grin" | "small" | "o" | "flat" | "wavy" | "smirk" | "shout" | "tongue";
/** 嘴占 rows 18-20,脸中线在 col 13/14。 */
function mouth(g: G, kind: MouthKind, dy = 0): G {
  const c = 13, y0 = 18 + dy, y1 = 19 + dy, y2 = 20 + dy;
  if (kind === "smile") { g[y0][c - 4] = "k"; sp(g, y1, c - 3, c + 4, "k"); g[y0][c + 5] = "k"; }
  else if (kind === "grin") { sp(g, y0, c - 4, c + 5, "k"); sp(g, y1, c - 4, c + 5, "k"); sp(g, y2, c - 3, c + 4, "k"); }
  else if (kind === "small") sp(g, y1, c, c + 1, "k");
  else if (kind === "o") { sp(g, y0, c, c + 1, "k"); sp(g, y1, c, c + 1, "k"); }
  else if (kind === "flat") sp(g, y1, c - 3, c + 4, "k");
  else if (kind === "wavy") {
    g[y1][c - 4] = "k"; sp(g, y0, c - 2, c - 1, "k"); sp(g, y1, c, c + 1, "k");
    sp(g, y0, c + 2, c + 3, "k"); g[y1][c + 5] = "k";
  } else if (kind === "smirk") { sp(g, y1, c - 1, c + 4, "k"); g[y0][c + 5] = "k"; }
  else if (kind === "shout") { sp(g, y0, c - 6, c + 7, "k"); sp(g, y1, c - 6, c + 7, "k"); sp(g, y2, c - 5, c + 6, "k"); }
  else if (kind === "tongue") { sp(g, y0, c - 3, c + 4, "k"); sp(g, y1, c - 1, c + 2, "P"); sp(g, y2, c - 1, c + 2, "P"); }
  return g;
}

const blush = (g: G, dy = 0): G => {
  for (const y of [16 + dy, 17 + dy]) { sp(g, y, 3, 5, "O"); sp(g, y, 22, 24, "O"); }
  return g;
};
const tears = (g: G, dy = 0): G => {
  for (const y of [16 + dy, 17 + dy]) { sp(g, y, 5, 6, "B"); sp(g, y, 21, 22, "B"); }
  return g;
};

type Face = { eye?: EyeKind; dx?: number; dy?: number; br?: BrowKind; mo?: MouthKind; blush?: boolean; tear?: boolean; drop?: number; wink?: boolean };
/** 把一张脸画到姿势上。`drop` 是整张脸的下移量(坐姿用 2)。 */
function face(g: G, f: Face = {}): string[] {
  const d = f.drop ?? 0;
  eyes(g, f.eye ?? "gaze", EYE_TOP + d, f.dx ?? 0, f.dy ?? 0);
  // **眨眼要画在 eyes() 之后。** 反过来会被 eyes() 整个盖掉,而 boop 照样能播、
  // 只是没眨眼 —— 又一个「坏了不报错」。
  if (f.wink) winkEye(g, EYE_TOP + d);
  if (f.br) brow(g, f.br, d);
  mouth(g, f.mo ?? "smile", d);
  if (f.blush) blush(g, d);
  if (f.tear) tears(g, d);
  return out(g);
}

/** 眨一只眼。`eyes()` 两只眼总是一样,单眼只能事后盖掉一只。 */
function winkEye(g: G, r = EYE_TOP): G {
  const a = LENS[0], b = a + 5;
  for (let y = r; y <= r + 3; y++) sp(g, y, a, b, "w");
  g[r + 1][a] = "k"; g[r + 1][b] = "k"; sp(g, r + 2, a + 1, a + 4, "k");
  return g;
}
/** 头顶两簇金色闪光。**不用白色** —— 页面底色是浅的,白的等于没画(老版 eager 一直有这毛病)。 */
const spark = (g: G): G => {
  for (const y of [8, 9]) { sp(g, y, 0, 1, "g"); sp(g, y, 26, 27, "g"); }
  return g;
};
/** 博士帽(庆祝用):盖住触须的黑板 + 一根金穗。 */
function gradCap(g: G): G {
  for (let y = 4; y <= 5; y++) sp(g, y, 1, 26, "k");
  for (let y = 6; y <= 7; y++) sp(g, y, 6, 21, "k");
  for (let y = 6; y <= 9; y++) sp(g, y, 1, 2, "g");
  return g;
}
/** 夜间睡帽。 */
function nightCap(g: G): G {
  sp(g, 2, 18, 21, "R"); sp(g, 3, 15, 22, "R"); sp(g, 3, 23, 24, "w");
  for (let y = 4; y <= 5; y++) sp(g, y, 8, 22, "R");
  for (let y = 6; y <= 7; y++) sp(g, y, 4, 24, "R");
  return g;
}

/* ── 二十九个状态 = 姿势 × 眼 × 眉 × 嘴 ──────────────────────────── */
const F = (g: G, f?: Face) => face(g, f);

const IDLE = F(stand());
const BLINK = F(stand(), { eye: "closed" });

export const FRAMES: Record<PetState, string[][]> = {
  idle: [IDLE, BLINK, IDLE, IDLE],                       // 偶尔眨眼,不是一直眨
  walk: [F(stand("curl", "l")), F(stand("curl", "r"))],
  happy: [F(armsUp(stand()), { eye: "smile", mo: "grin" }), IDLE],
  sleep: [F(stand("droop"), { eye: "closed", mo: "o" })],
  // 专心:眯眼 + 抿嘴。老版这两帧和 idle **一模一样**(实测差 0 格),
  // 全靠举着的放大镜区分 —— 14 宽画不出「在专心」,现在能了。
  work: [F(stand(), { eye: "squint", mo: "small" }), F(stand("curl", "r"), { eye: "squint", mo: "small" })],
  drag: [F(hang(0), { eye: "gaze", dy: -1, mo: "o" }), F(hang(1), { eye: "gaze", dy: -1, mo: "o" })],
  petted: [F(stand(), { eye: "closed", blush: true })],
  boop: [F(stand(), { wink: true, mo: "smirk" })],
  stretch: [F(armsUp(stand()), { eye: "closed", mo: "small" })],
  eat: [F(stand(), { mo: "o" }), IDLE],
  celebrate: [F(gradCap(armsUp(stand())), { eye: "star", mo: "grin" }), F(gradCap(stand()), { eye: "star" })],
  sit: [F(sitPose(), { drop: 2 })],
  doze: [lying(0), lying(1)],
  yawn: [F(stand(), { eye: "squint", mo: "grin" }), F(stand(), { eye: "squint", mo: "grin" }), F(stand(), { eye: "squint", mo: "o" })],
  bored: [F(stand(), { dx: -1 }), F(stand("curl", "r"), { dx: 1 })],
  eager: [F(spark(armsUp(stand())), { eye: "star", mo: "grin" }), F(armsUp(stand()), { mo: "grin" })],
  sigh: [F(stand("droop"), { eye: "closed", mo: "flat" }), F(stand("droop"), { eye: "gaze", dy: 1, mo: "flat" })],

  love: [F(stand(), { eye: "heart", mo: "grin", blush: true }), F(stand(), { eye: "heart", mo: "smile", blush: true })],
  surprise: [F(spark(stand("up")), { eye: "wide", br: "up", mo: "o" }), F(stand("up"), { eye: "wide", br: "up", mo: "o" })],
  cool: [F(stand(), { eye: "dark", mo: "smirk" }), F(spark(stand()), { eye: "dark", mo: "smirk" }),
         F(stand(), { eye: "dark", mo: "smirk" }), F(stand(), { eye: "dark", mo: "smirk" })],
  shy: [F(cheeks(stand("droop")), { eye: "closed", mo: "small", blush: true }),
        F(cheeks(stand("droop")), { eye: "gaze", dy: 1, mo: "small", blush: true })],
  cry: [F(stand("droop"), { dy: 1, br: "sad", mo: "wavy", tear: true }),
        F(stand("droop"), { eye: "closed", br: "sad", mo: "wavy" })],
  angry: [F(puff(stand("up")), { br: "angry", mo: "shout" }), F(puff(stand("up")), { br: "angry", mo: "flat" })],
  think: [F(stand(), { dx: 1, dy: -1, br: "one", mo: "small" }), F(stand(), { dx: 1, dy: -1, br: "one", mo: "small" }),
          F(stand(), { dx: -1, dy: -1, br: "one", mo: "small" }), F(stand(), { dx: -1, dy: -1, br: "one", mo: "small" })],
  laugh: [F(armsUp(stand("droop")), { eye: "closed", mo: "shout" }), F(armsUp(stand()), { eye: "smile", mo: "grin" })],
  wave: [F(armsUp(stand(), "r"), { eye: "smile" }), F(waveLow(stand()), { eye: "smile" })],

  dizzy: [F(stand("up"), { eye: "dizzy", mo: "wavy" }), F(stand("droop"), { eye: "dizzy", mo: "wavy" })],
  starry: [F(stand(), { eye: "star", mo: "grin" }), F(armsUp(stand()), { eye: "star", mo: "grin" })],
  tease: [F(stand(), { wink: true, mo: "tongue" }), F(stand(), { eye: "smile", mo: "tongue" })],
};

/** 夜间睡帽版(23 点后)。 */
export const SLEEP_NIGHT: string[] = F(nightCap(stand("droop")), { eye: "closed", mo: "o" });

/** 状态节奏(ms/帧)。静态休息态给长间隔,少重绘。 */
export const FRAME_MS: Record<PetState, number> = {
  idle: 480, walk: 300, happy: 200, sleep: 1200, work: 260,
  drag: 260, petted: 900, boop: 500, stretch: 700, eat: 240, celebrate: 220,
  sit: 1000, doze: 1200, yawn: 320, bored: 700, eager: 200, sigh: 500,
  love: 420, surprise: 260, cool: 340, shy: 560, cry: 620,
  angry: 220, think: 500, laugh: 200, wave: 240,
  dizzy: 300, starry: 260, tease: 380,
};

/* ── 眼神跟随 ────────────────────────────────────────────────────── */
/**
 * 把睁着的那双眼睛的瞳仁挪一格。**九个方向**(三列 × 三行)——
 * 老版镜片只有 1 行,只能左中右;现在 4 行,上下也能看。
 *
 * ## 为什么是白名单,不是「看到瞳仁就挪」
 *
 * 闭眼、墨镜、爱心眼、✕ 眼**各自就是表情本身**,挪瞳仁只会把表情弄坏
 * (墨镜里根本没有瞳仁,爱心眼挪一格成斗鸡眼)。所以先认出「正视」那一双,
 * 认不出就原样返回。
 *
 * 行号是**找**出来的,不写死 —— 坐姿整体沉两行,眼睛在第 13 行。
 */
const eyeSig = (rows: string[], r: number): string =>
  rows.slice(r, r + 4).map((row) => LENS.map((a) => row.slice(a, a + 6)).join("|")).join("/");
/** 「正视」的样子,从一张现画的站姿上取 —— 手写签名会和 eyes() 的实现悄悄脱节。 */
const MID_SIG = eyeSig(IDLE, EYE_TOP);

export function lookAt(grid: string[], dx: -1 | 0 | 1, dy: -1 | 0 | 1 = 0): string[] {
  if (dx === 0 && dy === 0) return grid;
  let r = -1;
  for (let y = 0; y + 3 < ROWS; y++) if (eyeSig(grid, y) === MID_SIG) { r = y; break; }
  if (r < 0) return grid;
  const g = parse(grid);
  eyes(g, "gaze", r, dx, dy);
  return out(g);
}

/* ── 道具叠加层(#pet-p1 / 重画于 #pet-p5)──────────────────────────── */
/**
 * 与身体同尺寸的覆盖矩阵,'.' 透明。画完基础帧后按需叠加(后者盖前者)。
 * 一件道具画一次,配任何动作都能用,避免「动作 × 道具」组合爆炸。
 *
 * ## 为什么全部重画,而不是把 14×16 的原稿放大两倍
 *
 * 换分辨率时先试的是「2× 放大 + 逐件补一个下移量」。**行位置能对上,宽度对不上** ——
 * 老稿是照老身形画的,而新身体的轮廓变了:水手衫和裙子会横着戳出身体边缘,
 * 草帽悬在头顶上方够不着头,项链飘在胸口正中。使用者的原话是「穿上衣服不贴身」。
 *
 * 衣服贴不贴身,取决于它的**每一行左右边界和身体那一行对不对得上** ——
 * 这件事放大器做不到,只能照着轮廓重画。所以下面这些数不是随手写的:
 * 它们直接来自 `body()` / `feet()` 画出来的边界(见 BODY_* 常量)。
 * 改身形就要回来改这里,`npm run pet:sheet` 一眼看得出对不对。
 */
export type AccessorySlot = "head" | "neck" | "body" | "hand" | "fx";

/** 身体轮廓的关键边界。**衣服的左右必须引用这些,不许另写字面量。** */
const BODY_L = 2, BODY_R = 25;      // 躯干左右(rows 8–29)
const ARM_L = 0, ARM_R = 27;        // 连手臂的最宽处(rows 23–27)
const HEAD_TOP = 8;                 // 头顶那一行 —— 帽子要压住它才不悬空
const CHEST = 21;                   // 嘴以下、肚皮以上的一条,围巾/领结/项链落这儿

const acc = (slot: AccessorySlot, draw: (g: G) => void) => {
  const g = blank();
  draw(g);
  return { slot, grid: out(g) };
};

export const ACCESSORIES: Record<string, { slot: AccessorySlot; grid: string[] }> = {
  /* ── 头顶 ────────────────────────────────────────────────────── */
  // 草帽:圆顶 + 束带 + 宽帽檐。**帽檐要压到 HEAD_TOP**,否则看着是浮在头上方。
  strawhat: acc("head", (g) => {
    sp(g, 3, 10, 17, "g");
    for (const y of [4, 5]) sp(g, y, 8, 19, "g");
    sp(g, 6, 8, 19, "O");                       // 束带
    sp(g, 7, 4, 23, "g");
    sp(g, HEAD_TOP, BODY_L, BODY_R, "g");       // 帽檐与头同宽
  }),
  // 派对帽:红金圆锥,落在两根触须之间(触须占 cols 4–9 与 18–23)
  partyhat: acc("head", (g) => {
    sp(g, 2, 13, 14, "R");
    sp(g, 3, 12, 15, "R"); g[3][13] = "g"; g[3][14] = "g";
    sp(g, 4, 11, 16, "R");
    sp(g, 5, 10, 17, "R"); sp(g, 5, 12, 15, "g");
    sp(g, 6, 9, 18, "R");
    sp(g, 7, 8, 19, "R"); sp(g, 7, 11, 16, "g");
    sp(g, HEAD_TOP, 7, 20, "R");
  }),
  // 蝴蝶结:两个环 + 中结,夹在触须中间
  bow: acc("head", (g) => {
    // 两个环和中结之间**要留出 col 12 / 15 两道空**,不留就糊成一个粉色碗(实测)
    sp(g, 5, 8, 10, "P"); sp(g, 5, 17, 19, "P");
    sp(g, 6, 7, 11, "P"); sp(g, 6, 16, 20, "P");
    sp(g, 7, 8, 10, "P"); sp(g, 7, 17, 19, "P");
    for (const y of [6, 7]) sp(g, y, 13, 14, "P");   // 中结
    sp(g, HEAD_TOP, 12, 15, "P");
  }),
  // 小皇冠:三个尖 + 束带
  crown: acc("head", (g) => {
    sp(g, 5, 8, 8, "g"); sp(g, 5, 13, 14, "g"); sp(g, 5, 19, 19, "g");
    sp(g, 6, 8, 9, "g"); sp(g, 6, 12, 15, "g"); sp(g, 6, 18, 19, "g");
    sp(g, 7, 8, 19, "g");
    sp(g, HEAD_TOP, 8, 19, "g");
  }),
  // 贝雷帽:红色扁帽 + 小柄,略偏一边
  beret: acc("head", (g) => {
    g[3][17] = "k"; g[4][17] = "k";
    sp(g, 5, 9, 19, "R");
    sp(g, 6, 7, 20, "R");
    sp(g, 7, 6, 21, "R");
    sp(g, HEAD_TOP, 6, 21, "R");
  }),

  /* ── 脖子(其实是胸口那一条:这个形象没有脖子)────────────────── */
  // 围巾:绕一圈 + 一端垂下。**不许压到嘴(rows 18–20)**,所以落在 CHEST。
  scarf: acc("neck", (g) => {
    for (const y of [CHEST, CHEST + 1]) sp(g, y, BODY_L, BODY_R, "R");
    for (let y = CHEST + 2; y <= CHEST + 5; y++) sp(g, y, 4, 6, "R");   // 垂下的一端
  }),
  // 领结:两片 + 中结
  bowtie: acc("neck", (g) => {
    sp(g, CHEST, 9, 11, "R"); sp(g, CHEST, 16, 18, "R");
    sp(g, CHEST + 1, 9, 12, "R"); sp(g, CHEST + 1, 15, 18, "R");
    sp(g, CHEST + 2, 9, 11, "R"); sp(g, CHEST + 2, 16, 18, "R");
    for (const y of [CHEST, CHEST + 1, CHEST + 2]) sp(g, y, 13, 14, "R");
  }),
  // 珍珠项链:五颗 2×2 的珠子,以 13/14 为轴对称
  pearls: acc("neck", (g) => {
    for (const x of [5, 9, 13, 17, 21]) for (const y of [CHEST, CHEST + 1]) sp(g, y, x, x + 1, "w");
  }),

  /* ── 身上 ────────────────────────────────────────────────────── */
  // 背带裤:两条背带 + 整条包住下半身,裤脚在中间分叉。**手臂那几行不覆盖**(是背带裤不是连体衣)
  overalls: acc("body", (g) => {
    for (let y = 16; y <= 20; y++) { sp(g, y, 6, 7, "B"); sp(g, y, 20, 21, "B"); }
    for (const y of [19, 20]) { g[y][6] = "w"; g[y][21] = "w"; }        // 扣子
    for (let y = CHEST; y <= 29; y++) sp(g, y, BODY_L, BODY_R, "B");
    for (const y of [28, 29]) sp(g, y, 12, 15, ".");                    // 裤脚分叉
  }),
  // 小裙子:上身收窄、下摆比身体还宽的大摆
  dress: acc("body", (g) => {
    for (let y = CHEST; y <= 22; y++) sp(g, y, 6, 21, "P");
    for (let y = 23; y <= 27; y++) sp(g, y, BODY_L, BODY_R, "P");
    for (const y of [28, 29]) sp(g, y, ARM_L, ARM_R, "P");              // 外撇的下摆
    for (const y of [24, 25]) { sp(g, y, 8, 9, "w"); sp(g, y, 18, 19, "w"); }
  }),
  // 水手衫:横条纹。**手臂那几行要一起盖**(袖子),否则像围了条浴巾
  sailor: acc("body", (g) => {
    const 宽 = (y: number): [number, number] => (y >= 23 && y <= 27 ? [ARM_L, ARM_R] : [BODY_L, BODY_R]);
    for (let y = CHEST; y <= 29; y++) {
      const [a, b] = 宽(y);
      sp(g, y, a, b, Math.floor((y - CHEST) / 2) % 2 === 0 ? "w" : "B");
    }
  }),
  // 小披风:肩上一道系带 + 两侧垂到底、下摆外撇(正面看得见披风包着身体两侧)
  cape: acc("body", (g) => {
    // 系带落在 CHEST,**不能放 rows 19–20** —— 那是嘴,压上去笑容就没了(渲出来才看见)
    for (const y of [CHEST, CHEST + 1]) sp(g, y, 4, 23, "R");
    for (let y = 23; y <= 27; y++) { sp(g, y, ARM_L, 5, "R"); sp(g, y, 22, ARM_R, "R"); }
    for (const y of [28, 29]) { sp(g, y, BODY_L, 6, "R"); sp(g, y, 21, BODY_R, "R"); }
  }),

  /* ── 手里(情境道具,不是穿戴)────────────────────────────────── */
  // 咖啡杯:举在右手边,带热气
  coffee: acc("hand", (g) => {
    g[19][26] = "w"; g[20][25] = "w"; g[21][26] = "w";                  // 热气
    sp(g, 22, 23, 27, "k");
    for (let y = 23; y <= 26; y++) { g[y][23] = "k"; g[y][27] = "k"; sp(g, y, 24, 26, "p"); }
    sp(g, 27, 23, 27, "k");
  }),
  // 放大镜:举在右上,避开右触须(cols 18–23)
  magnifier: acc("hand", (g) => {
    sp(g, 2, 23, 26, "k");
    for (let y = 3; y <= 6; y++) { g[y][22] = "k"; g[y][27] = "k"; sp(g, y, 23, 26, "w"); }
    sp(g, 7, 23, 26, "k");
    // 柄要用黑,不能用深橙:rows 8+ 已经是头,深橙压在橙上等于没画
    for (let y = 8; y <= 10; y++) sp(g, y, 26, 27, "k");
  }),
};
