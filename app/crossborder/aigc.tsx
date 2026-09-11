/**
 * AIGC 标识(《人工智能生成合成内容标识办法》)。
 * - 显式标识:在 AI 生成内容周边显著位置展示 <AigcBadge/>。
 * - 复制/导出/分享:文本内容用 withAigcMark() 附上文字标识,随内容一起流出。
 * 集中在此,便于口径一致与后续按标准调整。
 */
import { Sparkles } from "lucide-react";

/** 复制 / 导出 / 分享时附加到文本里的显式标识(随内容传播)。 */
export const AIGC_MARK =
  "———\n【AI 生成】本内容由 AI 生成 / 辅助生成,可能存在错误或不完整,请核对后使用。生成于虾米伙伴（xiamimate.com）。";

/** 给一段将被复制/导出的文本附上 AIGC 文字标识。 */
export function withAigcMark(text: string): string {
  const t = (text || "").replace(/\s+$/, "");
  return `${t}\n\n${AIGC_MARK}`;
}

/** 页面上生成内容旁的显式标识徽章。 */
export function AigcBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="aigc-badge" title="本内容由 AI 生成 / 辅助生成,可能有误,请核对后使用">
      <Sparkles size={11} /> AI 生成{!compact && <em>· 请核对</em>}
    </span>
  );
}
