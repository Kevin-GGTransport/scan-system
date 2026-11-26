"use client";

/**
 * 库位绑定 · 第一阶段：确定库位（一趟上架动作的起点）。
 * 扫 GGBIN → 大号确认卡片（库位牌放大时刻）→「开始扫货」进入 /bind/[binCode]。
 * 直接扫货物码会被拦（提示先定库位）；扫另一个库位码即覆盖。
 */
import { useCallback, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { ScannerLazy as Scanner } from "@/components/scanner/scanner-lazy";
import { outcomeKind, useScanJob } from "@/components/scanner/use-scan-job";
import { BindSteps } from "@/components/bind-steps";

export default function BindBinPage() {
  const router = useRouter();
  const [bin, setBin] = useState<{ binCode: string; occupants: number } | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "warn" | "error"; id: number } | null>(null);
  const { last, submit } = useScanJob(null);

  const handleScan = useCallback(
    async (text: string) => {
      const verdict = await submit(text);
      if (!verdict) return;
      setFlash({ kind: outcomeKind(verdict.outcome), id: Date.now() });
      if (verdict.outcome === "bin_set" && verdict.data?.binCode) {
        setBin({ binCode: verdict.data.binCode, occupants: verdict.data.occupants ?? 0 });
      }
    },
    [submit]
  );

  return (
    <div className="page-enter relative flex h-full flex-col gap-3 p-3">
      {flash ? (
        <div
          key={flash.id}
          className="outcome-flash"
          style={{ "--flash-color": `var(--signal-${flash.kind === "ok" ? "ok" : flash.kind === "warn" ? "warn" : "stop"})` } as CSSProperties}
        />
      ) : null}

      <BindSteps step={1} />

      <Scanner
        onResult={(text) => void handleScan(text)}
        hint={bin ? "库位已锁定 · 点下方按钮开始扫货" : "扫库位码（标签 GGBIN: 开头）"}
        className="min-h-0 flex-1"
      />

      {bin ? (
        <div className="flex flex-col gap-2.5">
          {/* 库位确认牌（本页主角时刻）：货架标签风格放大版 */}
          <div className="flex overflow-hidden rounded-xl border border-hivis/50 bg-card shadow-lg shadow-black/30">
            <div className="w-2.5 shrink-0 bg-hivis" aria-hidden />
            <div className="flex flex-1 items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">当前库位</p>
                <p className="font-code text-4xl font-bold leading-tight">{bin.binCode}</p>
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                在库 {bin.occupants} 批
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/bind/${encodeURIComponent(bin.binCode)}`)}
            className="flex h-16 items-center justify-center gap-2 rounded-xl bg-hivis text-lg font-bold text-primary-foreground touch-manipulation active:scale-[0.99]"
          >
            开始扫货
            <ArrowRight className="h-6 w-6" aria-hidden />
          </button>

          <p className="text-center text-xs text-muted-foreground">
            扫错了？直接扫另一个库位码即可覆盖
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-5 text-center">
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" aria-hidden />
            扫库位码后在这里确认
          </p>
          {last && last.outcome !== "bin_set" ? (
            <p className="mt-1.5 text-sm font-medium text-signal-stop">{last.message}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
