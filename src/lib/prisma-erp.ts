/**
 * ERP 库客户端（多库版，克隆 ERP lib/prisma/clients.ts 的安全核心并裁剪）。
 *
 * 「必须保证修改的是对应的数据库数据」在这里落地为三层：
 * 1. 连接绑死：PrismaClient 构造时绑定该实例的连接串，运行期不可漂移；
 *    按 dbKey 缓存在 globalThis（dev HMR 不重连）
 * 2. db_identity 自检：每个库有一张 db_identity 表存自己的身份戳（ERP 建），
 *    首次取用时校验「实际连到的库 == 声称的 dbKey」，不符直接抛错拒绝服务——
 *    防 DB_INSTANCES 的 key/url 配反写错库；表未建时告警放行
 * 3. 无默认单例：不导出 prismaErp，所有调用方必须显式 getErpDb(dbKey)，
 *    编译期就不存在「忘了选库」的路径
 */
import { PrismaClient } from "@/lib/generated/prisma-erp"
import { dbKeyToWarehouseId, getDbInstance } from "@/lib/db/instances"

export type ErpDb = {
  dbKey: string
  label: string
  warehouseId: bigint
  client: PrismaClient
}

const globalForPrisma = globalThis as unknown as {
  __erpClients?: Map<string, PrismaClient>
  __erpIdentityChecked?: Map<string, Promise<void>>
}

function clientCache(): Map<string, PrismaClient> {
  globalForPrisma.__erpClients ??= new Map()
  return globalForPrisma.__erpClients
}

/** 库身份自检（每实例只跑一次，结果缓存为 Promise 防并发重复查） */
function verifyIdentity(dbKey: string, client: PrismaClient): Promise<void> {
  globalForPrisma.__erpIdentityChecked ??= new Map()
  const checked = globalForPrisma.__erpIdentityChecked
  if (checked.has(dbKey)) return checked.get(dbKey)!

  const task = (async () => {
    try {
      const rows = await client.$queryRaw<{ db_key: string }[]>`
        SELECT db_key FROM public.db_identity LIMIT 1
      `
      const actual = rows[0]?.db_key
      if (actual && actual !== dbKey) {
        throw new Error(
          `[DB自检] 实例 "${dbKey}" 实际连接到了 "${actual}" 的库！请检查 DB_INSTANCES 的 key 与连接串是否配反。`
        )
      }
      if (actual) {
        console.log(`[DB自检] 实例 "${dbKey}" ↔ 数据库身份校验通过`)
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("[DB自检]")) throw err
      // db_identity 表不存在等：告警但不阻塞（表由 ERP/DBeaver 手动建）
      console.warn(`[DB自检] 实例 "${dbKey}" 未能校验身份（db_identity 表可能未创建），跳过`)
    }
  })()
  checked.set(dbKey, task)
  return task
}

/**
 * 取绑定库的完整上下文（客户端 + 仓库 ID + 显示名）。
 * dbKey 必须是 DB_INSTANCES 里的已知 key，且该库能解析出 warehouse_id，否则抛错。
 */
export async function getErpDb(dbKey: string): Promise<ErpDb> {
  const instance = getDbInstance(dbKey)
  if (!instance) throw new Error(`数据库实例不存在: ${dbKey}`)
  const warehouseId = dbKeyToWarehouseId(dbKey)
  if (warehouseId === null) {
    throw new Error(`数据库实例 "${dbKey}" 没有对应的 warehouse_id（查 DB_WAREHOUSE_MAP）`)
  }

  const cache = clientCache()
  let client = cache.get(dbKey)
  if (!client) {
    client = new PrismaClient({
      datasources: { db: { url: instance.url } },
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    })
    cache.set(dbKey, client)
  }

  await verifyIdentity(dbKey, client)
  return { dbKey, label: instance.label, warehouseId, client }
}
