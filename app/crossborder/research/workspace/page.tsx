import type { Metadata } from "next";
import { ResearchWorkspace } from "./workspace";
export const metadata: Metadata = { title: "我的研究资料 · 虾米跨境" };
export default function Page() { return <ResearchWorkspace />; }
