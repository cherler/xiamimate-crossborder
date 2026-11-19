import fs from "node:fs";
import path from "node:path";
const root = path.resolve("out"),
  base = "/xiamimate-crossborder";
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
const html = walk(root).filter((f) => f.endsWith(".html")),
  errors = [];
let checked = 0;
for (const file of html) {
  const text = fs.readFileSync(file, "utf8");
  for (const tag of text.matchAll(/<(?:a|script|link|img)\b[^>]*>/g)) {
    for (const attr of tag[0].matchAll(/(?:href|src)="([^"]+)"/g)) {
      const value = attr[1].replaceAll("&amp;", "&");
      if (!value.startsWith("/") || value.startsWith("//")) continue;
      checked++;
      if (value !== base && !value.startsWith(base + "/")) {
        errors.push(path.relative(root, file) + ": missing prefix: " + value);
        continue;
      }
      const target = decodeURIComponent(
        value.slice(base.length).split(/[?#]/)[0] || "/",
      );
      const local = path.join(root, target);
      if (
        ![local, path.join(local, "index.html")].some(
          (f) => fs.existsSync(f) && fs.statSync(f).isFile(),
        )
      )
        errors.push(path.relative(root, file) + ": missing target: " + value);
    }
  }
  const visible = text
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<style\b[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]*>/g, "");
  if (
    /账户中心|登录后云端|消耗.{0,12}积分|智能读取 · 即将上线|充值/.test(visible)
  )
    errors.push(path.relative(root, file) + ": platform UI remains");
}
for (const route of [
  "account",
  "auth",
  "extension",
  "crossborder/research/product-insight",
  "crossborder/report",
]) {
  if (fs.existsSync(path.join(root, route, "index.html")))
    errors.push("Unexpected route: " + route);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Static audit: " +
      html.length +
      " pages, " +
      checked +
      " links/assets, no missing paths or account/billing UI.",
  );
