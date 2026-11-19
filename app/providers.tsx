"use client";
import { Component, type ReactNode } from "react";
export function Providers({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="local-notice" role="alert">
          页面暂时无法显示，请刷新后重试。已保存的商品档案仍在当前浏览器中。
          <button onClick={() => window.location.reload()}>刷新页面</button>
        </div>
      );
    return this.props.children;
  }
}
