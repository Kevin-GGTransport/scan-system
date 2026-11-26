import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { credentialStamp, validatedCredentialAccount } from "@/lib/auth/credential-session"
import { SCAN_ROLES } from "@/lib/auth/roles"
import { getDbInstance, getDbInstances } from "@/lib/db/instances"

/**
 * 克隆自 ERP auth.config.ts 并裁剪 + 多库化：
 * - 删 modulePermissions、cf_db_switch 运行期切库（本系统：登录时选库，会话终身绑定）
 * - 保留 credentialStamp（改密吊销 JWT）与 7 天 JWT 策略
 * - 登录多一个 dbKey 入参：authorize 到「所选库」的 users 表校验；
 *   token.dbKey 与凭证戳互相绑定，JWT 刷新回同一个库重验
 * - cookie 名独立于 ERP：localhost 下两应用同 host 共享 cookie（不分端口），必须隔离
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 天（仓库共用设备）
    updateAge: 4 * 60 * 60, // 4 小时活跃续期
  },
  cookies: {
    sessionToken: {
      name: "scan-system.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        // localhost (HTTP) 下 false，生产 (HTTPS) 下 true
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (!user.credential) return null
        token.sub = user.id
        token.id = user.id
        token.username = user.username
        token.role = user.role
        token.personnelId = user.personnelId
        token.name = user.name || user.username || user.id || ""
        token.dbKey = user.dbKey
        token.credential = user.credential
        return token
      }

      // 每次刷新：dbKey 必须仍是已知实例，且凭证戳与 dbKey 互相绑定
      if (!token.dbKey || !getDbInstance(token.dbKey)) return null
      if (!token.credential || token.credential.userId !== token.sub || token.credential.dbKey !== token.dbKey) {
        return null
      }
      try {
        const current = await validatedCredentialAccount(token.credential)
        if (!current) return null
        token.username = current.username
        token.name = current.full_name || current.username
        token.role = current.role || undefined
        token.personnelId =
          current.personnel_id !== null ? current.personnel_id.toString() : undefined
        return token
      } catch {
        // 无法验证的账号不得继续用缓存 JWT 访问
        return null
      }
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id ? String(token.id) : ""
        session.user.username = token.username ? String(token.username) : undefined
        session.user.role = token.role ? String(token.role) : undefined
        session.user.personnelId = token.personnelId ? String(token.personnelId) : undefined
        session.user.name = token.name ? String(token.name) : (token.username ? String(token.username) : undefined)
        session.user.dbKey = token.dbKey ? String(token.dbKey) : undefined
        session.user.warehouseLabel = token.dbKey ? getDbInstance(String(token.dbKey))?.label : undefined
      }
      return session
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        dbKey: { label: "仓库", type: "text" },
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        try {
          // 选库：登录表单传 dbKey，必须是已知实例；不传/传错退第一个（与 ERP 一致）
          const instances = getDbInstances()
          const requested = typeof credentials.dbKey === "string" ? credentials.dbKey : ""
          const instance = instances.find((i) => i.key === requested) ?? instances[0]!

          const { getErpDb } = await import("@/lib/prisma-erp")
          const db = await getErpDb(instance.key)

          const user = await db.client.users.findUnique({
            where: { username: credentials.username as string },
          })

          if (!user || user.status !== "active") {
            return null
          }

          const passwordsMatch = await bcrypt.compare(
            credentials.password as string,
            user.password_hash
          )

          if (!passwordsMatch) {
            return null
          }

          // 角色白名单：非扫码作业角色不允许登录本系统
          if (!SCAN_ROLES.includes(user.role ?? "")) {
            return null
          }

          return {
            id: user.id.toString(),
            name: user.full_name || user.username,
            username: user.username,
            role: user.role || undefined,
            personnelId:
              user.personnel_id !== null ? user.personnel_id.toString() : undefined,
            dbKey: instance.key,
            credential: await credentialStamp(
              instance.key,
              user.id.toString(),
              user.password_hash
            ),
          }
        } catch (error) {
          console.error("[Auth] 认证异常:", error)
          return null
        }
      },
    }),
  ],
  trustHost: true,
} satisfies NextAuthConfig
