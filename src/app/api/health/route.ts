import { auth } from "@/lib/auth"
import { getDbInstances } from "@/lib/db/instances"
import { getErpDb } from "@/lib/prisma-erp"
import { jsonResponse } from "@/lib/api/serialize"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return jsonResponse({ status: "error", message: "未登录" }, 401)
  }
  try {
    // 逐实例自检：getErpDb 内含 db_identity 校验（身份不符抛错 → 该实例标 fail）
    const instances = await Promise.all(
      getDbInstances().map(async (inst) => {
        try {
          const db = await getErpDb(inst.key)
          const [users, bins] = await Promise.all([
            db.client.users.count(),
            db.client.bin_locations.count(),
          ])
          return { dbKey: inst.key, label: inst.label, status: "ok" as const, users, bins }
        } catch (error) {
          return {
            dbKey: inst.key,
            label: inst.label,
            status: "fail" as const,
            message: error instanceof Error ? error.message : String(error),
          }
        }
      })
    )
    return jsonResponse({ status: "ok", instances })
  } catch (error) {
    console.error("[health] 连库失败:", error)
    return jsonResponse({ status: "error", message: "数据库连接失败" }, 500)
  }
}
