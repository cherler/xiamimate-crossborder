/**
 * 「今天」的唯一定义(前端)。
 *
 * 每日登录领积分是**服务端**按产品时区(Asia/Shanghai)发的,而前端判断「跨天了、
 * 该再探一次会话」用的是 `new Date().toLocaleDateString("en-CA")` —— 浏览器本地时区。
 * 两边对不上的后果,对跨境卖家(不少人就在海外、或按海外作息工作)是实打实的:
 *
 *   悉尼(UTC+11,快 3 小时):本地午夜 = 北京 21:00,这时探一次,服务端说「还是昨天,
 *     已领过」返回 0;等北京 00:00(悉尼 03:00)真的翻篇了,本地日期却要到下一个
 *     悉尼午夜才变 —— **整整 21 小时探不到**,页面一直开着就一直领不到。
 *   欧洲(UTC+1,慢 7 小时):服务端在他们下午 17:00 翻篇,而客户端要等到本地午夜 ——
 *     晚 7 小时。
 *
 * 领取本身是幂等的,刷新一下就能拿到,所以不会丢钱;但用户看到的是
 * 「我开着页面一整天,积分没到账」,而且没有任何线索。
 *
 * 后端同一个概念在 app/daybound.py。两边都钉死同一个时区,不依赖运行环境。
 */

/** 产品时区。与后端 daybound.TZ_NAME / config.NEWS_REFRESH_TZ 保持一致。 */
export const PRODUCT_TZ = "Asia/Shanghai";

/** 产品时区下的今天,YYYY-MM-DD。用于「跨天了没有」这类判定,不用于展示。 */
export function productDay(at: Date = new Date()): string {
  return at.toLocaleDateString("en-CA", { timeZone: PRODUCT_TZ });
}
