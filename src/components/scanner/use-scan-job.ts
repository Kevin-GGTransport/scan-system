"use client";

/**
 * 扫码作业状态机（库位绑定）。
 * - POST /api/bind/scan，25s 超时；网络失败自动重试一次（条件更新天然幂等，重试安全）
 * - 按 outcome 分类播放蜂鸣/振动并维护本次作业计数
 * - 401 时整页跳登录（proxy 失效兜底）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { playFeedback } from "./feedback";

export const SCAN_OUTCOMES = [
  "bin_set", "matched", "moved", "duplicate", "ambiguous",
  "unmatched", "invalid_bin", "need_bin", "conflict", "error",
] as const;

export type ScanOutcome = (typeof SCAN_OUTCOMES)[number];

export type FeedbackKind = "ok" | "warn" | "error";

const OUTCOME_KIND: Record<ScanOutcome, FeedbackKind> = {
  bin_set: "ok",
  matched: "ok",
  duplicate: "ok",
  moved: "warn",
  ambiguous: "warn",
  need_bin: "warn",
  unmatched: "error",
  invalid_bin: "error",
  conflict: "error",
  error: "error",
};

export type BindCandidate = {
  orderDetailId: string;
  orderId: string;
  container: string;
  po: string | null;
  destinationCode: string | null;
  destinationName: string | null;
  estimatedPallets: number | null;
};

export type Verdict = {
  outcome: ScanOutcome;
  message: string;
  data?: {
    binCode?: string;
    binLocationId?: string;
    occupants?: number;
    candidates?: BindCandidate[];
    container?: string;
    destinationCode?: string | null;
    destinationName?: string | null;
    po?: string | null;
    estimatedPallets?: number | null;
    orderDetailId?: string;
    movedFrom?: string[];
    reason?: string;
    raw?: string;
  };
};

export function outcomeKind(outcome: ScanOutcome): FeedbackKind {
  return OUTCOME_KIND[outcome] ?? "error";
}

const REQUEST_TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 1_500;

export function useScanJob(binCode: string | null) {
  const router = useRouter();
  const [last, setLast] = useState<Verdict | null>(null);
  const [recent, setRecent] = useState<Verdict[]>([]);
  const [counts, setCounts] = useState({ ok: 0, warn: 0, error: 0 });
  const binCodeRef = useRef(binCode);

  useEffect(() => {
    binCodeRef.current = binCode;
  }, [binCode]);

  const record = useCallback((verdict: Verdict) => {
    const kind = outcomeKind(verdict.outcome);
    playFeedback(kind);
    setLast({ ...verdict });
    setCounts((prev) => ({ ...prev, [kind]: prev[kind] + 1 }));
    setRecent((prev) => [verdict, ...prev].slice(0, 30));
  }, []);

  const submit = useCallback(
    async (payload: string, chosenOrderDetailId?: string): Promise<Verdict | null> => {
      const body = JSON.stringify({
        payload,
        binCode: binCodeRef.current,
        chosenOrderDetailId: chosenOrderDetailId ?? null,
      });

      const attempt = async (): Promise<Response> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          return await fetch("/api/bind/scan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      };

      let response: Response;
      try {
        response = await attempt();
      } catch {
        // 弱网重试一次（服务端条件更新幂等，重试无重复副作用）
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        try {
          response = await attempt();
        } catch {
          record({ outcome: "error", message: "网络不可用，请检查 Wi-Fi 后重扫" });
          return null;
        }
      }

      if (response.status === 401) {
        router.push("/login");
        return null;
      }

      let verdict: Verdict;
      try {
        verdict = (await response.json()) as Verdict;
      } catch {
        verdict = { outcome: "error", message: `服务异常（${response.status}）` };
      }

      record(verdict);
      return verdict;
    },
    [record, router]
  );

  return { last, recent, counts, submit };
}
