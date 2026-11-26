"use client";

/**
 * 库位绑定 · 第二阶段：连续扫货物码上架。
 * 库位已由 URL 锁定（/bind/[binCode]），刷新不丢；进入时回库重验拿最新占用数。
 * 再扫库位码 = 无缝换位（整页跳到新库位继续）；「结束」弹本次作业汇总。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  CopyCheck,
  HelpCircle,
  MapPinOff,
  XCircle,
} from "lucide-react";
import { ScannerLazy as Scanner } from "@/components/scanner/scanner-lazy";
import {
  outcomeKind,
  useScanJob,
  type BindCandidate,
  type Verdict,
} from "@/components/scanner/use-scan-job";
import { ScanResultSheet } from "@/components/scan-result-sheet";
import { BindSteps } from "@/components/bind-steps";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OUTCOME_ICONS: Record<string, typeof CheckCircle2> = {
  bin_set: CheckCircle2,
  matched: CheckCircle2,
  moved: ArrowRightLeft,
  duplicate: CopyCheck,
  ambiguous: HelpCircle,
  unmatched: XCircle,
  invalid_bin: MapPinOff,
  need_bin: AlertTriangle,
  conflict: AlertTriangle,
  error: AlertTriangle,
}

const OUTCOME_COLORS: Record<"ok" | "warn" | "error", string> = {
  ok: "text-signal-ok",
  warn: "text-signal-warn",
  error: "text-signal-stop",
}

export default function BindScanPage({ params }: { params: Promise<{ binCode: string }> }) {
  const router = useRouter();
  const [binCode, setBinCode] = useState<string | null>(null);
  const [occupants, setOccupants] = useState<number | null>(null);
  const [pending, setPending] = useState<{ payload: string; candidates: BindCandidate[] } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "warn" | "error"; id: number } | null>(null);
  const { last, recent, counts, submit } = useScanJob(binCode);

  // 路由参数（Next 16 为 Promise）解析
  useEffect(() => {
    void params.then((p) => setBinCode(decodeURIComponent(p.binCode)))
  }, [params])

  const applyVerdict = useCallback((verdict: Verdict, scannedText: string) => {
    setFlash({ kind: outcomeKind(verdict.outcome), id: Date.now() })
    if (verdict.outcome === "ambiguous" && verdict.data?.candidates && verdict.data.candidates.length > 0) {
      setPending({ payload: scannedText, candidates: verdict.data.candidates })
    }
  }, [])

  const handleScan = useCallback(
    async (text: string) => {
      const verdict = await submit(text)
      if (!verdict) return
      // 再扫库位码 = 换位（整页跳转，相机无缝重启）
      if (verdict.outcome === "bin_set" && verdict.data?.binCode && verdict.data.binCode !== binCode) {
        router.replace(`/bind/${encodeURIComponent(verdict.data.binCode)}`)
        return
      }
      if (verdict.outcome === "bin_set" && verdict.data?.binCode) {
        setOccupants(verdict.data.occupants ?? null)
      }
      if (verdict.outcome === "invalid_bin") {
        setOccupants(null)
      }
      applyVerdict(verdict, text)
    },
    [submit, binCode, router, applyVerdict]
  )

  // 进入/换位时回库重验（拿最新占用数；库位被停用则提示）
  useEffect(() => {
    if (!binCode) return
    const timer = setTimeout(() => void handleScan(`GGBIN:${binCode}`), 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binCode])

  const chooseCandidate = useCallback(
    async (candidate: BindCandidate) => {
      const context = pending
      setPending(null)
      if (!context) return
      const verdict = await submit(context.payload, candidate.orderDetailId)
      if (verdict) applyVerdict(verdict, context.payload)
    },
    [pending, submit, applyVerdict]
  )

  const LastIcon = last ? (OUTCOME_ICONS[last.outcome] ?? AlertTriangle) : null
  const lastKind = last ? outcomeKind(last.outcome) : null
  const total = counts.ok + counts.warn + counts.error

  return (
    <div className="relative flex h-full flex-col gap-3 p-3">
      {flash ? (
        <div
          key={flash.id}
          className="outcome-flash"
          style={{ "--flash-color": `var(--signal-${flash.kind === "ok" ? "ok" : flash.kind === "warn" ? "warn" : "stop"})` } as CSSProperties}
        />
      ) : null}

      <BindSteps step={2} />

      {/* 锁定的库位牌 + 换位/结束 */}
      <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
          <div className="w-2 shrink-0 bg-hivis" aria-hidden />
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-3.5 py-2">
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">锁定库位</p>
              <p className="font-code truncate text-2xl font-bold leading-tight">{binCode ?? "…"}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {occupants !== null ? `在库 ${occupants} 批` : ""}
            </span>
          </div>
        </div>
        <Button
          variant="secondary"
          className="h-auto min-h-14 px-4 text-sm"
          onClick={() => router.push("/bind")}
        >
          换位
        </Button>
        <Button
          variant="secondary"
          className="h-auto min-h-14 px-4 text-sm"
          onClick={() => setSummaryOpen(true)}
        >
          结束
        </Button>
      </div>

      <Scanner
        onResult={(text) => void handleScan(text)}
        hint="扫货物码上架 · 换位先扫新库位码"
        className="min-h-0 flex-1"
      />

      {/* 判定区 */}
      <div className="rounded-lg border border-border bg-card px-4 py-3" aria-live="assertive">
        {last && LastIcon && lastKind ? (
          <div className="flex items-start gap-3">
            <LastIcon className={cn("mt-0.5 h-7 w-7 shrink-0", OUTCOME_COLORS[lastKind])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={cn("text-base font-semibold leading-snug", OUTCOME_COLORS[lastKind])}>
                {last.message}
              </p>
              {last.data?.container ? (
                <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-sm text-muted-foreground">
                  <span className="font-code text-base text-foreground">{last.data.container}</span>
                  {last.data.destinationCode ?? last.data.destinationName ? (
                    <span>{last.data.destinationCode ?? last.data.destinationName}</span>
                  ) : null}
                  {last.data.po ? <span>PO {last.data.po}</span> : null}
                  {typeof last.data.estimatedPallets === "number" ? (
                    <span>{last.data.estimatedPallets} 板</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">扫码结果会显示在这里</p>
        )}
      </div>

      {/* 本次汇总 + 最近记录 */}
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-md bg-signal-ok/15 px-2.5 py-1 font-medium text-signal-ok">
          通过 {counts.ok}
        </span>
        <span className="rounded-md bg-signal-warn/15 px-2.5 py-1 font-medium text-signal-warn">
          注意 {counts.warn}
        </span>
        <span className="rounded-md bg-signal-stop/15 px-2.5 py-1 font-medium text-signal-stop">
          异常 {counts.error}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">本次已扫 {total}</span>
      </div>

      {recent.length > 0 ? (
        <ul className="max-h-24 space-y-1 overflow-y-auto text-sm">
          {recent.map((item, index) => (
            <li key={`${item.outcome}-${index}`} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5">
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", {
                  "bg-signal-ok": outcomeKind(item.outcome) === "ok",
                  "bg-signal-warn": outcomeKind(item.outcome) === "warn",
                  "bg-signal-stop": outcomeKind(item.outcome) === "error",
                })}
                aria-hidden
              />
              <span className="font-code text-xs">{item.data?.container ?? item.data?.binCode ?? item.data?.raw ?? "—"}</span>
              <span className="truncate text-muted-foreground">{item.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <ScanResultSheet
        open={pending !== null}
        container={pending?.candidates[0]?.container ?? ""}
        candidates={pending?.candidates ?? []}
        onSelect={(candidate) => void chooseCandidate(candidate)}
        onDismiss={() => setPending(null)}
      />

      {/* 结束作业汇总 */}
      <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6">
          <SheetHeader className="text-left">
            <SheetTitle>本次作业汇总</SheetTitle>
            <SheetDescription>
              库位 <span className="font-code">{binCode}</span> · 共扫 {total} 次
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-signal-ok/15 px-2 py-3">
              <p className="text-2xl font-bold text-signal-ok">{counts.ok}</p>
              <p className="text-xs text-muted-foreground">通过</p>
            </div>
            <div className="rounded-lg bg-signal-warn/15 px-2 py-3">
              <p className="text-2xl font-bold text-signal-warn">{counts.warn}</p>
              <p className="text-xs text-muted-foreground">注意</p>
            </div>
            <div className="rounded-lg bg-signal-stop/15 px-2 py-3">
              <p className="text-2xl font-bold text-signal-stop">{counts.error}</p>
              <p className="text-xs text-muted-foreground">异常</p>
            </div>
          </div>
          <Button
            className="mt-4 h-14 w-full text-base font-semibold"
            onClick={() => router.push("/bind")}
          >
            完成作业
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  )
}
