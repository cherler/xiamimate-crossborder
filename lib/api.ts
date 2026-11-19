/** Standalone edition: no account, billing, telemetry or remote AI requests. */
export const AUTH_ENABLED = false;
export const AI_ENABLED = false;
export const API_BASE = "";
export function apiUrl(path: string): string {
  return path;
}
function unavailable() {
  return new Response(
    JSON.stringify({
      error: "此操作不属于本地工具",
      detail: "此操作不属于本地工具",
    }),
    { status: 503, headers: { "content-type": "application/json" } },
  );
}
export async function authFetch(
  _path: string,
  _init?: RequestInit,
): Promise<Response> {
  return unavailable();
}
export async function aiFetch(
  _path: string,
  _init?: RequestInit,
): Promise<Response> {
  return unavailable();
}
export async function aiJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("此操作不属于本地工具");
  return response.json() as Promise<T>;
}
