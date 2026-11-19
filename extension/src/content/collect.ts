/**
 * 注入到页面里执行的采集脚本。
 *
 * manifest 里**没有** content_scripts 声明 —— 这个文件只在用户点击扩展图标后
 * 由 chrome.scripting 注入一次(activeTab 权限)。所以它不常驻、不监听、
 * 不在用户没有主动要求时碰任何页面。这是隐私政策里那句承诺的实现。
 *
 * 它只读 DOM,不改页面、不发请求、不读 Cookie 或 localStorage。
 */
import { capture, captureReviewsFor } from "../adapters/index";
// 评论按 URL 分发(见 adapters/index.captureReviewsFor)—— 不再写死亚马逊。
// diagnose/probe 目前仍是亚马逊专用的诊断工具,TikTok 走 JSON 不需要它们。
import { diagnoseReviews, probeCounts } from "../adapters/amazon-reviews";
import { captureInsights } from "../adapters/amazon-insights";

declare global {
  interface Window {
    __xmCapture?: () => unknown;
    __xmCaptureReviews?: () => unknown;
    __xmDiagnose?: () => unknown;
    __xmCaptureInsights?: () => unknown;
    __xmProbes?: () => unknown;
  }
}

function guard<T>(fn: () => T) {
  try {
    return { ok: true as const, data: fn() };
  } catch (e) {
    // 解析器抛异常不能让用户只看到一个空白面板
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

window.__xmCapture = () => guard(() => capture(document, location.href));
window.__xmCaptureReviews = () => guard(() => captureReviewsFor(document, location.href));
window.__xmDiagnose = () => guard(() => diagnoseReviews(document, location.href));
window.__xmCaptureInsights = () => guard(() => captureInsights(document, location.href));
window.__xmProbes = () => guard(() => probeCounts(document));
