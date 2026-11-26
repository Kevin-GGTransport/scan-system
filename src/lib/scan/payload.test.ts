import { describe, expect, it } from "vitest"
import { parseScanPayload } from "./payload"
import { iso6346CheckDigit, isValidIso6346 } from "./iso6346"

describe("parseScanPayload", () => {
  describe("GGOD（ERP tmp-qr-payload-test.ts 全部边界用例）", () => {
    it("正常载荷", () => {
      expect(parseScanPayload("GGOD:12345:TCLU1234567")).toEqual({
        type: "GGOD",
        orderDetailId: "12345",
        container: "TCLU1234567",
      })
    })
    it("无柜号段", () => {
      expect(parseScanPayload("GGOD:12345")).toEqual({
        type: "GGOD",
        orderDetailId: "12345",
      })
    })
    it("柜号段含冒号 → join 回来不丢", () => {
      expect(parseScanPayload("GGOD:12345:ABC:1")).toEqual({
        type: "GGOD",
        orderDetailId: "12345",
        container: "ABC:1",
      })
    })
    it("首尾空白（扫码枪常见）", () => {
      expect(parseScanPayload(" GGOD:12345:TCLU1234567\n")).toEqual({
        type: "GGOD",
        orderDetailId: "12345",
        container: "TCLU1234567",
      })
    })
    it("ID 段非数字 → UNKNOWN", () => {
      expect(parseScanPayload("GGOD:abc:TCLU").type).toBe("UNKNOWN")
    })
    it("空 ID → UNKNOWN", () => {
      expect(parseScanPayload("GGOD:").type).toBe("UNKNOWN")
    })
  })

  describe("GGBIN", () => {
    it("库位码", () => {
      expect(parseScanPayload("GGBIN:A0-12")).toEqual({ type: "GGBIN", binCode: "A0-12" })
    })
    it("首尾空白", () => {
      expect(parseScanPayload(" GGBIN:A1\n")).toEqual({ type: "GGBIN", binCode: "A1" })
    })
    it("空库位 → UNKNOWN", () => {
      expect(parseScanPayload("GGBIN:").type).toBe("UNKNOWN")
    })
  })

  describe("GGCT", () => {
    it("柜号+仓点", () => {
      expect(parseScanPayload("GGCT:TCLU1234567:ONT8")).toEqual({
        type: "GGCT",
        container: "TCLU1234567",
        destination: "ONT8",
      })
    })
    it("柜号带空格 → 归一化", () => {
      expect(parseScanPayload("GGCT:TCLU 123456:ONT8")).toEqual({
        type: "GGCT",
        container: "TCLU123456",
        destination: "ONT8",
      })
    })
    it("私仓按 location_code", () => {
      expect(parseScanPayload("GGCT:SCAN0000001:PW-TEST")).toEqual({
        type: "GGCT",
        container: "SCAN0000001",
        destination: "PW-TEST",
      })
    })
    it("缺仓点 → UNKNOWN", () => {
      expect(parseScanPayload("GGCT:TCLU1234567").type).toBe("UNKNOWN")
    })
    it("空柜号 → UNKNOWN", () => {
      expect(parseScanPayload("GGCT::ONT8").type).toBe("UNKNOWN")
    })
  })

  describe("CODE128 启发式", () => {
    it("柜号+仓点（TCLU1234567 校验位应为 8，尾号 7 → 不匹配）", () => {
      const p = parseScanPayload("TCLU1234567ONT8")
      expect(p).toEqual({
        type: "CODE128_GUESS",
        container: "TCLU1234567",
        destinationGuess: "ONT8",
        checkDigitValid: false,
      })
    })
    it("校验位正确的柜号（TCLU1234568）", () => {
      const p = parseScanPayload("TCLU1234568ONT8")
      expect(p.type).toBe("CODE128_GUESS")
      if (p.type === "CODE128_GUESS") expect(p.checkDigitValid).toBe(true)
    })
    it("私仓州+邮编形态", () => {
      expect(parseScanPayload("SCAN0000001CA91761")).toEqual({
        type: "CODE128_GUESS",
        container: "SCAN0000001",
        destinationGuess: "CA91761",
        checkDigitValid: false,
      })
    })
    it("含空格先去空白（CODE128 出码口径）", () => {
      const p = parseScanPayload("scan 0000001 ca91761")
      expect(p.type).toBe("CODE128_GUESS")
      if (p.type === "CODE128_GUESS") expect(p.destinationGuess).toBe("CA91761")
    })
    it("纯柜号条码 → destinationGuess null", () => {
      const p = parseScanPayload("CSQU3054383")
      expect(p.type).toBe("CODE128_GUESS")
      if (p.type === "CODE128_GUESS") {
        expect(p.destinationGuess).toBeNull()
        expect(p.checkDigitValid).toBe(true)
      }
    })
    it("库位形态 → BIN_GUESS", () => {
      expect(parseScanPayload("A40")).toEqual({ type: "BIN_GUESS", binCode: "A40" })
      expect(parseScanPayload("a1")).toEqual({ type: "BIN_GUESS", binCode: "A1" })
    })
    it("随机串 → UNKNOWN", () => {
      expect(parseScanPayload("hello").type).toBe("UNKNOWN")
      expect(parseScanPayload("12345").type).toBe("UNKNOWN")
      expect(parseScanPayload("").type).toBe("UNKNOWN")
    })
  })
})

describe("ISO 6346 校验位", () => {
  it("TCLU1234567 → 8", () => {
    expect(iso6346CheckDigit("TCLU1234567")).toBe(8)
  })
  it("CSQU3054383 是公开样例的有效柜号", () => {
    expect(iso6346CheckDigit("CSQU3054383")).toBe(3)
    expect(isValidIso6346("CSQU3054383")).toBe(true)
  })
  it("SCAN0000001 → 0（序列 000000 全零，和 296 ≡ 10 → 映射 0；测试柜号尾号 1 不符）", () => {
    expect(iso6346CheckDigit("SCAN0000001")).toBe(0)
    expect(isValidIso6346("SCAN0000001")).toBe(false)
    expect(isValidIso6346("SCAN0000000")).toBe(true)
  })
  it("格式不符 → null", () => {
    expect(iso6346CheckDigit("TCLU123456")).toBeNull()
    expect(iso6346CheckDigit("12345678901")).toBeNull()
  })
})
