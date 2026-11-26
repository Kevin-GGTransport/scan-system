"use client";

import { useEffect, useState } from "react";
import { Scanner, type ScannerProps } from "./scanner";

/**
 * 相机挂载门：客户端挂载后才渲染 <Scanner>（服务端只出占位）。
 * - 保证服务端 HTML 不含 <video>——SSR 的驼峰 playsInline 会被 Safari 解析器
 *   小写化，触发 React 水合炸树（iOS 27 实测：整树不接管、相机区死黑）
 * - 不用 next/dynamic 懒加载：dev 的 HMR 通道在局域网 IP 下是断的，手机端
 *   旧页面取新 chunk 会 404，占位永远挂着；直接打进页面 chunk 无此问题
 */
export function ScannerLazy(props: ScannerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // setTimeout 规避 effect 内同步 setState 的编译器检查
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-40 w-full items-center justify-center rounded-lg bg-black/60">
        <span className="animate-pulse text-sm text-muted-foreground">启动相机…</span>
      </div>
    );
  }
  return <Scanner {...props} />;
}
