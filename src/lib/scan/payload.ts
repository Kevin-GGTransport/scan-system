/**
 * 扫码载荷解析（纯函数，无 DB 依赖）。
 *
 * 与 ERP 出码端严格同口径（lib/services/print/qr.ts + scripts/tmp-qr-payload-test.ts）：
 * - GGBIN:{bin_code}            库位码（已投产）
 * - GGCT:{柜号}:{仓点}          货物码（已投产；柜号出码前去空白，仓点 trim）
 * - GGOD:{order_detail_id}:{柜号} 明细码（ERP 设计中；ID 段权威，柜号附属、原样保留）
 * - CODE128 条码 = 柜号 + 第二行文本去空格 → 无分隔符，启发式拆分（DB 裁决在 resolve 层）
 */
import { iso6346CheckDigit } from "./iso6346"

export const BIN_QR_PREFIX = "GGBIN:"
export const CTN_QR_PREFIX = "GGCT:"
export const OD_QR_PREFIX = "GGOD:"

/** 柜号去空白归一化（与 ERP normalizeContainer / CODE128 sanitize 同口径） */
export function normalizeContainer(value: string): string {
  return value.replace(/\s+/g, "")
}

export type ScanPayload =
  | { type: "GGBIN"; binCode: string }
  | { type: "GGCT"; container: string; destination: string }
  | { type: "GGOD"; orderDetailId: string; container?: string }
  | {
      type: "CODE128_GUESS"
      container: string
      /** 柜号之后的部分（CODE128 第二行文本），可能为 null（纯柜号条码） */
      destinationGuess: string | null
      /** ISO 6346 校验位是否匹配（false 只作 UI 警告，不拒扫） */
      checkDigitValid: boolean
    }
  | { type: "BIN_GUESS"; binCode: string }
  | { type: "UNKNOWN"; raw: string }

/** CODE128 启发式：4 字母 + 7 数字（ISO 6346 柜号长度）锚定开头 */
const ISO6346_ANCHOR = /^([A-Z]{4}[0-9]{7})(.*)$/
/** 库位编码形态：单字母 + 0~999（ERP bin_locations 生成规则，如 A40） */
const BIN_CODE_SHAPE = /^[A-Z]\d{1,3}$/

/**
 * 解析一段扫出的码文本。
 * 前缀码按 ERP 口径切分；CODE128 与裸库位形态走启发式；其余 UNKNOWN。
 */
export function parseScanPayload(raw: string): ScanPayload {
  const code = raw.trim()

  if (code.startsWith(BIN_QR_PREFIX)) {
    const binCode = code.slice(BIN_QR_PREFIX.length)
    return binCode ? { type: "GGBIN", binCode } : { type: "UNKNOWN", raw }
  }

  if (code.startsWith(CTN_QR_PREFIX)) {
    const parts = code.slice(CTN_QR_PREFIX.length).split(":")
    const container = normalizeContainer(parts[0] ?? "")
    const destination = parts.slice(1).join(":").trim()
    if (!container || !destination) return { type: "UNKNOWN", raw }
    return { type: "GGCT", container, destination }
  }

  if (code.startsWith(OD_QR_PREFIX)) {
    const parts = code.slice(OD_QR_PREFIX.length).split(":")
    const id = parts[0] ?? ""
    if (!/^\d+$/.test(id)) return { type: "UNKNOWN", raw }
    const container = parts.slice(1).join(":")
    // 柜号原样保留（比较时双方再归一化，与 ERP 过期比对口径一致）
    return container
      ? { type: "GGOD", orderDetailId: id, container }
      : { type: "GGOD", orderDetailId: id }
  }

  // CODE128 / 裸码启发式：全大写、去所有空白后匹配
  const s = code.toUpperCase().replace(/\s+/g, "")
  const anchored = ISO6346_ANCHOR.exec(s)
  if (anchored) {
    const container = anchored[1] ?? ""
    const rest = anchored[2] ?? ""
    return {
      type: "CODE128_GUESS",
      container,
      destinationGuess: rest || null,
      checkDigitValid: iso6346CheckDigit(container) === Number(container[10]),
    }
  }

  if (BIN_CODE_SHAPE.test(s)) {
    return { type: "BIN_GUESS", binCode: s }
  }

  return { type: "UNKNOWN", raw }
}
