import type { ComponentProps } from "react";
import { sitePath } from "../lib/site";
/** Native links also need the Pages prefix. */
export function SiteLink({ href, ...props }: ComponentProps<"a">) {
  return <a {...props} href={href ? sitePath(href) : href} />;
}
