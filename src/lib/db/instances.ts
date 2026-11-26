/**
 * 多库实例管理 — 克隆自 ERP lib/prisma/instances.ts（裁剪版）。
 *
 * DB_INSTANCES="OAK仓库=url1,SAV仓库=url2"（key 与 ERP 完全一致，连接串同一批库）
 * DB_WAREHOUSE_MAP="1000=OAK仓库,1=SAV仓库"（分库后每库一个仓库）
 * 不配 DB_INSTANCES 时退化为单库（default + warehouse 1000，即旧行为）。
 *
 * 纯解析无副作用；解析函数与带缓存的取值函数分开，便于 vitest 表驱动。
 */

export interface DbInstance {
  /** 唯一标识，与 ERP DB_INSTANCES 的 key 一致，如 "OAK仓库" */
  key: string
  /** PostgreSQL 连接串 */
  url: string
  /** 显示名称（当前就是 key） */
  label: string
}

export const OAK_DB_KEY = "OAK仓库"
export const SAV_DB_KEY = "SAV仓库"

/** 单库退化模式的 warehouse_id（保持旧版 OAK 行为不变） */
export const DEFAULT_WAREHOUSE_ID = BigInt(1000)

/** 解析 DB_INSTANCES；未配置时退化为 default 单实例（url 缺失则抛错） */
export function parseDbInstances(
  raw: string | undefined,
  fallbackUrl: string | undefined
): DbInstance[] {
  if (!raw) {
    if (!fallbackUrl) throw new Error("DATABASE_URL 环境变量未设置")
    return [{ key: "default", url: fallbackUrl, label: "默认" }]
  }
  const instances = raw.split(",").map((pair) => {
    const eqIdx = pair.indexOf("=") // URL 里有 '='，必须切第一个
    if (eqIdx === -1) throw new Error(`DB_INSTANCES 格式错误，应为 key=url: ${pair}`)
    return {
      key: pair.slice(0, eqIdx).trim(),
      url: pair.slice(eqIdx + 1).trim(),
      label: pair.slice(0, eqIdx).trim(),
    }
  })
  if (instances.length === 0) throw new Error("DB_INSTANCES 为空，至少需要一个数据库实例")
  return instances
}

/** 解析 DB_WAREHOUSE_MAP → warehouse_id(字符串) → dbKey；坏段跳过 */
export function parseWarehouseMap(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!raw) return map
  for (const pair of raw.split(",")) {
    const eqIdx = pair.indexOf("=")
    if (eqIdx === -1) continue
    map.set(pair.slice(0, eqIdx).trim(), pair.slice(eqIdx + 1).trim())
  }
  return map
}

let _instances: DbInstance[] | null = null
let _whToDb: Map<string, string> | null = null

/** 取全部实例（进程内缓存；key 顺序即登录选择器顺序） */
export function getDbInstances(): DbInstance[] {
  if (!_instances) {
    _instances = parseDbInstances(process.env.DB_INSTANCES, process.env.DATABASE_URL)
  }
  return _instances
}

/** 按 key 取实例；不存在返回 undefined（调用方据此拒绝会话） */
export function getDbInstance(key: string): DbInstance | undefined {
  return getDbInstances().find((i) => i.key === key)
}

/**
 * dbKey → warehouse_id（BigInt）。业务 SQL 的仓库过滤由此来，不再有硬编码。
 * 无映射配置时：default 单库 → 1000（旧行为）；查不到映射返回 null，
 * 调用方必须把 null 当配置错误抛出，禁止退化成无仓库过滤的全库匹配。
 */
export function dbKeyToWarehouseId(dbKey: string): bigint | null {
  const map = _whToDb ?? (_whToDb = parseWarehouseMap(process.env.DB_WAREHOUSE_MAP))
  const key = map.size === 0 && dbKey === "default" ? "1000" : dbKey
  const whId = [...map.entries()].find(([, db]) => db === key)?.[0]
  return whId !== undefined ? BigInt(whId) : null
}
