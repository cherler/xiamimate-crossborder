/**
 * 构建。esbuild 打两个包 + 拷静态文件,没有框架。
 *
 * 不用 WXT/Plasmo 这类扩展框架:这个插件只有一个弹窗和一个按需注入的脚本,
 * 框架带来的 HMR 与跨浏览器适配换不回它遮蔽 manifest 的代价 ——
 * 应用商店审核看的就是 manifest,它应该是我们手写、能逐行解释的那一份。
 */
import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");

/*
 * 输出目录分开:开发版固定在 dist/,发布版去 dist-release/。
 *
 * 合用一个目录会出事 —— 打发布包时跑的是生产构建,会把 dist/ 里那份
 * 指向 localhost 的开发版覆盖掉。用户浏览器里加载的正是 dist/,
 * 于是他正在测的插件突然连不上后端(实测踩过)。
 * chrome://extensions 里加载的是目录路径,内容一换就直接生效,没有任何提示。
 */
const OUT = process.env.XM_OUT || "dist";

const SITE = (process.env.XM_SITE || "https://cherler.github.io/xiamimate-crossborder").replace(/\/$/, "");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/popup`, { recursive: true });

const common = {
  bundle: true,
  format: "esm",
  target: ["chrome110"],
  legalComments: "none",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  define: { __XM_SITE__: JSON.stringify(SITE) },
};

const jobs = [
  { ...common, entryPoints: ["src/popup/popup.ts"], outfile: `${OUT}/popup/popup.js` },
  // 注入脚本必须是 IIFE:executeScript 不走模块加载器
  { ...common, format: "iife", entryPoints: ["src/content/collect.ts"], outfile: `${OUT}/content.js` },
];

function copyStatic() {
  cpSync("manifest.json", `${OUT}/manifest.json`);
  cpSync("icons", `${OUT}/icons`, { recursive: true });
  cpSync("_locales", `${OUT}/_locales`, { recursive: true });
  cpSync("src/popup/index.html", `${OUT}/popup/index.html`);
  cpSync("src/popup/popup.css", `${OUT}/popup/popup.css`);

  // 版本号只在 package.json 维护一处,构建时写进 manifest
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const manifest = JSON.parse(readFileSync(`${OUT}/manifest.json`, "utf8"));
  manifest.version = version;
  delete manifest.host_permissions;
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
}

if (watch) {
  for (const job of jobs) (await context(job)).watch();
  copyStatic();
  console.log("watching… 改完在 chrome://extensions 点刷新");
} else {
  await Promise.all(jobs.map(build));
  copyStatic();
  console.log(`构建完成 → ${OUT}/`);
}
