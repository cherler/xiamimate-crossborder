/**
 * 正式研究的消耗预估 —— ai-service 扫描路由与前端确认页共用这一份,口径一致。
 *
 * 一次扫描现在是「商品身份扫描」(与档位/竞品无关),前端据当前档位 + 竞品数
 * 在客户端重算模块与预估,不必按档重扫;这两个函数就是重算的依据,必须与
 * 服务端同源,否则前端显示的「≈X 积分」会和实际报价打架。
 */

/** 需求洞察 / 综合等非竞品档:按最终会写的模块数线性估。 */
export function estimateRun(moduleCount: number): { tokens: number; searches: number; minutes: number } {
  const dynamic = Math.max(0, moduleCount - 4); // 4 个固定模块开销并入基数
  return {
    tokens: 60_000 + dynamic * 18_000,
    searches: 8 + dynamic * 2,
    minutes: 4 + dynamic,
  };
}

/** 竞品对比:按主体数(我方 + 竞品)算,每主体约 3 角度检索。 */
export function estimateRival(subjectCount: number): { tokens: number; searches: number; minutes: number } {
  return {
    tokens: 90_000 + subjectCount * 20_000,
    searches: subjectCount * 3,
    minutes: 5 + subjectCount,
  };
}

/**
 * 冻结报价(积分上限)—— 必须与后端 research.py 的 STAGE_EST / quote_for 完全同口径,
 * 否则扫描确认页的「预估上限」会和报告页 quote 打架(曾出现扫描显示 44、报告显示 22)。
 * STAGE_EST 基线 {plan:0,gather:12,evidence:2,analyze:3,compose:5}=22;
 * rival:gather=12+竞品×8,evidence4/analyze5/compose7 → 28+竞品×8;full 各阶段上调 → 37。
 */
export function quoteCredits(intent: string, rivalCount = 0): number {
  if (intent === "rival_compare") return 28 + rivalCount * 8;
  if (intent === "full") return 37;
  return 22;   // market_entry(需求洞察)
}
