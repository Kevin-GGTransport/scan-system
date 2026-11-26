"use client";

/**
 * 登录表单：先选仓库（= 选数据库，进 JWT 终身绑定）再输账号密码。
 * 工业暗色 HMI：大触控目标、账号等宽字体、hivis 主按钮。
 */
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Warehouse } from "lucide-react";

export function LoginForm({
  warehouses,
}: {
  warehouses: { key: string; label: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dbKey, setDbKey] = useState(warehouses[0]?.key ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await signIn("credentials", {
        username,
        password,
        dbKey,
        redirect: false,
      });
      if (!result || result.error) {
        setError("账号、密码或仓库选择不正确");
        return;
      }
      const callbackUrl = searchParams.get("callbackUrl");
      router.push(callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/");
      router.refresh();
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      {/* 仓库选择器（= 数据库）：本页唯一的"单选大按钮" */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Warehouse className="h-3.5 w-3.5" aria-hidden />
          仓库
        </legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="选择仓库">
          {warehouses.map((wh) => {
            const active = wh.key === dbKey;
            return (
              <button
                key={wh.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDbKey(wh.key)}
                className={
                  "h-14 rounded-lg border text-base font-semibold touch-manipulation active:scale-[0.99] transition-colors " +
                  (active
                    ? "border-hivis bg-hivis/15 text-hivis"
                    : "border-border bg-card text-muted-foreground hover:text-foreground")
                }
              >
                {wh.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">登录后本次作业读写该仓库的数据库</p>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-xs font-medium text-muted-foreground">
          账号
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="font-code h-14 w-full rounded-lg border border-border bg-card px-4 text-lg outline-none transition-colors focus:border-hivis"
          placeholder="用户名"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="font-code h-14 w-full rounded-lg border border-border bg-card px-4 text-lg outline-none transition-colors focus:border-hivis"
          placeholder="••••••••"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-signal-stop/15 px-3 py-2 text-sm text-signal-stop">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !dbKey}
        className="mt-1 h-16 rounded-xl bg-hivis text-lg font-bold text-primary-foreground touch-manipulation active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? "登录中…" : "登录"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        账号由 ERP 统一管理（仓库作业角色）
      </p>
    </form>
  );
}
