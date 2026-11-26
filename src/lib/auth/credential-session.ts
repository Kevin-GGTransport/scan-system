/**
 * 凭证戳 — 克隆自 ERP lib/auth/credential-session.ts（多库版）。
 * 绑定 (dbKey, userId, password_hash)：每次 JWT 刷新回**同一个库**重验，
 * 改密/换库即吊销所有已发 JWT。Prisma 经动态 import 引入，
 * 避免静态进 proxy 打包图（照 ERP 模式）。
 */

export interface CredentialStamp {
  dbKey: string
  userId: string
  version: string
}

export async function credentialStamp(
  dbKey: string,
  userId: string,
  passwordHash: string
): Promise<CredentialStamp> {
  const bytes = new TextEncoder().encode(JSON.stringify([dbKey, userId, passwordHash]))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return {
    dbKey,
    userId,
    version: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
  }
}

type ErpAccount = {
  id: bigint
  username: string
  full_name: string | null
  role: string | null
  status: string | null
  password_hash: string
  personnel_id: bigint | null
}

/** 到指定库查账号（登录与 JWT 回验都走这里 → 用户始终在自己登录的那个库校验） */
export async function activeCredentialAccount(
  dbKey: string,
  userId: string
): Promise<ErpAccount | null> {
  if (!/^\d+$/.test(userId)) return null
  const { getErpDb } = await import('@/lib/prisma-erp')
  const db = await getErpDb(dbKey)
  const account = await db.client.users.findUnique({
    where: { id: BigInt(userId) },
    select: {
      id: true, username: true, full_name: true, role: true,
      status: true, password_hash: true, personnel_id: true,
    },
  })
  return account?.status === 'active' ? account : null
}

export async function validatedCredentialAccount(
  stamp: CredentialStamp | undefined
): Promise<ErpAccount | null> {
  if (
    !stamp ||
    typeof stamp.dbKey !== 'string' ||
    typeof stamp.userId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(stamp.version ?? '')
  ) {
    return null
  }
  const account = await activeCredentialAccount(stamp.dbKey, stamp.userId)
  if (!account) return null
  const current = await credentialStamp(stamp.dbKey, stamp.userId, account.password_hash)
  return current.version === stamp.version ? account : null
}
