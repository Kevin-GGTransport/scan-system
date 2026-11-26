/**
 * 服务端解析：扫到的货物码 / 库位码 → ERP 库的行。
 *
 * - 多库：所有函数显式收 ErpDb（会话绑定的库上下文），仓库过滤用 db.warehouseId，
 *   不存在任何隐式默认库
 * - 柜号匹配必须归一化（order_number 可能含空格，如 "SCAN 0000001"）——
 *   Prisma where 表达不了 regexp_replace，走参数化 $queryRaw；
 *   V1 量级顺序扫可接受，若变慢由 ERP 侧决策加表达式索引（本系统零 DDL）。
 * - 在库口径克隆 ERP lib/wms/in-stock-lots-scope.ts：
 *   inbound_receipt.status='received' 且 order_detail 无已装车出库单行。
 */
import type { PrismaClient } from "@/lib/generated/prisma-erp"
import type { ErpDb } from "@/lib/prisma-erp"
import type { ScanPayload } from "./payload"
import { normalizeContainer } from "./payload"

export type GoodsCandidate = {
  orderDetailId: string
  orderId: string
  container: string
  po: string | null
  destinationCode: string | null
  destinationName: string | null
  estimatedPallets: number | null
}

export type ResolvedGoods =
  | { status: "ok"; candidate: GoodsCandidate }
  | { status: "ambiguous"; candidates: GoodsCandidate[] }
  | { status: "unmatched"; reason: "no_order" | "no_detail" | "destination_mismatch" }

function normalizeCode(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/\s+/g, "")
}

/** GGOD：明细 ID 权威，柜号仅附属比对 */
async function resolveByDetailId(db: ErpDb, orderDetailId: bigint): Promise<ResolvedGoods> {
  const detail = await db.client.order_detail.findUnique({
    where: { id: orderDetailId },
    select: {
      id: true, order_id: true, po: true, estimated_pallets: true,
      orders: { select: { order_number: true } },
      locations: { select: { location_code: true, name: true } },
    },
  })
  if (!detail?.orders) return { status: "unmatched", reason: "no_detail" }
  return {
    status: "ok",
    candidate: {
      orderDetailId: detail.id.toString(),
      orderId: (detail.order_id ?? BigInt(0)).toString(),
      container: normalizeContainer(detail.orders.order_number),
      po: detail.po,
      destinationCode: detail.locations?.location_code ?? null,
      destinationName: detail.locations?.name ?? null,
      estimatedPallets: detail.estimated_pallets,
    },
  }
}

/** 柜号 + 目的地消歧（GGCT 自带仓点 / CODE128 第二行文本） */
async function resolveByContainer(
  db: ErpDb,
  container: string,
  destination: string | null,
  chosenOrderDetailId?: bigint
): Promise<ResolvedGoods> {
  // 归一化柜号找订单（含 warehouse_id 为 null 的默认行；仓库范围 = 会话绑定的库）
  // 注：tagged template 里 '\s' 会被 cooked 成 's'（丢反斜杠），用 POSIX 类 [[:space:]] 规避
  const orders = await db.client.$queryRaw<{ order_id: bigint }[]>`
    SELECT order_id FROM public.orders
    WHERE upper(regexp_replace(order_number, '[[:space:]]+', '', 'g')) = ${container.toUpperCase()}
      AND (warehouse_id = ${db.warehouseId} OR warehouse_id IS NULL)
  `
  if (orders.length === 0) return { status: "unmatched", reason: "no_order" }

  const orderIds = orders.map((o) => o.order_id)
  const details = await db.client.order_detail.findMany({
    where: { order_id: { in: orderIds } },
    select: {
      id: true, order_id: true, po: true, estimated_pallets: true,
      orders: { select: { order_number: true } },
      locations: { select: { location_code: true, name: true, state: true, postal_code: true } },
    },
    orderBy: { id: "asc" },
  })
  if (details.length === 0) return { status: "unmatched", reason: "no_detail" }

  const toCandidate = (d: (typeof details)[number]): GoodsCandidate => ({
    orderDetailId: d.id.toString(),
    orderId: (d.order_id ?? BigInt(0)).toString(),
    container: normalizeContainer(d.orders?.order_number ?? ""),
    po: d.po,
    destinationCode: d.locations?.location_code ?? null,
    destinationName: d.locations?.name ?? null,
    estimatedPallets: d.estimated_pallets,
  })

  // 明确指定了明细（歧义点选后的二次提交）
  if (chosenOrderDetailId !== undefined) {
    const chosen = details.find((d) => d.id === chosenOrderDetailId)
    return chosen
      ? { status: "ok", candidate: toCandidate(chosen) }
      : { status: "unmatched", reason: "no_detail" }
  }

  if (destination === null) {
    // 纯柜号：单明细直用，多明细歧义
    return details.length === 1
      ? { status: "ok", candidate: toCandidate(details[0]!) }
      : { status: "ambiguous", candidates: details.map(toCandidate) }
  }

  const dest = destination.toUpperCase().replace(/\s+/g, "")
  const byLocationCode = details.filter(
    (d) => d.locations && normalizeCode(d.locations.location_code) === dest
  )
  if (byLocationCode.length === 1) return { status: "ok", candidate: toCandidate(byLocationCode[0]!) }
  if (byLocationCode.length > 1) {
    return { status: "ambiguous", candidates: byLocationCode.map(toCandidate) }
  }

  // 州+邮编形态（私仓 CODE128 第二行）：upper(state || postal_code)
  if (/^[A-Z]{2}\d{4,5}$/.test(dest)) {
    const byStateZip = details.filter(
      (d) =>
        d.locations &&
        normalizeCode(d.locations.state) + normalizeCode(d.locations.postal_code) === dest
    )
    if (byStateZip.length === 1) return { status: "ok", candidate: toCandidate(byStateZip[0]!) }
    if (byStateZip.length > 1) {
      return { status: "ambiguous", candidates: byStateZip.map(toCandidate) }
    }
  }

  // 目的地匹配不上：单明细直用（自提/扣货场景第二行是 notes），多明细歧义
  return details.length === 1
    ? { status: "ok", candidate: toCandidate(details[0]!) }
    : { status: "ambiguous", candidates: details.map(toCandidate) }
}

