import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDbInstance } from "@/lib/db/instances"

/**
 * 登录守卫（Next 16 中间件，文件必须在 src/ 内，Node 运行时）：
 * - 页面未登录 → 跳 /login（带 callbackUrl，登录后回跳）
 * - API 未登录 → 401 JSON（use-scan-job 收到 401 会兜底跳登录）
 * - 会话的 dbKey 必须仍是已知数据库实例（防配置变更后旧 token 指向不存在的库）
 * - 公开：/login、/api/auth（NextAuth 自身）、rootCA 证书（手机装信任必须先于登录拿到）
 */
export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  const publicPaths = ["/login", "/api/auth"]
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  if (!session?.user || !session.user.dbKey || !getDbInstance(session.user.dbKey)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 })
    }
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  // 静态资源与 NextAuth 端点不经过守卫；rootCA 三件证书文件保持匿名可取
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|rootCA).*)"],
}
