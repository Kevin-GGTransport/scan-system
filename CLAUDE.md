# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**scan-system** — 仓库连续扫码作业系统（手机浏览器 web 端，非 App）：与 G-G_CoreFlow_ERP 共用本地 PostgreSQL（OAK/neondb），V1 已交付**库位绑定**作业；盘点、提货核对未上线（作业选择页置灰）。

界面中文；工业暗色 HMI（仓库夜班/暗环境）；码号一律等宽字体（IBM Plex Mono）。

## Commands

```bash
pnpm dev          # 开发（localhost:3001；ERP 占 3000，勿改）
pnpm dev:lan      # 手机真机测试（HTTPS 3443，mkcert 证书 certs/，需 next.config allowedDevOrigins 放行局域网 IP）
pnpm build        # prisma generate（erp 视图）+ next build
pnpm lint         # eslint（generated 目录已 ignore）
pnpm test         # vitest run（payload/多库解析纯函数，35 用例）
pnpm db:seed      # 造测试数据到本地 OAK 库（幂等可重跑）
node --import tsx scripts/gen-test-qr.ts   # 重生成 public/test-qr/ 测试二维码
```

测试账号：`scan_test` / `Scan1234!`（role=wms_inbound_worker，登录即用此账号；`pnpm db:seed` 会确保它存在）。

**手机真机测试**：`pnpm dev:lan` → 手机连同一 Wi-Fi 访问 `https://<Mac局域网IP>:3443`；首次先装 CA（`/rootCA.pem` 已公开路由；iOS 装描述文件后还需在"关于本机→证书信任设置"开启）；扫源用桌面打开 `/test-qr/`。局域网 IP 变了要同步改 `next.config.ts` 的 `allowedDevOrigins` 和重签证书（mkcert 二进制在 /tmp/mkcert-bin/，brew 无 macOS 27 bottle）。

## Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Architecture

### 数据接入：ERP 表视图（零 DDL，零新表）

- `prisma/erp/schema.prisma` 是 ERP 既有表的手工维护子集视图（users/orders/order_detail/locations/inventory_lots/inbound_receipt/bin_locations/outbound_shipments(+lines)）。**只 `prisma generate`，永不 migrate**——表归 ERP 所有，本系统只读写
- client 输出在 `src/lib/generated/prisma-erp/`（eslint 已 ignore）；单例 `src/lib/prisma-erp.ts`
- **ERP 改表后的校准流程**：复制 schema 为 `prisma/erp/_pull.prisma`（gitignored）→ `prisma db pull --schema prisma/erp/_pull.prisma` → 与正式 schema diff → 手工同步字段
- 双库 OAK/SAV（`DB_INSTANCES` + `DB_WAREHOUSE_MAP`，登录选仓终身绑库，见鉴权节；2026-11-26 上线）；绑定语义天然幂等，无会话表

### 扫码载荷（与 ERP 出码端严格同口径）

`src/lib/scan/payload.ts`（纯函数 + vitest 表驱动）：`GGBIN:{bin_code}` 库位码、`GGCT:{柜号}:{仓点}` 货物码、`GGOD:{明细ID}:{柜号}` 明细码（ERP 未投产，解析端已就绪）、CODE128 = `柜号+第二行文本` 去空格（ISO 6346 锚定 + 州邮编/location_code 启发式，最终由 `resolve.ts` 查库裁决）。

**坑**：Prisma tagged template 里 `'\s'` 的 cooked 值会丢反斜杠——正则一律用 `[[:space:]]` 写法（resolve.ts 有注释）。

### 鉴权与多库：登录选仓，会话终身绑库（2026-11-26 双库上线）

- `src/proxy.ts`（Next 16 中间件，**必须在 src/ 内**，Node 运行时）：页面未登录 307 → `/login?callbackUrl=…` 回跳；API 401 JSON（use-scan-job 有兜底跳转）；公开的只有 `/login`、`/api/auth`、`rootCA` 证书三件（手机装信任必须先于登录拿到）
- NextAuth v5 纯 Credentials（username/password + **dbKey**）+ SCAN_ROLES 白名单 + credentialStamp 改密吊销；操作员 = 会话用户，`updated_by` 审计即登录人
- `(scan)/layout` 读会话显示操作员名 + 仓库徽标（`instant=false` + `await connection()`，cacheComponents 硬规则）；登录页在 `(auth)` 组 = server 壳解析 DB_INSTANCES + client 表单（login-form.tsx，带仓库选择器）
- **多库三层保证（“改的必须是对应库”的落地，克隆自 ERP）**：
  1. **会话绑库**：登录选仓 → `token.dbKey` 进 JWT 终身绑定；凭证戳绑 `(dbKey, userId, password_hash)`，JWT 刷新回**同一个库**重验（改密/换库即吊销）；proxy 校验 dbKey 是已知实例
  2. **连接绑死**：`getErpDb(dbKey)` → `{client, warehouseId, label}`，client 构造时绑连接串、globalThis 按 key 缓存；**无默认单例导出**（旧 `prismaErp` 已删，不显式给 dbKey 编译不过）；resolve.ts 全函数收 `ErpDb`，`WAREHOUSE_ID` 硬编码已删，仓库过滤一律 `db.warehouseId`
  3. **db_identity 自检**：每库一张 `db_identity` 表存身份戳（ERP/DBeaver 建），`getErpDb` 首次取用校验「连到的库 == 声称的 dbKey」，不符抛错拒绝服务（防 DB_INSTANCES key/url 配反写错库；表未建告警放行）
