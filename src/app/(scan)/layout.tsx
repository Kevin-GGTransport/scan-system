import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

// 读会话的 layout 在 cacheComponents 下必须声明非 instant 并显式建连
export const instant = false;

export default async function ScanLayout({ children }: LayoutProps<"/">) {
  await connection();
  const session = await auth();

  return (
    // h-dvh 定死视口高（min-h-dvh 会让子级 h-full 解析成 0，相机区塌陷）——iOS 实测坑
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2">
        <span className="text-sm font-semibold tracking-wide">
          GNG <span className="text-hivis">扫码作业</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {session?.user?.name ?? session?.user?.username}
          </span>
          {session?.user?.warehouseLabel ? (
            <span className="rounded-md bg-hivis/15 px-2 py-0.5 text-xs font-medium text-hivis">
              {session.user.warehouseLabel}
            </span>
          ) : null}
          <SignOutButton />
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
