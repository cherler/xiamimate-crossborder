/**
 * 个人成本模板(#60)。
 *
 * 商品会换,店铺的「费率底座」不常换:平台佣金、尾程/FBA、头程、国内段、
 * 退款损耗、广告占比,基本按平台/站点一套。模板把这 6 项存成命名底座,
 * 换品测算时一键铺底,只填售价和采购成本。
 *
 * 有意不含 price / cost —— 那是商品的事,不是店铺的事。
 * 存储与商品实体同款:本机为准 + 登录后云端镜像(saved_item tool="cost_template")。
 */
import { itemsApi } from "../items";
import type { ProfitValues } from "./calculators/profit";

export type TemplateRates = Pick<
  ProfitValues, "domestic" | "head" | "lastMile" | "commission" | "refund" | "ads"
>;

export type CostTemplate = {
  id: string;
  name: string;
  rates: TemplateRates;
  cloudId?: string;
  updatedAt: number;
};

export const RATE_KEYS: Array<keyof TemplateRates> = [
  "domestic", "head", "lastMile", "commission", "refund", "ads",
];

const KEY = "xm:cost-templates";
const CAP = 20;

const listeners = new Set<() => void>();
export function subscribeTemplates(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

function read(): CostTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((t) => t && t.id && t.rates) : [];
  } catch { return []; }
}

function persist(list: CostTemplate[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP))); } catch { /* 满了就算了 */ }
  notify();
}

export function listTemplates(): CostTemplate[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function ratesOf(values: ProfitValues): TemplateRates {
  return {
    domestic: values.domestic, head: values.head, lastMile: values.lastMile,
    commission: values.commission, refund: values.refund, ads: values.ads,
  };
}

/** 同名覆盖,新名新建。返回保存后的模板。 */
export function saveTemplate(name: string, rates: TemplateRates): CostTemplate {
  const list = read();
  const trimmed = name.trim().slice(0, 40) || "未命名模板";
  const found = list.find((t) => t.name === trimmed);
  let tpl: CostTemplate;
  if (found) {
    tpl = { ...found, rates, updatedAt: Date.now() };
    persist(list.map((t) => (t.id === tpl.id ? tpl : t)));
  } else {
    tpl = { id: `ct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, name: trimmed, rates, updatedAt: Date.now() };
    persist([tpl, ...list]);
  }
  schedulePush();
  return tpl;
}

export function removeTemplate(id: string) {
  const hit = read().find((t) => t.id === id);
  persist(read().filter((t) => t.id !== id));
  if (hit?.cloudId) itemsApi.remove(hit.cloudId).catch(() => { /* 云端残留下次对账清 */ });
}

/* ---------------- 云端镜像(登录后;失败静默,下次改动再试) ---------------- */

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushAll, 1500);
}

async function pushAll() {
  pushTimer = null;
  for (const t of read()) {
    try {
      if (t.cloudId) {
        await itemsApi.update(t.cloudId, { title: t.name, payload: { name: t.name, rates: t.rates } });
      } else {
        const r = await itemsApi.create({
          module: "crossborder", tool: "cost_template", title: t.name,
          payload: { name: t.name, rates: t.rates },
        });
        const list = read();
        persist(list.map((x) => (x.id === t.id ? { ...x, cloudId: r.item.item_id } : x)));
      }
    } catch { break; }
  }
}

/** 登录后拉云端模板并入本地:cloudId 相同的以新者为准,本地没有的收进来。 */
export async function reconcileCloud(): Promise<void> {
  const d = await itemsApi.list("crossborder", "cost_template");
  let list = read();
  const byCloudId = new Map(list.filter((t) => t.cloudId).map((t) => [t.cloudId as string, t]));
  for (const it of d.items) {
    const pay = it.payload as { name?: string; rates?: TemplateRates } | null;
    if (!pay?.rates) continue;
    const cloudTime = new Date(it.updated_at).getTime() || 0;
    const local = byCloudId.get(it.item_id);
    if (!local) {
      list = [{
        id: `ct_${it.item_id}`, name: pay.name || it.title || "未命名模板",
        rates: pay.rates, cloudId: it.item_id, updatedAt: cloudTime,
      }, ...list];
    } else if (cloudTime > local.updatedAt) {
      list = list.map((t) => (t.id === local.id
        ? { ...t, name: pay.name || t.name, rates: pay.rates!, updatedAt: cloudTime } : t));
    }
  }
  persist(list);
}