/** 货物码（GGCT / GGOD / CODE128_GUESS）→ 候选明细（在 db 指定的库里解析） */
export async function resolveGoods(
  db: ErpDb,
  payload: Extract<ScanPayload, { type: "GGCT" | "GGOD" | "CODE128_GUESS" }>,
  chosenOrderDetailId?: bigint
): Promise<ResolvedGoods> {
  if (payload.type === "GGOD") {
    // 二次提交指定了 chosenOrderDetailId 时以它为准（GGOD 本身 ID 即权威，两者一致）
    const id = chosenOrderDetailId ?? BigInt(payload.orderDetailId)
    return resolveByDetailId(db, id)
  }
  const destination =
    payload.type === "GGCT"
      ? payload.destination
      : (payload.destinationGuess ?? null)
  return resolveByContainer(db, payload.container, destination, chosenOrderDetailId)
}

export type BinVerdict =
  | { status: "ok"; binCode: string; binLocationId: string; occupants: number }
  | { status: "invalid" }

/** 库位码 → bin_locations 校验（is_active + 仓库归属 = 会话绑定的库；null 视为该库默认）+ 在库占用数 */
export async function resolveBin(db: ErpDb, binCode: string): Promise<BinVerdict> {
  const bin = await db.client.bin_locations.findFirst({
    where: { bin_code: binCode, is_active: true },
    select: { bin_location_id: true, warehouse_id: true },
  })
  if (!bin) return { status: "invalid" }
  if (bin.warehouse_id !== null && bin.warehouse_id !== db.warehouseId) {
    return { status: "invalid" }
  }

  const occupants = await db.client.inventory_lots.count({
    where: {
      storage_location_code: binCode,
      inbound_receipt: { status: "received" },
      order_detail: {
        outbound_shipment_lines: { none: { outbound_shipments: { actual_load_time: { not: null } } } },
      },
    },
  })

  return {
    status: "ok",
    binCode,
    binLocationId: bin.bin_location_id.toString(),
    occupants,
  }
}

export type InStockLot = { inventoryLotId: string; storageLocationCode: string | null }

/** 交互式事务客户端类型 */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]

/**
 * 锁定并读取明细的在库批次（FOR UPDATE 串行化并发绑定）。
 * 在库口径与 resolveBin 相同；只锁 inventory_lots 行。
 */
export async function lockInStockLots(tx: Tx, orderDetailId: bigint): Promise<InStockLot[]> {
  const rows = await tx.$queryRaw<
    { inventory_lot_id: bigint; storage_location_code: string | null }[]
  >`
    SELECT l.inventory_lot_id, l.storage_location_code
    FROM wms.inventory_lots l
    JOIN wms.inbound_receipt r ON r.inbound_receipt_id = l.inbound_receipt_id AND r.status = 'received'
    WHERE l.order_detail_id = ${orderDetailId}
      AND NOT EXISTS (
        SELECT 1 FROM wms.outbound_shipment_lines osl
        JOIN wms.outbound_shipments os ON os.outbound_shipment_id = osl.outbound_shipment_id
        WHERE osl.order_detail_id = l.order_detail_id AND os.actual_load_time IS NOT NULL
      )
    ORDER BY l.inventory_lot_id
    FOR UPDATE OF l
  `
  return rows.map((r) => ({
    inventoryLotId: r.inventory_lot_id.toString(),
    storageLocationCode: r.storage_location_code,
  }))
}
