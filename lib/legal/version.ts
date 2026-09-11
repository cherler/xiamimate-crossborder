/**
 * 只有版本元信息，**不带正文**。
 *
 * 拆出来的原因：`lib/legal/index.ts` 同时 `export { TERMS_MD, PRIVACY_MD }`，
 * 那是 41KB 的用户协议与隐私政策全文。注册时只要一个版本号，
 * 但从 index 里取会把全文一起打包 —— 页眉制品因此从 18KB(gzip) 涨到 85KB，
 * 而它是**每个模块每一页**都要加载的东西。
 *
 * 需要正文的地方（法务页）照旧从 index 取；只要版本号的地方从这里取。
 */

/** 协议/政策共用版本号。实质性修订时更新，并同步 LEGAL_EFFECTIVE。 */
export const LEGAL_VERSION = "2026-07-23";
/** 展示用生效日期。 */
export const LEGAL_EFFECTIVE = "2026 年 7 月 23 日";
/** 发布前草案提示。 */
export const LEGAL_IS_DRAFT = false;
