/**
 * ISO 6346 集装箱校验位（柜号第 11 位）。
 * ERP 的 order_number 是手输的，校验位不符只作 UI 警告、不拒扫——所以这里只提供计算，不做门禁。
 */

// 字母取值 10..38，跳过 11 的倍数（11/22/33）
const LETTER_VALUES: Readonly<Record<string, number>> = Object.freeze({
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
})

/** 计算校验位；柜号非 4 字母 + 7 数字（含校验位）时返回 null */
export function iso6346CheckDigit(container: string): number | null {
  if (!/^[A-Z]{4}[0-9]{7}$/.test(container)) return null

  let sum = 0
  for (let i = 0; i < 10; i++) {
    const ch = container[i]
    if (ch === undefined) return null
    const value = i < 4 ? LETTER_VALUES[ch] : Number(ch)
    if (value === undefined) return null
    sum += value * 2 ** i
  }
  const remainder = sum % 11
  return remainder === 10 ? 0 : remainder
}

/** 校验位是否匹配（格式不符按不匹配处理） */
export function isValidIso6346(container: string): boolean {
  const expected = iso6346CheckDigit(container)
  const actual = container[10]
  return expected !== null && actual !== undefined && Number(actual) === expected
}
