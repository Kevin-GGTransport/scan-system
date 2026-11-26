/**
 * 造数脚本：往所有数据库实例（DB_INSTANCES）造扫码系统测试数据
 * （幂等，可重复跑；只动本脚本自己造的行）。
 * 用法：pnpm db:seed（等价 node --env-file=.env --import tsx scripts/seed-test-data.ts）
 *
 * 每个库的数据集：
 * - 测试用户 scan_test / Scan1234!（role=wms_inbound_worker，登录即用）
 * - 库位 A1/A2/A3（warehouse 取自 DB_WAREHOUSE_MAP）
 * - 订单柜号 "SCAN 0000001"（带空格，测归一化匹配）
 * - 明细1 → ONT8 仓点（GGCT 自带仓点路径）；明细2 → 私仓 CA91761（CODE128 州邮编路径）
 * - 入库单 status=received + 3 个批次（1 个已绑 A1、2 个未绑）→ 在库口径可见
 */
import { PrismaClient } from "../src/lib/generated/prisma-erp"
import {
  dbKeyToWarehouseId,
  getDbInstances,
} from "../src/lib/db/instances"
import bcrypt from "bcryptjs"

const TEST_ORDER_NUMBER = "SCAN 0000001"
const TEST_USERNAME = "scan_test"
const TEST_PASSWORD = "Scan1234!"

async function seedOne(prisma: PrismaClient, warehouseId: bigint): Promise<void> {
  // ── 测试用户（upsert） ────────────────────────────────
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
  await prisma.users.upsert({
    where: { username: TEST_USERNAME },
    update: { password_hash: passwordHash, status: "active", role: "wms_inbound_worker" },
    create: {
      username: TEST_USERNAME,
      password_hash: passwordHash,
      full_name: "扫码测试员",
      role: "wms_inbound_worker",
      status: "active",
      default_warehouse_id: warehouseId,
    },
  })

  // ── 库位 A1-A3（upsert） ──────────────────────────────
  for (const code of ["A1", "A2", "A3"]) {
    await prisma.bin_locations.upsert({
      where: { bin_code: code },
      update: { is_active: true, warehouse_id: warehouseId },
      create: { bin_code: code, warehouse_id: warehouseId, is_active: true },
    })
  }

  // ── 清掉旧测试订单（SAV/LA 的外键无 ON DELETE CASCADE，须按序手删子行） ──
  const oldOrders = await prisma.orders.findMany({
    where: { order_number: TEST_ORDER_NUMBER },
    select: { order_id: true },
  })
  const oldOrderIds = oldOrders.map((o) => o.order_id)
  if (oldOrderIds.length > 0) {
    await prisma.inventory_lots.deleteMany({ where: { order_id: { in: oldOrderIds } } })
    await prisma.inbound_receipt.deleteMany({ where: { order_id: { in: oldOrderIds } } })
    await prisma.order_detail.deleteMany({ where: { order_id: { in: oldOrderIds } } })
    await prisma.orders.deleteMany({ where: { order_id: { in: oldOrderIds } } })
  }

  // ── 仓点：ONT8 用既有行（找不到则造） ─────────────────
  let ont8 = await prisma.locations.findFirst({
    where: { location_code: "ONT8", warehouse_id: warehouseId },
  })
  if (!ont8) {
    ont8 = await prisma.locations.create({
      data: {
        location_code: "ONT8",
        warehouse_id: warehouseId,
        location_type: "warehouse",
        name: "ONT8（测试）",
      },
    })
  }

  // ── 私仓：state+zip 供 CODE128 启发式匹配（CA91761） ──
  let pw = await prisma.locations.findFirst({
    where: { state: "CA", postal_code: "91761", warehouse_id: warehouseId },
  })
  if (!pw) {
    pw = await prisma.locations.create({
      data: {
        location_code: "PW-TEST",
        warehouse_id: warehouseId,
        location_type: "private_warehouse",
        name: "私仓测试（CA 91761）",
        state: "CA",
        postal_code: "91761",
      },
    })
  }

  // ── 订单 + 2 明细 ─────────────────────────────────────
  const order = await prisma.orders.create({
    data: {
      order_number: TEST_ORDER_NUMBER,
      warehouse_id: warehouseId,
      order_date: new Date(),
      total_amount: 0,
      final_amount: 0,
      order_detail: {
        create: [
          { quantity: 10, estimated_pallets: 3, po: "PO-TEST-ONT8", delivery_location_id: ont8.location_id },
          { quantity: 6, estimated_pallets: 2, po: "PO-TEST-PW", delivery_location_id: pw.location_id },
        ],
      },
    },
    include: { order_detail: true },
  })

  // ── 入库单（received）+ 3 批次 ────────────────────────
  const receipt = await prisma.inbound_receipt.create({
    data: {
      order_id: order.order_id,
      warehouse_id: warehouseId,
      status: "received",
    },
  })
  const [d1, d2] = order.order_detail
  await prisma.inventory_lots.createMany({
    data: [
      { warehouse_id: warehouseId, order_id: order.order_id, order_detail_id: d1.id, inbound_receipt_id: receipt.inbound_receipt_id, storage_location_code: "A1", pallet_count: 2 },
      { warehouse_id: warehouseId, order_id: order.order_id, order_detail_id: d1.id, inbound_receipt_id: receipt.inbound_receipt_id, storage_location_code: null, pallet_count: 1 },
      { warehouse_id: warehouseId, order_id: order.order_id, order_detail_id: d2.id, inbound_receipt_id: receipt.inbound_receipt_id, storage_location_code: null, pallet_count: 2 },
    ],
  })
}

async function main() {
  const clients: PrismaClient[] = []
  try {
    for (const inst of getDbInstances()) {
      const warehouseId = dbKeyToWarehouseId(inst.key)
      if (warehouseId === null) {
        throw new Error(`实例 ${inst.key} 没有对应的 warehouse_id（查 DB_WAREHOUSE_MAP）`)
      }
      const prisma = new PrismaClient({
        datasources: { db: { url: inst.url } },
      })
      clients.push(prisma)
      await seedOne(prisma, warehouseId)
      console.log(`✓ [${inst.key}] scan_test + 库位 A1-A3 + 订单 ${TEST_ORDER_NUMBER} + 批次 x3`)
    }

    console.log(`\n✓ 用户 ${TEST_USERNAME} / ${TEST_PASSWORD}（每个库各一份）`)
    console.log("\n扫这些码测试（注意登录时选对仓库）：")
    console.log("  GGBIN:A1")
    console.log("  GGCT:SCAN0000001:ONT8        （柜号已归一化去空格）")
    console.log("  GGCT:SCAN 0000001:ONT8       （带空格原样）")
    console.log("  GGCT:SCAN0000001:PW-TEST     （私仓按 location_code）")
    console.log("  CODE128 条码内容 SCAN0000001CA91761（私仓州邮编路径）")
  } finally {
    await Promise.all(clients.map((c) => c.$disconnect()))
  }
}

main().catch((e) => {
  console.error("造数失败:", e)
  process.exit(1)
})
