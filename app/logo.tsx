/**
 * 虾米君品牌标志(矢量,基于 IP 三视图提炼)。
 * 头像本体,无底座 —— 底座由使用处的容器(.brand-mark 等)提供;
 * favicon 的带底座版本在 public/favicon.svg,改形象两处同步。
 */

export function XiamiMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M24 15 C20.5 8 21 2.5 26.5 3.4" stroke="#d1772e" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <circle cx="26.8" cy="3.8" r="2.3" fill="#d1772e" />
      <path d="M40 15 C43.5 8 43 2.5 37.5 3.4" stroke="#d1772e" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <circle cx="37.2" cy="3.8" r="2.3" fill="#d1772e" />
      <clipPath id="xm-head"><rect x="11" y="14" width="42" height="48" rx="21" /></clipPath>
      <rect x="11" y="14" width="42" height="48" rx="21" fill="#f59d52" />
      <ellipse cx="32" cy="62" rx="16" ry="14" fill="#fbc98e" clipPath="url(#xm-head)" />
      <rect x="14" y="25" width="16.5" height="14" rx="7" fill="#fff" stroke="#2b2530" strokeWidth="3.6" />
      <rect x="33.5" y="25" width="16.5" height="14" rx="7" fill="#fff" stroke="#2b2530" strokeWidth="3.6" />
      <path d="M30.5 31.5 h3" stroke="#2b2530" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M14 30.5 H10.2" stroke="#2b2530" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M50 30.5 H53.8" stroke="#2b2530" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="23" cy="32.3" r="3.4" fill="#6f4a26" /><circle cx="24.2" cy="31.2" r="1.2" fill="#fff" />
      <circle cx="41" cy="32.3" r="3.4" fill="#6f4a26" /><circle cx="42.2" cy="31.2" r="1.2" fill="#fff" />
      <path d="M27.5 47.5 q4.5 4 9 0" stroke="#c2632a" strokeWidth="2.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
