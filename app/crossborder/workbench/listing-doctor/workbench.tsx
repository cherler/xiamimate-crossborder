"use client";

/**
 * Listing 诊断工作台的容器：持有唯一一份商品项目，三段共用。
 *
 * 商品实体模型下,项目 = 「当前商品」的事实库字段:
 * readProject/writeProject 已委托实体仓,登录后随商品档案整体防抖上云。
 * 顶部挂商品切换器(R1);?item= 兼容旧版「我的商品」里的 listing_project 记录。
 */

import { useEffect, useState } from "react";
import { Bookmark, Check, RotateCcw } from "lucide-react";
import { ProductSwitcher } from "../../tools/product-switcher";
import { SaveResultModal } from "../../tools/save-result-modal";
import { useAuth } from "../../../../lib/auth";
import { itemsApi } from "../../../../lib/items";
import { currentProduct, saveProductRecord } from "../../../../lib/crossborder/products";
import {
  clearProject, readProject, seededProject, writableFacts, writeProject, type ProductProject,
} from "../../../../lib/crossborder/product-facts";
import { ProjectPanel } from "./project";
import { DiagnosisPanel } from "./diagnosis";
import { RewritePanel } from "./rewrite";

export function ListingDoctor() {
  const { user, loading } = useAuth();
  const [project, setProject] = useState<ProductProject | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProject(readProject() ?? seededProject("p1", ""));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated || !project) return;
    writeProject(project);
  }, [hydrated, project]);

  // #6:从商品档案点「Listing 快照」回来(?snap=<recordId>)→ 把那一版事实+草稿原样还原。
  useEffect(() => {
    if (!hydrated) return;
    const snap = new URLSearchParams(window.location.search).get("snap");
    if (!snap) return;
    const proj = (currentProduct()?.records?.find((r) => r.id === snap)?.values as { project?: ProductProject })?.project;
    if (proj) setProject(proj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // 兼容旧版:?item= 指向早期单独存的 listing_project 云记录,读进当前商品。
  useEffect(() => {
    if (loading || !user || !hydrated) return;
    const wanted = new URLSearchParams(window.location.search).get("item");
    if (!wanted) return;
    (async () => {
      try {
        const d = await itemsApi.list("crossborder", "listing_project");
        const hit = d.items.find((i) => i.item_id === wanted);
        if (hit) setProject(hit.payload as unknown as ProductProject);
      } catch { /* 拿不到就算了 */ }
    })();
  }, [loading, user, hydrated]);

  if (!project) return null;

  // 没有任何输入/输出(无已确认事实、无 Listing 草稿)时禁用保存快照。
  const nothingToSave = writableFacts(project).length === 0
    && !project.listing.title.trim() && !project.listing.bullets?.some((b) => b.trim());

  function reset() {
    clearProject();
    setProject(seededProject("p1", ""));
  }

  // 保存本次快照:把当前商品项目(已确认事实 + Listing 草稿)存成一条记录,可回头对照。
  function doSaveSnapshot() {
    if (!project) return;
    const confirmed = writableFacts(project);
    const listing = project.listing;
    const summary = [
      `商品:${project.name || "未命名"}${project.marketplace ? ` · ${project.marketplace}` : ""}`,
      `已确认事实 ${confirmed.length} 条:`,
      ...confirmed.map((f) => `- ${f.label}:${f.value}`),
      listing.title ? `【当前 Listing 标题】\n${listing.title}` : "",
      listing.bullets?.length ? `【五点描述】\n${listing.bullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
    saveProductRecord("listing", `Listing 快照 · ${confirmed.length} 条事实`, {
      summary, facts: confirmed.length, title: listing.title, bullets: listing.bullets,
      // 存整份项目 —— 供「打开工作台」把这一版的事实+草稿原样还原(#6)。
      project: JSON.parse(JSON.stringify(project)) as ProductProject,
    });
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "happy" } }));
  }

  return (
    <>
      <div className="tool-belt"><ProductSwitcher /></div>

      <div className="wb-stage">
        <div className="wb-stage-head">
          <span><b>1</b> 建立商品项目 · 确认事实</span>
          <div className="wb-stage-actions">
            <button className="wb-snapshot-btn" onClick={() => setSaveOpen(true)} disabled={nothingToSave}
              title={nothingToSave ? "还没有可保存的内容 —— 先确认事实或写 Listing"
                : "把当前事实库 + Listing 草稿存成一份快照,可存到商品档案或独立结果"}>
              {saved ? <><Check size={13} /> 已保存</> : <><Bookmark size={13} /> 保存本次快照</>}
            </button>
            <button onClick={reset}><RotateCcw size={12} /> 清空当前商品的事实库</button>
          </div>
        </div>
      </div>
      <ProjectPanel project={project} onChange={setProject} />

      <div className="wb-stage">
        <div className="wb-stage-head">
          <span><b>2</b> 按事实与规则诊断现有 Listing</span>
          <em>判定不调模型 · 同一份输入永远同一份结论</em>
        </div>
      </div>
      <DiagnosisPanel project={project} onChange={setProject} />

      <div className="wb-stage">
        <div className="wb-stage-head">
          <span><b>3</b> 按问题改写 · 改完复检 · 导出</span>
          <em>改写用 AI · 复检仍不调模型</em>
        </div>
      </div>
      <RewritePanel project={project} onChange={setProject} />
      {saveOpen && <SaveResultModal toolId="listing" onConfirm={doSaveSnapshot} onClose={() => setSaveOpen(false)} />}
    </>
  );
}
