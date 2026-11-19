/** One base path for navigation, copied links and static assets. */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(
  /\/$/,
  "",
);
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://cherler.github.io";
export const REPO_URL = "https://github.com/cherler/xiamimate-crossborder";

export function sitePath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return value;
  if (BASE_PATH && (value === BASE_PATH || value.startsWith(`${BASE_PATH}/`)))
    return value;
  const match = value.match(/^([^?#]*)(.*)$/)!;
  const pathname = match[1];
  const suffix =
    pathname.endsWith("/") || /\.[a-z0-9]+$/i.test(pathname) ? "" : "/";
  return `${BASE_PATH}${pathname}${suffix}${match[2]}`;
}
export function siteUrl(value = "/"): string {
  return `${SITE_ORIGIN}${sitePath(value)}`;
}
