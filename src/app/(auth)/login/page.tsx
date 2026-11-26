/**
 * 登录页（server 壳）：仓库列表来自 DB_INSTANCES（服务端解析，客户端拿不到 env）。
 * 登录选仓后 dbKey 进 JWT，会话终身绑定该库。
 */
import { Suspense } from "react";
import { ScanLine } from "lucide-react";
import { getDbInstances } from "@/lib/db/instances";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  const warehouses = getDbInstances().map((i) => ({ key: i.key, label: i.label }));

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-2">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-hivis/40 bg-hivis/10">
          <ScanLine className="h-8 w-8 text-hivis" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-wide">
          GNG <span className="text-hivis">扫码作业</span>
        </h1>
        <p className="text-xs text-muted-foreground">仓库连续扫码作业系统</p>
      </div>

      <Suspense fallback={<div className="h-80 w-full max-w-sm animate-pulse rounded-lg bg-card/50" />}>
        <LoginForm warehouses={warehouses} />
      </Suspense>
    </div>
  );
}
