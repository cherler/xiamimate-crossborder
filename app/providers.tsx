"use client";

import { Component, type ReactNode } from "react";
import { AuthProvider } from "../lib/auth";
import { SignupWelcome } from "./auth/signup-welcome";

/** 客户端全局 Provider(账号态等)。根布局用它包住整站。 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        {children}
        <SignupWelcome />
      </AuthProvider>
    </ErrorBoundary>
  );
}

/** 排查用:捕获客户端渲染/hydrate 异常并**显示在页面上**(而不是白屏),便于定位。 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, font: "13px/1.6 monospace", color: "#16212c", background: "#fff" }}>
          <div style={{ background: "#c0453f", color: "#fff", padding: "10px 14px", borderRadius: 8, marginBottom: 12 }}>
            ⚠️ 客户端渲染出错(念给 Claude):
          </div>
          <div style={{ whiteSpace: "pre-wrap", color: "#c0453f", fontWeight: 700 }}>
            {this.state.error.message}
          </div>
          <div style={{ whiteSpace: "pre-wrap", color: "#647587", marginTop: 10, fontSize: 12 }}>
            {this.state.error.stack?.split("\n").slice(0, 8).join("\n")}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
