"use client";

/**
 * 「保存本次快照」目标选择弹窗(计算器 + 三工作台共用)。
 *
 * 两种记录:整合型「商品档案」/ 碎片化「独立结果(散记录)」。
 * 用户选:存到某个已有商品档案,或新建一条散记录(带默认命名、可改)。
 * 本弹窗只负责「把目标设为当前商品」(选档案=setCurrent;新建散记录=createLooseProduct),
 * 真正落记录仍由调用方原来的保存逻辑写到「当前商品」—— 计算器/工作台零改动地复用。
 */
import { useState } from "react";
import { X } from "lucide-react";
import {
  createLooseProduct, currentProduct, defaultProductName, isLoose, listProducts,
  productLabel, renameProduct, setCurrent, sortForPicker,
} from "../../../lib/crossborder/products";

const LOOSE = "__loose__";

export function SaveResultModal({ toolId, onConfirm, onClose }: {
  toolId: string;
  onConfirm: () => void;    // 目标已设为当前商品后调用 —— 调用方在此写记录
  onClose: () => void;
}) {
  const cur = currentProduct();
  // 当前商品置顶,其余按更新时间倒序(最近在前);列表做成可滚动窗口,默认约 4 个档案高。
  const [docs] = useState(() => sortForPicker(listProducts().filter((p) => !isLoose(p)), cur?.id));
  /**
   * 默认存到**当前商品**。
   *
   * 原来一律默认「新建独立结果」,理由是「首次别逼归档」。但这个理由只在
   * 用户还没有商品档案时成立 —— 他明明是带着某个商品进的工具、顶部切换器上
   * 也写着那个商品名,存的时候却默认存去散记录,等于每次都要手动纠正一遍。
   * 当前商品本身就是散记录时,才默认散记录。
   */
  const [choice, setChoice] = useState<string>(() =>
    cur && !isLoose(cur) ? cur.id : LOOSE);
  const [looseName, setLooseName] = useState(() => defaultProductName(toolId));

  function confirm() {
    const name = looseName.trim() || defaultProductName(toolId);
    if (choice === LOOSE) {
      // 当前商品本就是散记录 → 复用它(避免每次存都造一个空的独立结果、且模型与记录不分家);
      // 名字空着才补默认名。否则新建一条散记录。
      if (cur && isLoose(cur)) { if (!cur.name.trim()) renameProduct(cur.id, name, false); }
      else createLooseProduct(name);
    } else setCurrent(choice);
    onConfirm();
    onClose();
  }

  return (
    <div className="srm-backdrop" role="dialog" aria-modal="true" aria-label="保存本次快照"
      onClick={onClose}>
      <div className="srm" onClick={(e) => e.stopPropagation()}>
        <div className="srm-head">
          <b>保存本次快照</b>
          <button onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </div>
        <div className="srm-body">
          {/* 默认:新建独立结果(散记录)—— 放最上、默认选中 */}
          <label className={`srm-opt${choice === LOOSE ? " on" : ""}`}>
            <input type="radio" name="srm" checked={choice === LOOSE} onChange={() => setChoice(LOOSE)} />
            <span>新建独立结果(散记录)</span>
          </label>
          {choice === LOOSE && (
            <input className="srm-name" value={looseName} autoFocus
              placeholder="默认命名,可改" onChange={(e) => setLooseName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirm(); }} />
          )}
          {docs.length > 0 && (
            <>
              <div className="srm-or">或存到商品档案</div>
              <div className="srm-doc-list">
                {docs.map((p) => (
                  <label key={p.id} className={`srm-opt${choice === p.id ? " on" : ""}`}>
                    <input type="radio" name="srm" checked={choice === p.id} onChange={() => setChoice(p.id)} />
                    <span>{productLabel(p)}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          <p className="srm-note">
            {docs.length > 0
              ? "散记录是随手测算,日后可在「我的商品」里并入某个商品档案。"
              : "还没有商品档案 —— 先存成散记录,日后起个名或并入,即成商品档案。"}
          </p>
        </div>
        <div className="srm-foot">
          <button onClick={onClose}>取消</button>
          <button className="fill" onClick={confirm}>保存</button>
        </div>
      </div>
    </div>
  );
}
