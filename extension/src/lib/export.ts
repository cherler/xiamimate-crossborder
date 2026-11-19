import { parseCaptureBundle, type CaptureBundle } from "../../../shared/collector";
import type { StoredCapture } from "./storage";
import type { ProductInsights } from "../adapters/amazon-insights";
import { toPayload, type ReviewCart } from "./review-cart";
export function createBundle(product: StoredCapture | null, cart: ReviewCart | null, insights: ProductInsights | null): CaptureBundle {
  return parseCaptureBundle(JSON.stringify({
    format: "xiamimate-capture", version: 1, exportedAt: new Date().toISOString(), product,
    reviews: cart?.reviews.length ? { ...toPayload(cart, "用户手动采集"), pages: cart.pages } : null,
    insights,
  }));
}
export function downloadBundle(bundle: CaptureBundle) {
  const ref = bundle.product ?? bundle.reviews ?? bundle.insights!;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = href; a.download = "xiamimate-" + ref.marketplace + "-" + ref.externalId + ".json";
  a.click();
  // Do not clear storage: closing the popup or cancelling the browser download must not lose data.
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}
