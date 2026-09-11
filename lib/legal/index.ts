/**
 * 法律文档元信息。注册同意勾选记录 LEGAL_VERSION,正文修订(实质性变更)时手动升版,
 * 以便对"用户在哪个版本上点了同意"留痕(合规要求:同意版本可追溯)。
 */
export { TERMS_MD } from "./terms";
export { PRIVACY_MD } from "./privacy";

// 版本元信息搬去 ./version（不带正文），这里转出以免改动既有 import。
// **只要版本号的地方请直接 import "./legal/version"** —— 从这里取会把
// 41KB 的协议全文一起打进包里（页眉制品踩过一次）。
export { LEGAL_VERSION, LEGAL_EFFECTIVE, LEGAL_IS_DRAFT } from "./version";

export type LegalDocKind = "terms" | "privacy";
