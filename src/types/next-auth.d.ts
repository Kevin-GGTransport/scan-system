import type { CredentialStamp } from "@/lib/auth/credential-session"
import type { DefaultSession } from "@auth/core/types"

/**
 * next-auth v5 beta.32 的 next-auth/… 只是 @auth/core 的再导出，
 * Session/User 的模块增强必须挂在 "@auth/core/types"、JWT 挂在 "@auth/core/jwt"
 * （项目已直接依赖同版本 @auth/core，保证解析到同一份文件，pnpm 去重）。
 * User.id 已由 DefaultUser 提供（id?: string），不重复声明。
 */

declare module "@auth/core/types" {
  interface User {
    username?: string
    role?: string
    personnelId?: string
    /** 登录时选定的数据库实例 key（如 "OAK仓库"），会话终身绑定 */
    dbKey?: string
    credential?: CredentialStamp
  }

  interface Session {
    user?: DefaultSession["user"] & {
      username?: string
      role?: string
      personnelId?: string
      dbKey?: string
      warehouseLabel?: string
    }
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string
    username?: string
    role?: string
    personnelId?: string
    dbKey?: string
    credential?: CredentialStamp
  }
}
