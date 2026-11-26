/**
 * API 出参序列化：BigInt 一律转 string（集中在此，禁止散落处理）。
 */

/** JSON.stringify 的 replacer：bigint → string */
export function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, bigIntReplacer), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}