- 环境变量（与 ERP 同口径同值）：`DB_INSTANCES="OAK仓库=url,SAV仓库=url"`、`DB_WAREHOUSE_MAP="1000=OAK仓库,1=SAV仓库"`；不配退化单库 default+1000（旧行为）。Vercel 需配：`DATABASE_URL`、`DB_INSTANCES`、`DB_WAREHOUSE_MAP`、`NEXTAUTH_SECRET`（trustHost 已开，免 AUTH_URL；secure cookie 随 NODE_ENV 自动切）
- 坑位记录：cookie 名 `scan-system.session-token`（localhost 与 ERP 同 host 共享 cookie，必须隔离）；TS 模块增强挂 `@auth/core/types` 与 `@auth/core/jwt`（beta.32 的 next-auth/* 只是再导出，需直接依赖同版本 `@auth/core`）
- 远端仓库 `github.com/Kevin-GGTransport/scan-system`（main，SSH 推送；.env/certs/生成物不入库，Vercel 构建时 prisma generate 重新生成）

### 库位绑定语义（无流水表设计）与两段式流程

**两段式作业流**（`/bind` = ①扫库位确定动作起点 → 确认卡片 →「开始扫货」跳 `/bind/[binCode]` = ②连续扫货物码；URL 锁定库位刷新不丢；阶段②再扫库位码 = 无缝换位；「结束」弹本次作业汇总）。Scanner 组件经 `scanner-lazy.tsx` **纯客户端渲染**（SSR 的驼峰 `playsInline` 会触发 Safari 水合炸树——iOS 27 实测）。

事务内 `FOR UPDATE` 锁批次行 + 按 before 值分组条件更新（`storage_location_code IS NOT DISTINCT FROM before` + `updated_by/updated_at`）→ **天然幂等**（弱网重放=重复扫=duplicate）；审计走 `inventory_lots.updated_by/updated_at` 现成字段。outcome：matched/moved/duplicate/conflict/ambiguous（候选点选）/unmatched（no_order/not_in_stock/…）。

iOS 相机三坑（都已处理，改 Scanner 时别退回去）：`h-dvh` 定死视口高度（min-h-dvh 会让取景区塌成 0）；切后台/截屏挂断流 →「点按启动相机」按钮做 play()+整建兜底；省电模式拦 muted 自动播放 → 同一按钮。

### 前端

- 深色工业 HMI 设计系统在 `src/app/globals.css`（三色信号 signal-ok/warn/stop + 安全黄 hivis；签名元素=判定瞬间整屏边框闪色 `.outcome-flash`，respects reduced-motion）
- Scanner（`src/components/scanner/`）：@zxing/browser（QR+CODE128）、iOS 三件套 playsInline/muted/autoPlay、同码 2500ms 去重、卸载停流、手电筒、**蓝牙扫码枪模式**（keydown 缓冲+Enter，与相机同一出口——e2e 就走这条路径）
- `use-scan-job.ts`：POST → 蜂鸣/振动反馈 → 计数；页面永不因扫码整页刷新

### Next 16 踩坑记录

- cacheComponents 下路由段**不能** `export const runtime`；读会话的 layout 需 `export const instant = false` + `await connection()`
- dev 长跑后表现异常（旧 layout/样式）→ `rm -rf .next` 重启
- tsconfig target ES2017：BigInt 字面量（`1000n`）不可用，用 `BigInt(1000)`

## 技术栈

### 运行时 & 框架
- **Next.js 16**（App Router，Turbopack，cacheComponents）
- **Node.js** ≥ 18
- **TypeScript** `strict: true`，target ES2017，JSX `react-jsx`
- **模块系统**：ESM（`"type": "module"`）

### 前端
- **React 19** + React DOM
- **shadcn/ui**（radix-nova 风格，neutral 基础色，全局深色定制）
- **Tailwind CSS v4**（`@tailwindcss/postcss` + `tw-animate-css`）
- **Radix UI**、**TanStack React Table v8**、**lucide-react**
- **React Hook Form v7** + **Zod v4**（表单与校验）
- **@zxing/browser**（QR + CODE128 扫码）
- **Geist + Noto Sans SC + IBM Plex Mono**（字体；echarts/TipTap/cmdk 在栈规格内、按需未装）

### 后端 & API
- **NextAuth.js v5 beta.32**（Credentials Provider，JWT 策略，共用 ERP users 表）
- **bcryptjs**（密码哈希）；API 层为 Route Handlers（高频扫码 + 幂等重试语义）

### 数据库
- **PostgreSQL**（本地，与 G-G_CoreFlow_ERP 共库）
- **Prisma v6**（erp 表视图 client，只 generate 永 migrate）
