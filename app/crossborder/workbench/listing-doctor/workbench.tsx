"use client";
import { useEffect, useMemo, useState } from "react";
import { ProductSwitcher } from "../../tools/product-switcher";
import { SaveResultModal } from "../../tools/save-result-modal";
import {
  seededProject,
  readProject,
  writeProject,
  touch,
  type ProductProject,
} from "../../../../lib/crossborder/product-facts";
import {
  diagnose,
  summarize,
} from "../../../../lib/crossborder/listing-diagnosis";
import {
  saveProductRecord,
  getSyncState,
  currentProduct,
} from "../../../../lib/crossborder/products";
import { downloadText } from "../../../../lib/crossborder/backup";
export function ListingDoctor() {
  const [project, setProject] = useState<ProductProject | null>(null),
    [message, setMessage] = useState(""),
    [saveOpen, setSaveOpen] = useState(false);
  useEffect(() => {
    const snap = new URLSearchParams(window.location.search).get("snap");
    const saved = snap
      ? currentProduct()?.records?.find((r) => r.id === snap)?.values.project
      : undefined;
    setProject(
      (saved as ProductProject | undefined) ??
        readProject() ??
        seededProject("local", ""),
    );
  }, []);
  const findings = useMemo(
    () =>
      project
        ? diagnose({
            listingTitle: project.listing.title,
            bullets: project.listing.bullets,
            keywords: project.keywords,
            project,
            snapshot: project.snapshot,
          })
        : [],
    [project],
  );
  function change(next: ProductProject) {
    const p = touch(next);
    setProject(p);
    writeProject(p);
    setMessage(
      getSyncState().localFull
        ? "空间不足，请立即到我的商品导出备份。"
        : "已保存到当前商品",
    );
  }
  if (!project) return <p>正在读取本机档案…</p>;
  const p = project;
  function save() {
    if (!project) return;
    saveProductRecord("listing", "Listing 检查", {
      project,
      findings,
      summary:
        project.listing.title +
        "\n" +
        findings.map((f) => f.title + ": " + f.detail).join("\n"),
    });
    setMessage("检查快照已保存。");
  }
  return (
    <>
      <ProductSwitcher />
      <p className="local-note">
        手动填写事实与来源。本地检查不检索实时政策；缺少已核对规则的项目会明确标为未知。事实内容变化后需要重新确认。
      </p>
      <div className="local-grid">
        <section className="local-panel">
          <h2>商品事实</h2>
          <label className="local-field">
            项目名称
            <input
              value={p.name}
              onChange={(e) => change({ ...p, name: e.target.value })}
            />
          </label>
          <label className="local-field">
            销售站点
            <input
              value={p.marketplace}
              onChange={(e) => change({ ...p, marketplace: e.target.value })}
            />
          </label>
          {p.facts.map((f, i) => (
            <div className="local-record" key={f.key}>
              <label className="local-field">
                {f.label}
                <input
                  value={f.value}
                  placeholder="资料里没有就留空"
                  onChange={(e) =>
                    change({
                      ...p,
                      facts: p.facts.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              value: e.target.value,
                              status: e.target.value.trim()
                                ? "unconfirmed"
                                : "unknown",
                              source: "user",
                              updatedAt: Date.now(),
                            }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label className="local-field">
                来源说明
                <input
                  value={f.sourceNote}
                  onChange={(e) =>
                    change({
                      ...p,
                      facts: p.facts.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              sourceNote: e.target.value,
                              status: "unconfirmed",
                            }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <label className="local-note">
                <input
                  type="checkbox"
                  checked={f.status === "confirmed"}
                  disabled={!f.value.trim()}
                  onChange={(e) =>
                    change({
                      ...p,
                      facts: p.facts.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              status: e.target.checked
                                ? "confirmed"
                                : "unconfirmed",
                            }
                          : x,
                      ),
                    })
                  }
                />{" "}
                我已核对这条事实
              </label>
            </div>
          ))}
        </section>
        <section className="local-panel">
          <h2>编辑与检查</h2>
          <label className="local-field">
            标题
            <textarea
              value={p.listing.title}
              onChange={(e) =>
                change({
                  ...p,
                  listing: { ...p.listing, title: e.target.value },
                })
              }
            />
          </label>
          <label className="local-field">
            五点描述（每行一条）
            <textarea
              value={p.listing.bullets.join("\n")}
              onChange={(e) =>
                change({
                  ...p,
                  listing: {
                    ...p.listing,
                    bullets: e.target.value.split("\n"),
                  },
                })
              }
            />
          </label>
          <label className="local-field">
            目标关键词（逗号分隔）
            <input
              value={p.keywords.join(", ")}
              onChange={(e) =>
                change({
                  ...p,
                  keywords: e.target.value.split(/[,，]/).map((x) => x.trim()),
                })
              }
            />
          </label>
          <div className="local-actions">
            <button className="primary" onClick={() => setSaveOpen(true)}>
              保存检查快照
            </button>
            <button
              onClick={() =>
                downloadText(
                  "listing.txt",
                  p.listing.title + "\n\n" + p.listing.bullets.join("\n"),
                  "text/plain",
                )
              }
            >
              导出文案
            </button>
          </div>
          <h3>检查结果 · {findings.length} 项</h3>
          <p className="local-note">
            {summarize(findings).violations ?? 0}{" "}
            项规则问题；其余缺口请逐项核对。
          </p>
          {findings.map((f) => (
            <div className="local-finding" key={f.id}>
              <b>{f.title}</b>
              <p>{f.detail}</p>
              {f.evidence && <small>{f.evidence}</small>}
            </div>
          ))}
        </section>
      </div>
      {message && (
        <p role="status" className="local-note">
          {message}
        </p>
      )}
      {saveOpen && (
        <SaveResultModal
          toolId="listing"
          onConfirm={save}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </>
  );
}
