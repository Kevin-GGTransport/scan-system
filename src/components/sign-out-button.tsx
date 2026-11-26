"use client"

import { signOut } from "next-auth/react"
import { LogOut } from "lucide-react"

/** 顶栏退出按钮：吊销会话 cookie 后回登录页 */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ redirectTo: "/login" })}
      className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-manipulation"
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      退出
    </button>
  )
}
