/**
 * 生成测试二维码 PNG 到 public/test-qr/（手机真机测试的扫源：桌面浏览器打开图片，手机扫屏幕）。
 * 用法：node --env-file=.env --import tsx scripts/gen-test-qr.ts
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import QRCode from "qrcode"

const OUT_DIR = join(process.cwd(), "public", "test-qr")

// 与 seed-test-data.ts 的数据集对应
const PAYLOADS: { file: string; payload: string; label: string }[] = [
  { file: "bin-A1", payload: "GGBIN:A1", label: "库位 A1" },
  { file: "bin-A2", payload: "GGBIN:A2", label: "库位 A2" },
  { file: "bin-A3", payload: "GGBIN:A3", label: "库位 A3" },
  { file: "ctn-ont8", payload: "GGCT:SCAN0000001:ONT8", label: "货物（柜+ONT8 仓点）" },
  { file: "ctn-ont8-space", payload: "GGCT:SCAN 0000001:ONT8", label: "货物（柜号带空格）" },
  { file: "ctn-pw", payload: "GGCT:SCAN0000001:PW-TEST", label: "货物（私仓）" },
  { file: "code128-pw", payload: "SCAN0000001CA91761", label: "CODE128 形态（私仓州邮编）" },
  { file: "pure-container", payload: "SCAN0000001", label: "纯柜号（触发歧义点选）" },
  { file: "unknown", payload: "GGCT:XXXX0000000:ONT8", label: "不存在的柜号（红）" },
]

// index.html：一页列出全部码，桌面打开即扫
const items: string[] = []

mkdirSync(OUT_DIR, { recursive: true })
for (const item of PAYLOADS) {
  const png = await QRCode.toFile(join(OUT_DIR, `${item.file}.png`), item.payload, {
    errorCorrectionLevel: "M",
    width: 480,
    margin: 2,
  })
  void png
  items.push(
    `<figure><img src="/test-qr/${item.file}.png" alt="${item.payload}" loading="lazy"/><figcaption><b>${item.label}</b><code>${item.payload}</code></figcaption></figure>`
  )
  console.log(`✓ ${item.file}.png ← ${item.payload}`)
}

writeFileSync(
  join(OUT_DIR, "index.html"),
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>测试二维码</title><style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#f4f5f7;margin:0;padding:24px;color:#111}
  h1{font-size:20px}
  main{display:flex;flex-wrap:wrap;gap:20px}
  figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px 16px;text-align:center}
  img{width:220px;height:220px;display:block}
  code{display:block;margin-top:6px;font-size:12px;color:#555;word-break:break-all}
  b{font-size:14px}
  </style></head><body><h1>测试二维码（手机扫这些图）</h1><main>${items.join("\n")}</main></body></html>\n`
)
console.log("✓ index.html")
