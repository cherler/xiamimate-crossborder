"use client";

/**
 * hero 低频海洋氛围(乙档,#70):上浮的小气泡,teal/橙 6–10% 透明度。
 *
 * 纪律:12fps 定时器、只画 hero 内的小画布、滚出视口即停(IntersectionObserver)、
 * 页面隐藏即停、prefers-reduced-motion 完全不渲染。24 个粒子封顶。
 */

import { useEffect, useRef } from "react";
import { isEco, subscribeEco } from "../../lib/eco-mode";

const FPS = 12;
const N = 24;

type Bubble = { x: number; y: number; r: number; v: number; drift: number; phase: number; warm: boolean };

export function HeroBubbles() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0;
    const fit = () => {
      w = host.clientWidth; h = host.clientHeight;
      canvas.width = w; canvas.height = h;
    };
    fit();
    window.addEventListener("resize", fit);

    const bubbles: Bubble[] = Array.from({ length: N }, () => ({
      x: Math.random(), y: Math.random(), r: 2 + Math.random() * 5,
      v: 0.0012 + Math.random() * 0.002, drift: (Math.random() - 0.5) * 0.0008,
      phase: Math.random() * Math.PI * 2, warm: Math.random() < 0.25,
    }));

    let visible = true;
    const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; });
    io.observe(host);

    // 省流模式:停画并清空画布(连续重绘归零);退出省流再恢复。
    let paused = isEco();
    if (paused) ctx.clearRect(0, 0, w, h);
    const unsub = subscribeEco((v) => { paused = v; if (v) ctx.clearRect(0, 0, w, h); });

    const tick = () => {
      if (paused || !visible || document.hidden) return;
      ctx.clearRect(0, 0, w, h);
      const t = performance.now() / 1000;
      for (const b of bubbles) {
        b.y -= b.v;
        b.x += b.drift + Math.sin(t * 0.7 + b.phase) * 0.0006;
        if (b.y < -0.05) { b.y = 1.05; b.x = Math.random(); }
        if (b.x < -0.05) b.x = 1.05;
        if (b.x > 1.05) b.x = -0.05;
        ctx.beginPath();
        ctx.arc(b.x * w, b.y * h, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.warm ? "rgba(245,157,82,.10)" : "rgba(12,148,136,.08)";
        ctx.fill();
      }
    };
    const iv = setInterval(tick, 1000 / FPS);
    return () => { clearInterval(iv); io.disconnect(); unsub(); window.removeEventListener("resize", fit); };
  }, []);

  return <canvas ref={ref} className="hero-bubbles" aria-hidden="true" />;
}
