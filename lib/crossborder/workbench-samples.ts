/**
 * 三个工作台的一键示例(#探索)。
 *
 * 让用户不用自备数据也能快速跑一遍完整流程,并覆盖多个品类/诉求类型。
 * Listing 示例里故意埋了「无事实支撑的夸大声明」,好让诊断当场抓住 —— 示例本身就是教学。
 */

import { seededProject, type ProductProject } from "./product-facts";

/* ---------------- Listing 诊断与改写 ---------------- */

function withFacts(base: ProductProject, vals: Record<string, string>): ProductProject {
  const now = Date.now();
  return {
    ...base,
    facts: base.facts.map((f) =>
      vals[f.key] != null
        ? { ...f, value: vals[f.key], status: "confirmed", source: "user", sourceNote: "示例数据", confidence: "high", updatedAt: now }
        : f),
    updatedAt: now,
  };
}

export type ListingSample = { id: string; label: string; build: () => ProductProject };

export const LISTING_SAMPLES: ListingSample[] = [
  {
    id: "bottle",
    label: "保温水杯(埋了夸大声明)",
    build: () => ({
      ...withFacts(seededProject("p1", "AquaPeak 32oz 保温运动水杯"), {
        material: "304 食品级不锈钢",
        capacity: "32oz / 946ml",
        dimensions: "27.9 × 8.9 × 8.9 cm",
        weight: "0.42 kg(空杯)",
        color: "黑 / 雾蓝 / 藕粉",
        package_contents: "水杯 ×1、备用吸管 ×1、清洁刷 ×1",
        waterproof: "防泼溅,非完全防漏",
        certification: "BPA-Free",
        care: "杯身手洗,勿泡洗碗机",
      }),
      category: "Water Bottles",
      keywords: ["insulated water bottle", "32oz water bottle", "sports water bottle"],
      // 故意埋雷:100% leak-proof / medical grade / lifetime warranty 都无事实支撑 → 诊断当场抓
      listing: {
        title: "AquaPeak 32oz Water Bottle - 100% Leak-Proof, Medical Grade Steel, Lifetime Warranty",
        bullets: [
          "100% leak-proof lid, never ever spills",
          "Medical grade stainless steel, doctor recommended",
          "Keeps drinks cold for 48 hours guaranteed",
          "Lifetime warranty with full refund anytime",
        ],
      },
    }),
  },
  {
    id: "earbuds",
    label: "蓝牙耳机(缺证据的卖点)",
    build: () => ({
      ...withFacts(seededProject("p1", "SonicPods Pro 无线蓝牙耳机"), {
        material: "ABS + 硅胶耳塞",
        weight: "单只 4.5g",
        color: "白 / 黑",
        package_contents: "耳机 ×2、充电仓 ×1、耳塞 3 组、Type-C 线",
        waterproof: "IPX4(防汗防泼溅)",
        certification: "CE / FCC",
        compatibility: "蓝牙 5.3,iOS / Android 通用",
        care: "湿布擦拭,勿水洗充电仓",
      }),
      category: "Earbuds & Headphones",
      keywords: ["wireless earbuds", "bluetooth earbuds", "noise cancelling earbuds"],
      // 埋雷:waterproof 与 IPX4 冲突、battery 无事实、绝对化「blocks all noise」
      listing: {
        title: "SonicPods Pro Wireless Earbuds - Waterproof, 40H Battery, Hi-Fi Studio Sound, Active Noise Cancelling",
        bullets: [
          "Fully waterproof - swim and shower ready",
          "40 hours total battery life",
          "Active noise cancelling blocks all outside noise",
          "Hi-Fi studio-quality sound for audiophiles",
        ],
      },
    }),
  },
];

/* ---------------- 用户声音与竞品洞察 ---------------- */

const BOTTLE_REVIEWS = `Rating,Review Date,Style,Body
2,2026-06-01,Small,"Way smaller than I expected, cannot fit A4 documents"
1,2026-06-03,Small,"Too small. The photos make it look much bigger."
5,2026-06-04,Large,"Keeps drinks cold for a full day, love it"
2,2026-06-07,Small,"Lid leaked in my bag on day two"
4,2026-06-09,Large,"Good insulation but a bit heavy to carry"
1,2026-06-11,Small,"Leaks from the lid, ruined my laptop bag"
5,2026-06-12,Large,"Perfect size for the gym"`;

const BOTTLE_RIVAL = `Rating,Review Date,Style,Body
2,2026-06-02,Black,"The coating chipped off after two weeks"
1,2026-06-05,Black,"Paint flakes into my drink, disgusting"
5,2026-06-06,Silver,"Keeps cold all day, very happy"
2,2026-06-08,Black,"Lid leaked in my bag"
3,2026-06-10,Silver,"Coating started peeling near the base"
4,2026-06-11,Silver,"Good bottle but heavy"`;

const EARBUDS_REVIEWS = `Rating,Review Date,Style,Body
2,2026-06-02,White,"Right earbud stopped charging after three weeks"
1,2026-06-04,White,"Constant bluetooth dropouts when my phone is in my pocket"
5,2026-06-05,Black,"Battery easily lasts my whole workday, great value"
2,2026-06-08,White,"They fall out of my ears when running"
4,2026-06-09,Black,"Good sound but the touch controls are too sensitive"
1,2026-06-10,White,"Case lid feels flimsy, hinge already loose"
3,2026-06-12,Black,"Noise cancelling is weak, still hear the office clearly"
5,2026-06-13,Black,"Comfortable fit and pairs instantly"`;

const EARBUDS_RIVAL = `Rating,Review Date,Style,Body
2,2026-06-03,White,"Mic sounds muffled on calls, people can't hear me"
1,2026-06-06,White,"Died completely after a month"
5,2026-06-07,Black,"Best noise cancelling in this price range"
2,2026-06-09,White,"Keeps disconnecting from my laptop"
4,2026-06-11,Black,"Great sound, a little bulky in the ear"`;

export type VoiceSample = { id: string; label: string; reviews: string; rival: string };

export const VOICE_SAMPLES: VoiceSample[] = [
  { id: "bottle", label: "保温水杯", reviews: BOTTLE_REVIEWS, rival: BOTTLE_RIVAL },
  { id: "earbuds", label: "蓝牙耳机", reviews: EARBUDS_REVIEWS, rival: EARBUDS_RIVAL },
];

/* ---------------- 客服回复 Copilot ---------------- */

export type ServiceSample = { id: string; label: string; message: string };

export const SERVICE_SAMPLES: ServiceSample[] = [
  {
    id: "refund",
    label: "漏水要退款(带情绪 + 隐私)",
    message: "Hi, I ordered the 32oz bottle (order 114-7788990-1234567) and the lid leaked all over my laptop bag on day two. This is unacceptable — I want a full refund or I will contact my lawyer. You can reach me at ken.miller@example.com or 555-123-4567.",
  },
  {
    id: "late",
    label: "物流延迟催单",
    message: "It's been 9 days and my order (order 113-2233445-9988776) still hasn't arrived. Tracking hasn't updated in 4 days. I needed this for a birthday that already passed. What is going on?",
  },
  {
    id: "wrong",
    label: "收到错色 / 缺配件",
    message: "I ordered the black one but received a pink bottle, and the cleaning brush that should be included was missing from the box. Can you send the correct color and the missing brush?",
  },
  {
    id: "praise",
    label: "好评 + 求推荐配件",
    message: "Love this bottle, keeps my water cold all day at the gym! Do you sell replacement straws or a carrying handle that fits it? Would happily buy more.",
  },
];
