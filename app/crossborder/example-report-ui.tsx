import { Info } from "lucide-react";
import { EXAMPLE_REPORT_DISCLOSURE } from "../../lib/crossborder/example-reports";

export function ExampleReportBadge({ compact = false }: { compact?: boolean }) {
  return <span className={`example-report-badge${compact ? " is-compact" : ""}`}>示例</span>;
}

export function ExampleReportBanner() {
  return (
    <div className="example-report-banner" role="note">
      <Info size={16} />
      <span><b>示例报告</b>{EXAMPLE_REPORT_DISCLOSURE.replace(/^这是一份示例报告，?/, "：")}</span>
    </div>
  );
}
