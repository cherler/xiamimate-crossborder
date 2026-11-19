import type { Capture } from "../adapters/index";
import type { ProductInsights } from "../adapters/amazon-insights";
export type StoredCapture = Capture & { capturedAt: string };
export async function readLastCapture(): Promise<StoredCapture | null> {
  return (await chrome.storage.local.get("lastCapture")).lastCapture ?? null;
}
export async function writeLastCapture(c: Capture | null): Promise<void> {
  if (c) await chrome.storage.local.set({ lastCapture: { ...c, capturedAt: new Date().toISOString() } });
  else await chrome.storage.local.remove("lastCapture");
}
export async function readLastInsights(): Promise<ProductInsights | null> {
  return (await chrome.storage.local.get("lastInsights")).lastInsights ?? null;
}
export async function writeLastInsights(v: ProductInsights | null): Promise<void> {
  if (v) await chrome.storage.local.set({ lastInsights: v });
  else await chrome.storage.local.remove("lastInsights");
}
