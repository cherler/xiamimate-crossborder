"use client";

/**
 * 模块显隐 —— 运营台在 site_settings 的 `modules_vis` 里配的那份。
 *
 * 抽出来是因为它被漏用了:页眉与首页各自复制了一份取配置的逻辑,
 * 而账户中心的模块卡片是**硬编码**的。结果配置只生效一半 ——
 * 「AI 视频实验室」在首页和导航里已经藏掉了,用户却仍能在自己的账户页
 * 看到它,还被告知「暂无独立会员,无需额外付费」。
 *
 * 一份配置有两处以上的读法,迟早出现这种半生效;所以新增读取点一律走这里。
 */

import { useEffect, useState } from "react";
import { AUTH_ENABLED, apiUrl } from "./api";
import { isModuleVisible, moduleByKey } from "./modules";

/** 全部覆盖项。取不到就返回空,由 isModuleVisible 回落到模块自身的默认可见性。 */
export function useModuleVis(): Record<string, boolean> {
  const [vis, setVis] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let alive = true;
    fetch(apiUrl("/v1/site-settings"))
      .then((r) => r.json())
      .then((d) => { if (alive && d?.modulesVis && typeof d.modulesVis === "object") setVis(d.modulesVis); })
      .catch(() => { /* 取不到就按默认可见性 */ });
    return () => { alive = false; };
  }, []);
  return vis;
}

/**
 * 单个模块可见吗。
 *
 * 配置没回来之前先按默认值渲染,不做 loading 态 —— 这是一张信息卡片,
 * 闪一下比先空着再补出来更不打扰;真要藏的模块下一帧就消失了。
 */
export function useModuleVisible(key: string): boolean {
  const vis = useModuleVis();
  const m = moduleByKey(key);
  if (!m) return false;          // 清单里没有的模块,不认识就不显示
  return isModuleVisible(m, vis);
}
