import { redirect } from "next/navigation";

// 开源版只有跨境这一个模块，根路径直接进它。
// 原平台版这里是模块广场（首页列出四个模块），那部分不在本仓。
export default function Home() {
  redirect("/crossborder");
}
