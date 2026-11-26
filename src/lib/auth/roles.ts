/**
 * 角色常量 — 与 G-G_CoreFlow_ERP 的 users.role 取值同源（lib/auth/roles.ts 的子集）。
 * SCAN_ROLES 是扫码作业系统的登录白名单：不在名单内的角色拒绝登录。
 */

export const ROLE = {
  ADMIN: 'admin',
  WMS_MANAGER: 'wms_manager',
  WMS_OPERATOR: 'wms_operator',
  WMS_OUTBOUND_WORKER: 'wms_outbound_worker',
  WMS_INBOUND_WORKER: 'wms_inbound_worker',
} as const

export const SCAN_ROLES: readonly string[] = Object.values(ROLE)
