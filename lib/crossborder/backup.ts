import { listProducts, type Product } from "./products";
import { sanitizeModel } from "./product-model";
import { sanitizeProject } from "./product-facts";
import { listTemplates, RATE_KEYS, type CostTemplate } from "./cost-templates";

export const PRODUCT_KEY = "xm:products:v1";
export const TEMPLATE_KEY = "xm:cost-templates";
export type Backup = {
  format: "xiamimate-crossborder";
  version: 1;
  exportedAt: string;
  products: Product[];
  templates: CostTemplate[];
};
export function createBackup(): Backup {
  return {
    format: "xiamimate-crossborder",
    version: 1,
    exportedAt: new Date().toISOString(),
    products: listProducts(),
    templates: listTemplates(),
  };
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function parseBackup(text: string): Backup {
  if (text.length > 20_000_000)
    throw new Error("备份超过 20 MB，请拆分后导入。");
  const raw: unknown = JSON.parse(text);
  if (
    !record(raw) ||
    raw.format !== "xiamimate-crossborder" ||
    raw.version !== 1 ||
    !Array.isArray(raw.products) ||
    !Array.isArray(raw.templates)
  )
    throw new Error("这不是虾米跨境的有效备份。");
  const products = raw.products.map((v: unknown) => {
    if (
      !record(v) ||
      typeof v.id !== "string" ||
      !v.id ||
      typeof v.stableId !== "string" ||
      !v.stableId ||
      typeof v.name !== "string" ||
      typeof v.marketplace !== "string" ||
      typeof v.updatedAt !== "number" ||
      !Number.isFinite(v.updatedAt) ||
      !record(v.finance) ||
      v.stub
    )
      throw new Error("备份含不完整的商品档案，未导入任何内容。");
    if (
      v.records !== undefined &&
      (!Array.isArray(v.records) ||
        v.records.some(
          (r) =>
            !record(r) ||
            typeof r.id !== "string" ||
            typeof r.ts !== "number" ||
            typeof r.tool !== "string" ||
            typeof r.label !== "string" ||
            !record(r.values),
        ))
    )
      throw new Error("备份含无效的测算记录。");
    if (
      v.rivals !== undefined &&
      (!Array.isArray(v.rivals) ||
        v.rivals.some(
          (r) =>
            !record(r) ||
            typeof r.id !== "string" ||
            typeof r.name !== "string" ||
            typeof r.updatedAt !== "number",
        ))
    )
      throw new Error("备份含无效的竞品记录。");
    const project = v.project ? sanitizeProject(v.project) : null;
    if (v.project && !project) throw new Error("备份含无效的商品事实库。");
    return {
      ...v,
      finance: sanitizeModel(v.finance),
      project,
      cloudId: null,
      cloudVersion: undefined,
      pushedHash: undefined,
      stub: undefined,
      stubCounts: undefined,
    } as Product;
  });
  if (
    new Set(products.map((p) => p.id)).size !== products.length ||
    new Set(products.map((p) => p.stableId)).size !== products.length
  )
    throw new Error("备份内商品身份重复。");
  const templates = raw.templates.map((t: unknown) => {
    if (
      !record(t) ||
      typeof t.id !== "string" ||
      typeof t.name !== "string" ||
      typeof t.updatedAt !== "number" ||
      !record(t.rates)
    )
      throw new Error("备份含无效的成本模板。");
    const rates = t.rates;
    if (
      RATE_KEYS.some(
        (k) =>
          typeof rates[k] !== "number" ||
          !Number.isFinite(rates[k]) ||
          (rates[k] as number) < 0,
      )
    )
      throw new Error("成本模板的费率不正确。");
    return { ...t, cloudId: undefined } as CostTemplate;
  });
  return {
    format: "xiamimate-crossborder",
    version: 1,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    products,
    templates,
  };
}
export function mergeBackup(current: Backup, incoming: Backup): Backup {
  const products = new Map(current.products.map((p) => [p.stableId, p]));
  for (const p of incoming.products) {
    const prev = products.get(p.stableId);
    if (!prev || p.updatedAt > prev.updatedAt) {
      const collision = [...products.values()].some(
        (x) => x.id === p.id && x.stableId !== p.stableId,
      );
      products.set(p.stableId, {
        ...p,
        id: prev?.id ?? (collision ? "prod_import_" + p.stableId : p.id),
      });
    }
  }
  const templates = new Map(current.templates.map((t) => [t.id, t]));
  for (const t of incoming.templates) {
    const prev = templates.get(t.id);
    if (!prev || t.updatedAt > prev.updatedAt) templates.set(t.id, t);
  }
  if (templates.size > 20)
    throw new Error(
      "合并后成本模板超过 20 份，请先整理模板；没有写入任何内容。",
    );
  return {
    ...current,
    products: [...products.values()],
    templates: [...templates.values()],
  };
}
/** Commit both stores together; a quota failure restores their previous values. */
export function restoreBackup(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  current: Backup,
  incoming: Backup,
) {
  const merged = mergeBackup(current, incoming);
  const oldProducts = storage.getItem(PRODUCT_KEY),
    oldTemplates = storage.getItem(TEMPLATE_KEY);
  const oldCurrent = oldProducts ? JSON.parse(oldProducts).currentId : "";
  try {
    storage.setItem(
      PRODUCT_KEY,
      JSON.stringify({
        currentId: merged.products.some((p) => p.id === oldCurrent)
          ? oldCurrent
          : (merged.products[0]?.id ?? ""),
        products: merged.products,
      }),
    );
    storage.setItem(TEMPLATE_KEY, JSON.stringify(merged.templates));
  } catch (error) {
    for (const [key, value] of [
      [PRODUCT_KEY, oldProducts],
      [TEMPLATE_KEY, oldTemplates],
    ]) {
      if (value === null) storage.removeItem(key!);
      else storage.setItem(key!, value!);
    }
    throw error;
  }
  return merged;
}
export function downloadText(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
