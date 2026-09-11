"use client";

/**
 * 让工作台的「商品背景」字段跟随当前商品:
 * 字段空着、或仍是上次自动带入的值时,自动填成当前商品的背景摘要;
 * 用户一旦手打过,就不再覆盖。切换当前商品(顶部切换器)会重新带入。
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  currentProduct, productContextSummary, subscribeProducts, type Product,
} from "./products";

export function useProductContextSync(setContext: Dispatch<SetStateAction<string>>) {
  const auto = useRef("");
  useEffect(() => {
    const sync = () => {
      const summary = productContextSummary(currentProduct());
      // 空 或 仍等于上次自动值 → 带入新摘要;否则保留用户手打的内容。
      setContext((cur) => (!cur.trim() || cur === auto.current ? summary : cur));
      auto.current = summary;
    };
    sync();
    return subscribeProducts(sync);
  }, [setContext]);
}

/**
 * 跟随「当前商品」的响应式引用。
 *
 * 顶部切换器换商品、插件导入建了新档案、竞品绑定变化 —— 都要让依赖商品的
 * 界面(比如口碑洞察的样本选择器)跟着刷新,而不是停在打开页面时的那一份。
 */
export function useCurrentProduct(): Product | null {
  const [p, setP] = useState<Product | null>(null);
  useEffect(() => {
    const sync = () => setP(currentProduct());
    sync();
    return subscribeProducts(sync);
  }, []);
  return p;
}
