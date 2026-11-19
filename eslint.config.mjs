import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "extension/**",
    "out/**",
    "build/**",
    // dist/ 是 build-sites-static 的产物,里面是压缩过的 chunk,
    // 不加进来会有十几条「this 别名」误报,把真错误埋掉。
    "dist/**",
    // chrome-embed 打包后跑在子应用里,那里没有 Next router——
    // 用 <Link> 会直接崩,所以 next/no-html-link-for-pages 在这里是误报。
    "chrome-embed/**",
    "next-env.d.ts",
  ]),
  // ── P1-2 基线口径(发布门禁 = 0 error)──
  {
    rules: {
      // React 19 新规:存量 35 处均为「挂载时从 localStorage/外部源初始化状态」
      // 的既有模式,行为正确;整改需逐个重构为 useSyncExternalStore,记为工程债
      // 降级 warn。新代码请勿再新增(评审口径)。
      "react-hooks/set-state-in-effect": "warn",
      // 静态导出(output:export)没有图片优化服务,<img> 就是正确选择。
      "@next/next/no-img-element": "off",
    },
  },
  {
    // 宠物挂件是 rAF 动画循环:ref 里存动画状态、渲染读 ref 是该场景的标准写法,
    // 重构成"纯"组件会引入不必要的重渲染。仅此文件豁免 purity/refs。
    files: ["app/crossborder/pet/pet-widget.tsx"],
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
    },
  },
]);

export default eslintConfig;
