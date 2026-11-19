"use client";
import { useState } from "react";
import { ProductSwitcher } from "../../tools/product-switcher";
import { SaveResultModal } from "../../tools/save-result-modal";
import {
  analyseLocally,
  DEFAULT_TOPICS,
  SAMPLE_CSV,
} from "../../../../lib/crossborder/local-workbench";
import { saveProductRecord } from "../../../../lib/crossborder/products";
import { downloadText } from "../../../../lib/crossborder/backup";
type Analysis = ReturnType<typeof analyseLocally>;
export function InsightPanel() {
  const [csv, setCsv] = useState(""),
    [rival, setRival] = useState(""),
    [topics, setTopics] = useState(DEFAULT_TOPICS),
    [result, setResult] = useState<Analysis | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [saveOpen, setSaveOpen] = useState(false),
    [inputAtRun, setInputAtRun] = useState("");
  const stale = !!result && inputAtRun !== JSON.stringify([csv, rival, topics]);
  async function upload(file: File | undefined, set: (s: string) => void) {
    if (!file) return;
    if (file.size > 5_000_000) {
      setError("请使用小于 5 MB 的 CSV 文件。");
      return;
    }
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError("请上传 CSV 或 TXT；Excel 请先另存为 CSV。");
      return;
    }
    set(await file.text());
    setError("");
  }
  function run() {
    try {
      setResult(analyseLocally(csv, rival, topics));
      setInputAtRun(JSON.stringify([csv, rival, topics]));
      setError("");
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查 CSV 格式。");
    }
  }
  function save() {
    if (!result || stale) return;
    saveProductRecord("reviews", "评论样本统计", {
      result,
      csv,
      rival,
      topics,
      summary:
        "样本 " +
        result.profile.total +
        " 条 · 均分 " +
        result.profile.avgRating +
        "\n" +
        result.themes
          .map((t) => t.name + ": " + t.count + " 条 / " + t.share + "%")
          .join("\n"),
    });
    setMessage("评论与统计结果已保存到商品档案。");
  }
  return (
    <>
      <ProductSwitcher />
      <p className="local-note">
        按关键词命中统计，结果仅覆盖你上传的样本。不会判断语义或因果；一条评论可命中多个主题，占比之和可能超过
        100%。低分指 1—2 星，高分指 4—5 星，未评分不计入高低分。
      </p>
      <div className="local-grid">
        <section className="local-panel">
          <h2>我的评论样本</h2>
          <label className="local-field">
            评论 CSV
            <textarea
              aria-label="我的评论 CSV"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="rating,date,variant,text"
            />
          </label>
          <label className="local-field">
            上传我的评论 CSV
            <input
              type="file"
              accept=".csv,.txt"
              onChange={(e) => void upload(e.target.files?.[0], setCsv)}
            />
          </label>
          <div className="local-actions">
            <button
              onClick={() => {
                setCsv(SAMPLE_CSV);
                setMessage("已填入演示样本，请替换为自己的评论。");
              }}
            >
              填入演示样本
            </button>
            <button
              onClick={() =>
                downloadText("reviews-example.csv", SAMPLE_CSV, "text/csv")
              }
            >
              下载 CSV 示例
            </button>
          </div>
        </section>
        <section className="local-panel">
          <h2>竞品评论（可选）</h2>
          <label className="local-field">
            竞品 CSV
            <textarea
              aria-label="竞品评论 CSV"
              value={rival}
              onChange={(e) => setRival(e.target.value)}
            />
          </label>
          <label className="local-field">
            上传竞品评论 CSV
            <input
              type="file"
              accept=".csv,.txt"
              onChange={(e) => void upload(e.target.files?.[0], setRival)}
            />
          </label>
        </section>
      </div>
      <section className="local-panel">
        <h2>主题与关键词</h2>
        <label className="local-field">
          每行一个主题
          <textarea
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
          />
        </label>
        <div className="local-actions">
          <button className="primary" onClick={run} disabled={!csv.trim()}>
            分析评论样本
          </button>
        </div>
      </section>
      {error && (
        <p className="local-notice" role="alert">
          {error}
        </p>
      )}
      {stale && (
        <p className="local-notice">
          输入已经变化，下方是上次结果。请重新分析后再保存或导出。
        </p>
      )}
      {result && (
        <section className="local-panel">
          <h2>样本统计</h2>
          <div className="local-stats">
            <span>
              <b>{result.profile.total}</b>
              <small>我方评论</small>
            </span>
            <span>
              <b>{result.profile.avgRating || "—"}</b>
              <small>已评分评论均分</small>
            </span>
            <span>
              <b>{result.competitor?.profile.total ?? "—"}</b>
              <small>竞品评论</small>
            </span>
          </div>
          {result.warnings.map((w) => (
            <p className="local-note" key={w.id}>
              {w.text}
            </p>
          ))}
          <div className="local-table-wrap">
            <table className="local-table">
              <thead>
                <tr>
                  <th>主题</th>
                  <th>我方条数 / 占比</th>
                  <th>低分 / 高分</th>
                  <th>竞品条数 / 占比</th>
                </tr>
              </thead>
              <tbody>
                {result.themes.map((t, i) => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td>
                      {t.count} / {t.share}%
                    </td>
                    <td>
                      {t.low} / {t.high}
                    </td>
                    <td>
                      {result.competitor
                        ? result.competitor.themes[i].count +
                          " / " +
                          result.competitor.themes[i].share +
                          "%"
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.themes
            .filter((t) => t.count)
            .map((t) => (
              <details className="local-record" key={t.name}>
                <summary>{t.name} · 代表性原文</summary>
                {t.evidence.map((quote, i) => (
                  <p key={i}>{quote}</p>
                ))}
              </details>
            ))}
          <div className="local-actions">
            <button onClick={() => setSaveOpen(true)} disabled={stale}>
              保存分析快照
            </button>
            <button
              disabled={stale}
              onClick={() =>
                downloadText(
                  "review-analysis.json",
                  JSON.stringify(result, null, 2),
                )
              }
            >
              导出分析
            </button>
          </div>
        </section>
      )}
      {message && (
        <p className="local-note" role="status">
          {message}
        </p>
      )}
      {saveOpen && (
        <SaveResultModal
          toolId="reviews"
          onConfirm={save}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </>
  );
}
