"use client";

/**
 * 工作台落地页。
 * 工作台还没建，这一页存在的意义是把产品关系说清楚：
 * 它要解决什么、原来的入口为什么不够、目标流程长什么样、数据从哪来。
 *
 * 它不假装自己是个成品：状态如实标注，数据边界写在正面而不是藏在免责声明里。
 */

import { type ReactNode } from "react";
import { ArrowLeft, Database, Layers3 } from "lucide-react";
import { SiteFooter, SiteHeader } from "../../site-chrome";
import { STATUS_LABEL, workbenchBySlug } from "../../../lib/crossborder/registry";

export function WorkbenchPage({ slug, children }: { slug: string; children?: ReactNode }) {
  const wb = workbenchBySlug(slug);
  if (!wb) return null;
  const Icon = wb.icon;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />

      <section className="tool-page">
        <a className="tool-breadcrumb" href="/crossborder"><ArrowLeft size={13} /> 虾米跨境</a>

        <div className="tool-page-head">
          <div className="tool-page-title">
            <span className="tool-page-icon"><Icon size={22} /></span>
            <div>
              <span>CROSS-BORDER / {wb.category}</span>
              <h1>{wb.name}</h1>
            </div>
          </div>
          <span className={`tool-card-badge ${wb.status}`}>{STATUS_LABEL[wb.status]}</span>
        </div>

        <div className="wb-purpose">
          <Layers3 size={15} />
          <p>{wb.purpose}</p>
        </div>

        {children}

        {/* 工作台建成后,建设动因与数据边界收进折叠:想看的人能看,不挡正事。 */}
        <details className="wb-about">
          <summary>这个工作台的边界 · 工作流 / 数据从哪来</summary>
          <div className="wb-grid">
            <section className="wb-col">
              <div className="wb-block">
                <div className="section-heading"><span>目标工作流</span><em>{wb.flow.length} 步</em></div>
                <ol className="wb-flow">
                  {wb.flow.map((s, i) => <li key={i}><b>{i + 1}</b><span>{s}</span></li>)}
                </ol>
              </div>
            </section>

            <section className="wb-col">
              <div className="wb-block">
                <div className="section-heading"><span>数据从哪来</span><em>成立前提</em></div>
                <ul className="wb-gap wb-data">
                  {wb.data.map((d, i) => <li key={i}><Database size={13} /><span>{d}</span></li>)}
                </ul>
              </div>
            </section>
          </div>
        </details>
      </section>

      <SiteFooter />
    </main>
  );
}
