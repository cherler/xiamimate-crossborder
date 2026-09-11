/**
 * 样例报告里的「报告生成后可用操作」展示件(生命周期功能:扩展/续跑/定期复扫)。
 * 纯展示、非功能 —— 让用户在样例里就看到真实报告能做什么。真实实现见 report/view.tsx。
 * 单独成文件,避免 sample.tsx ↔ tiktok.tsx 循环引用。
 */
import { ChevronDown, Download, GitCompareArrows, Package, Pin, RefreshCw, Share2 } from "lucide-react";

export function SampleLifecycle() {
  return (
    <div className="rr-sample-ops">
      <span className="rr-sample-ops-cap">报告生成后可用(样例展示):</span>
      <div className="rr-actions-bar rr-actions-sample" aria-hidden="true">
        <button title="样例展示 —— 生成真实报告后可用"><RefreshCw size={13} /> 重跑 / 衍生 <ChevronDown size={12} /></button>
        <button title="样例展示 —— 报告可归入商品档案,与该商品的测算/竞品一并溯源"><Package size={13} /> 归入商品档案 <ChevronDown size={12} /></button>
        <button title="样例展示"><GitCompareArrows size={13} /> 版本对比</button>
        <button title="样例展示"><Pin size={13} /> 设为参考</button>
        <button title="样例展示"><Share2 size={13} /> 分享</button>
        <button title="样例展示"><Download size={13} /> 导出 <ChevronDown size={12} /></button>
      </div>
    </div>
  );
}

export function SampleRescan() {
  return (
    <div className="rr-rescan-sample">
      <div className="rr-rescan-sample-top">
        <div className="rr-rescan-sample-title"><RefreshCw size={14} /> 定期复扫 <span className="rr-sample-badge">样例</span></div>
        <span className="rr-rescan-sample-switch" aria-hidden="true" />
      </div>
      <p>按周期自动重跑,监测口碑与竞品变化;每份复扫是同一商品的新版本。<b>开启即同意到期自动消耗积分,余额不足跳过本次(不会欠费)。</b></p>
    </div>
  );
}
