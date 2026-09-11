"use client";

/**
 * 服务端派生视图 —— 「用户明明操作了,界面却没跟上」这类问题的统一出口。
 *
 * 「我的商品」页上有两种状态,失效规则完全不同:
 *
 *   本地仓(商品列表)  —— 有订阅(subscribeProducts),任何改动立刻重渲染,从不出错;
 *   服务端派生(配额用量、最近删除、样本、洞察)—— 各自 useEffect 拉一次,
 *                       依赖里只有 user。于是删一个档案:列表当场少一张卡,
 *                       而配额还是旧数、被删的档案不出现在「最近删除」里,
 *                       非得刷新页面才对得上。
 *
 * 病根不是懒加载,是**每加一块服务端数据就要记得在每个改动点手动失效它**。
 * 这种"靠记性"的机制在这个项目里已经翻过好几次车(dirty 标记、schedulePush、
 * 存根守卫),迟早还会翻。
 *
 * 所以换成订阅:本地仓的 notify() 是唯一的变更信号,而它覆盖两件事 ——
 *   1. 任何 persist(增删改)都会 notify;
 *   2. 推送状态变化(setSync)也会 notify —— 包括「这一轮推完了」。
 * 服务端数据只要跟着这个信号重取,就不需要任何人记得去失效它。
 *
 * 防抖是必须的:一次操作往往连着几次 persist(改本地 → 回写 cloudId),
 * 不防抖会对同一件事打三四个请求。而推送有 1.5s 防抖,所以推完那一下
 * 的 notify 天然落在后面 —— 那次重取拿到的才是服务端的新状态。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeProducts } from "./products";

export function useServerView<T>(
  load: () => Promise<T>,
  /** 关掉(比如未登录)时不拉取,并把值清空 */
  enabled = true,
): { data: T | undefined; reload: () => void } {
  const [data, setData] = useState<T | undefined>(undefined);
  const alive = useRef(true);
  const fn = useRef(load);
  // 不能在渲染期写 ref。fn.current 只在 reload 的异步回调里读取,
  // 那个时机总在本次提交的 effect 之后,所以放进 effect 是安全的。
  useEffect(() => { fn.current = load; });
  /**
   * 只采纳最新一次的结果。
   *
   * 没有序号的话:挂载时 reload#1 在途(慢)→ 用户删档案 → reload#2 返回
   * (配额已减、回收站已有这条)→ #1 才返回,把新数据盖回旧的 ——
   * 配额跳回旧数、刚删的又从「最近删除」里不见了。
   * 先发后至是网络常态,而这个 hook 现在是所有服务端派生数据的统一出口,
   * 顺序错一次就是一片地方同时显示错值。
   */
  const seq = useRef(0);

  const reload = useCallback(() => {
    if (!enabled) { seq.current += 1; setData(undefined); return; }
    const mine = ++seq.current;
    fn.current()
      .then((d) => { if (alive.current && mine === seq.current) setData(d); })
      .catch(() => { /* 取不到就保持旧值 */ });
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    reload();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeProducts(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(reload, 400);
    });
    return () => { alive.current = false; if (timer) clearTimeout(timer); off(); };
  }, [reload]);

  return { data, reload };
}
