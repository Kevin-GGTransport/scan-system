import { z } from "zod"
import { auth } from "@/lib/auth"
import { getErpDb } from "@/lib/prisma-erp"
import { jsonResponse } from "@/lib/api/serialize"
import { parseScanPayload } from "@/lib/scan/payload"
import { lockInStockLots, resolveBin, resolveGoods } from "@/lib/scan/resolve"

const BodySchema = z.object({
  payload: z.string().min(1).max(256),
  binCode: z.string().min(1).max(50).nullish(),
  chosenOrderDetailId: z.string().regex(/^\d+$/).nullish(),
})

const UNMATCHED_MESSAGES: Record<string, string> = {
  no_order: "系统中没有这个柜号的在途订单",
  no_detail: "订单下没有明细",
  destination_mismatch: "仓点对不上",
  not_in_stock: "这个明细没有在库批次（未入库或已出库）",
}

export async function POST(req: Request) {
  // 操作员 = 登录会话用户；库 = 会话绑定的 dbKey（proxy 已拦未登录，这里是纵深防御）
  const session = await auth()
  const operatorIdStr = session?.user?.id
  const dbKey = session?.user?.dbKey
  if (!operatorIdStr || !/^\d+$/.test(operatorIdStr) || !dbKey) {
    return jsonResponse({ outcome: "error", message: "登录已失效，请重新登录" }, 401)
  }
  const operatorId = BigInt(operatorIdStr)
  const db = await getErpDb(dbKey) // db_identity 自检不过会抛错（防配置写反写错库）

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ outcome: "error", message: "请求体不是 JSON" }, 400)
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ outcome: "error", message: "入参不合法" }, 400)
  }
  const { payload, binCode, chosenOrderDetailId } = parsed.data

  const scan = parseScanPayload(payload)

  // ── 库位码 ────────────────────────────────────────────
  if (scan.type === "GGBIN" || scan.type === "BIN_GUESS") {
    const verdict = await resolveBin(db, scan.binCode)
    if (verdict.status === "invalid") {
      return jsonResponse({
        outcome: "invalid_bin",
        message: `库位 ${scan.binCode} 不存在或已停用`,
      })
    }
    return jsonResponse({
      outcome: "bin_set",
      message: `当前库位 ${verdict.binCode}，在库 ${verdict.occupants} 批`,
      data: {
        binCode: verdict.binCode,
        binLocationId: verdict.binLocationId,
        occupants: verdict.occupants,
      },
    })
  }

  if (scan.type === "UNKNOWN") {
    return jsonResponse({
      outcome: "unmatched",
      message: "无法识别的码",
      data: { reason: "unknown_payload", raw: scan.raw },
    })
  }

  // ── 货物码（GGCT / GGOD / CODE128_GUESS） ────────────
  if (!binCode) {
    return jsonResponse({ outcome: "need_bin", message: "请先扫库位码" })
  }
  const bin = await resolveBin(db, binCode)
  if (bin.status === "invalid") {
    return jsonResponse({
      outcome: "invalid_bin",
      message: `库位 ${binCode} 不存在或已停用，请重扫库位码`,
    })
  }

  const resolved = await resolveGoods(
    db,
    scan,
    chosenOrderDetailId !== undefined && chosenOrderDetailId !== null
      ? BigInt(chosenOrderDetailId)
      : undefined
  )
  if (resolved.status === "ambiguous") {
    return jsonResponse({
      outcome: "ambiguous",
      message: "这个柜号有多个明细，请点选",
      data: { candidates: resolved.candidates },
    })
  }
  if (resolved.status === "unmatched") {
    return jsonResponse({
      outcome: "unmatched",
      message: UNMATCHED_MESSAGES[resolved.reason] ?? "未匹配",
      data: { reason: resolved.reason },
    })
  }

  const candidate = resolved.candidate
  const orderDetailId = BigInt(candidate.orderDetailId)

  const verdict = await db.client.$transaction(async (tx) => {
    // 锁定该明细的在库批次行，串行化并发绑定
    const lots = await lockInStockLots(tx, orderDetailId)
    if (lots.length === 0) {
      return { outcome: "not_in_stock" as const, lots: [] as typeof lots }
    }

    // 全部已在目标库位 → duplicate（含弱网重放：条件更新天然幂等）
    if (lots.every((l) => l.storageLocationCode === bin.binCode)) {
      return { outcome: "duplicate" as const, lots }
    }

    // 按当前库位值分组做条件更新（FOR UPDATE 后理论必成，条件子句是保险带）
    const groups = new Map<string | null, string[]>()
    for (const lot of lots) {
      const ids = groups.get(lot.storageLocationCode) ?? []
      ids.push(lot.inventoryLotId)
      groups.set(lot.storageLocationCode, ids)
    }

    let updated = 0
    let expected = 0
    for (const [before, ids] of groups) {
      if (before === bin.binCode) continue
      expected += ids.length
      const result = await tx.inventory_lots.updateMany({
        where: {
          inventory_lot_id: { in: ids.map((id) => BigInt(id)) },
          storage_location_code: before,
        },
        data: {
          storage_location_code: bin.binCode,
          updated_by: operatorId,
          updated_at: new Date(),
        },
      })
      updated += result.count
    }

    if (updated < expected) {
      return { outcome: "conflict" as const, lots }
    }

    const movedFrom = [...groups.keys()].filter((code) => code !== null && code !== bin.binCode)
    return { outcome: movedFrom.length > 0 ? ("moved" as const) : ("matched" as const), lots }
  })

  if (verdict.outcome === "not_in_stock") {
    return jsonResponse({
      outcome: "unmatched",
      message: UNMATCHED_MESSAGES.not_in_stock,
      data: { reason: "not_in_stock" },
    })
  }

  const movedFrom = [...new Set(
    verdict.lots
      .map((l) => l.storageLocationCode)
      .filter((code): code is string => code !== null && code !== bin.binCode)
  )]

  const MESSAGES: Record<typeof verdict.outcome, string> = {
    matched: `已绑定到 ${bin.binCode}`,
    moved: `移位：${movedFrom.join("、")} → ${bin.binCode}`,
    duplicate: `已在 ${bin.binCode}，重复扫码`,
    conflict: "库位刚被其他人改动，请重扫",
  }

  return jsonResponse({
    outcome: verdict.outcome,
    message: MESSAGES[verdict.outcome],
    data: {
      binCode: bin.binCode,
      container: candidate.container,
      destinationCode: candidate.destinationCode,
      destinationName: candidate.destinationName,
      po: candidate.po,
      estimatedPallets: candidate.estimatedPallets,
      orderDetailId: candidate.orderDetailId,
      lots: verdict.lots,
      movedFrom,
    },
  })
}
