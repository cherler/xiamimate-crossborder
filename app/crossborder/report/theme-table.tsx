import type { ThemeAgg } from "../../../lib/crossborder/deep-report";

/** 真实报告与虚拟示例共用同一张主题表，避免列宽、数字字体和对齐规则漂移。 */
export function ReportThemeTable({ themes, title, note = "数字按实际样本计算" }: {
  themes: ThemeAgg[];
  title: string;
  note?: string;
}) {
  if (!themes.length) return null;
  return (
    <div className="wb-block">
      <div className="section-heading"><span>{title}</span><em>{note}</em></div>
      <div className="deepr-table-wrap">
        <table className="deepr-table">
          <thead><tr><th>主题</th><th>条数</th><th>占比</th><th>均分</th><th>负面占比</th><th>原文</th></tr></thead>
          <tbody>
            {themes.map((theme) => (
              <tr key={theme.theme}>
                <td>{theme.theme}</td>
                <td>{theme.count}</td>
                <td>{Math.round(theme.share * 100)}%</td>
                <td>{theme.avgRating ?? "—"}</td>
                <td className={theme.negShare >= 0.5 ? "neg" : ""}>{Math.round(theme.negShare * 100)}%</td>
                {/* 引文一直在数据里,却从没渲染 —— 付费报告的举证水平因此低于免费工作台
                    (工作台每个主题都带原文)。一行数字要求读者无条件相信,给了原文才能自己核。 */}
                <td className="deepr-quotes">
                  {theme.quotes?.length
                    ? <details><summary>{theme.quotes.length} 条</summary>
                        {theme.quotes.map((q, i) => <q key={i}>{q}</q>)}
                      </details>
                    : <span className="is-noev">无</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
