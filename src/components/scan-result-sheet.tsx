"use client";

/**
 * 歧义明细点选（柜号有多个明细时工人选择绑定对象）。
 */
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BindCandidate } from "@/components/scanner/use-scan-job";

export interface ScanResultSheetProps {
  open: boolean;
  container: string;
  candidates: BindCandidate[];
  onSelect: (candidate: BindCandidate) => void;
  onDismiss: () => void;
}

export function ScanResultSheet({
  open,
  container,
  candidates,
  onSelect,
  onDismiss,
}: ScanResultSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onDismiss() : undefined)}>
      <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6">
        <SheetHeader className="text-left">
          <SheetTitle className="font-code text-lg">{container}</SheetTitle>
          <SheetDescription>这个柜号有 {candidates.length} 个明细，请选择要绑定的</SheetDescription>
        </SheetHeader>
        <div className="mt-2 flex flex-col gap-2">
          {candidates.map((candidate) => (
            <button
              key={candidate.orderDetailId}
              type="button"
              onClick={() => onSelect(candidate)}
              className="flex min-h-14 items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left touch-manipulation active:scale-[0.99]"
            >
              <span className="flex flex-col">
                <span className="font-medium">
                  {candidate.destinationCode ?? candidate.destinationName ?? "无仓点"}
                </span>
                <span className="text-sm text-muted-foreground">PO {candidate.po ?? "—"}</span>
              </span>
              <span className="font-code text-sm text-muted-foreground">
                {candidate.estimatedPallets ?? "?"} 板
              </span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
