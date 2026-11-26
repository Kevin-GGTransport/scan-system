import { describe, expect, it } from "vitest"
import {
  dbKeyToWarehouseId,
  parseDbInstances,
  parseWarehouseMap,
} from "./instances"

// vitest 不加载 .env；instances 是惰性解析，首个调用前设好即可
process.env.DB_WAREHOUSE_MAP ??= "1000=OAK仓库,1=SAV仓库"

describe("parseDbInstances", () => {
  it("解析双库（URL 含 = 时切第一个等号）", () => {
    const list = parseDbInstances(
      "OAK仓库=postgresql://u:p%40x@localhost/neondb,SAV仓库=postgresql://u:p@localhost/neondb-sav",
      undefined
    )
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ key: "OAK仓库", url: "postgresql://u:p%40x@localhost/neondb" })
    expect(list[1]).toMatchObject({ key: "SAV仓库", url: "postgresql://u:p@localhost/neondb-sav" })
  })

  it("未配置时退化为 default 单实例", () => {
    expect(parseDbInstances(undefined, "postgresql://x/y")).toEqual([
      { key: "default", url: "postgresql://x/y", label: "默认" },
    ])
  })

  it("未配置且无 DATABASE_URL → 抛错", () => {
    expect(() => parseDbInstances(undefined, undefined)).toThrow("DATABASE_URL")
  })

  it("坏段（缺 =）→ 抛错", () => {
    expect(() => parseDbInstances("OAK仓库", undefined)).toThrow("格式错误")
  })

  it("首尾空白被 trim", () => {
    const list = parseDbInstances(" A = postgresql://x/y ", undefined)
    expect(list[0]).toMatchObject({ key: "A", url: "postgresql://x/y" })
  })
})

describe("parseWarehouseMap", () => {
  it("解析映射", () => {
    const map = parseWarehouseMap("1000=OAK仓库,1=SAV仓库")
    expect(map.get("1000")).toBe("OAK仓库")
    expect(map.get("1")).toBe("SAV仓库")
  })

  it("空配置 → 空表", () => {
    expect(parseWarehouseMap(undefined).size).toBe(0)
  })

  it("坏段跳过不炸", () => {
    const map = parseWarehouseMap("1000=OAK仓库,broken")
    expect(map.size).toBe(1)
  })
})

describe("dbKeyToWarehouseId", () => {
  it("按映射反查 warehouse_id", () => {
    expect(dbKeyToWarehouseId("OAK仓库")).toBe(BigInt(1000))
    expect(dbKeyToWarehouseId("SAV仓库")).toBe(BigInt(1))
  })

  it("无映射的 key → null（调用方必须当配置错误）", () => {
    expect(dbKeyToWarehouseId("不存在的库")).toBeNull()
  })
})
