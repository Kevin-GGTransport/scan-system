"use client";

/**
 * 相机扫码组件（@zxing/browser）。
 * - QR_CODE + CODE_128，TRY_HARDER，150ms 间隔
 * - 同码去重（dedupMs，默认 2500）
 * - 蓝牙扫码枪：keydown 缓冲 + Enter 上抛，与相机统一到 onResult
 * - 卸载时 controls.stop() + 停 track（否则相机常亮）
 */
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Flashlight, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScannerProps {
  onResult: (text: string) => void;
  /** 同码去重窗口（毫秒） */
  dedupMs?: number;
  /** 瞄准框提示文案 */
  hint?: string;
  className?: string;
}

const TORCH_TARGET_OFF = { advanced: [{ torch: false }] } as MediaTrackConstraintSet;
const TORCH_TARGET_ON = { advanced: [{ torch: true }] } as MediaTrackConstraintSet;

export function Scanner({ onResult, dedupMs = 2500, hint, className }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onResultRef = useRef(onResult);
  const lastTextRef = useRef<string>("");
  const lastAtRef = useRef(0);
  const gunBufferRef = useRef("");

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [awaitingTap, setAwaitingTap] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  // 点按重启计数：iOS 切后台/截屏会挂断相机流，回来后只能整建，play() 救不活
  const [attempt, setAttempt] = useState(0);

  // 保持最新回调引用，避免相机因父组件重渲染而重启
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const onPlaying = () => setAwaitingTap(false);
    video.addEventListener("playing", onPlaying);

    const hints = new Map<number, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });

    const emit = (text: string) => {
      const now = Date.now();
      if (text === lastTextRef.current && now - lastAtRef.current < dedupMs) return;
      lastTextRef.current = text;
      lastAtRef.current = now;
      onResultRef.current(text);
    };

    void reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        video,
        (result) => {
          const text = result?.getText()
          if (text && !cancelled) emit(text)
        }
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchSupported(caps?.torch === true);

        // iOS 省电模式会拦 muted 自动播放：流已接但视频不播（黑屏）。
        // 2 秒内没进 playing 就亮出「点按启动」按钮（点击=整建相机流）。
        if (video.readyState >= 3) {
          setAwaitingTap(false);
        } else {
          setAwaitingTap(true);
          setTimeout(() => {
            if (!cancelled && video.paused) setAwaitingTap(true);
          }, 2000);
        }

        // 流被系统挂断（切后台/截屏/控制中心）时重新亮按钮，点按重启
        const stream = video.srcObject as MediaStream | null;
        stream?.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (!cancelled) setAwaitingTap(true)
          })
        })
        const onVisibility = () => {
          if (document.visibilityState === "visible" && video.paused && !cancelled) {
            setAwaitingTap(true)
          }
        }
        document.addEventListener("visibilitychange", onVisibility)
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : "";
        // 先判安全上下文：证书未信任（或走了 http）时 iOS 会把 getUserMedia 报成权限错误，极具迷惑性
        const reason = !window.isSecureContext
          ? "证书未受信任：装完描述文件后还要 设置→通用→关于本机→证书信任设置 打开开关，然后完全退出 Safari 重开"
          : name === "NotAllowedError"
            ? "相机权限被拒绝：设置→隐私与安全性→相机→打开 Safari 的开关，然后回来刷新"
            : name === "NotFoundError"
              ? "未找到摄像头"
              : "相机启动失败，请截图反馈";
        setCameraError(reason);
      });

    // 蓝牙扫码枪：键盘缓冲 + Enter 结束（输入框内不拦截）
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === "Enter") {
        const text = gunBufferRef.current.trim();
        gunBufferRef.current = "";
        if (text) emit(text);
        return;
      }
      if (event.key.length === 1 && gunBufferRef.current.length < 256) {
        gunBufferRef.current += event.key;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      cancelled = true;
      video.removeEventListener("playing", onPlaying);
      window.removeEventListener("keydown", onKeyDown);
      controlsRef.current?.stop();
      controlsRef.current = null;
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [dedupMs, attempt]);

  const toggleTorch = async () => {
    const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints(next ? TORCH_TARGET_ON : TORCH_TARGET_OFF);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg bg-black", className)}>
      {/* iOS Safari 三件套：playsInline + muted + autoPlay */}
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />

      {/* 瞄准框 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-40 w-64 opacity-90">
          <div className="absolute inset-x-0 top-0 h-8 border-x-2 border-t-2 border-hivis" />
          <div className="absolute inset-x-0 bottom-0 h-8 border-x-2 border-b-2 border-hivis" />
        </div>
      </div>
      {hint ? (
        <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-sm font-medium text-white/90 drop-shadow">
          {hint}
        </p>
      ) : null}

      {torchSupported ? (
        <button
          type="button"
          onClick={() => void toggleTorch()}
          aria-label={torchOn ? "关闭手电筒" : "打开手电筒"}
          className={cn(
            "absolute bottom-3 right-3 flex h-14 w-14 items-center justify-center rounded-full border",
            "touch-manipulation active:scale-95",
            torchOn
              ? "border-hivis bg-hivis text-primary-foreground"
              : "border-border bg-card/80 text-foreground backdrop-blur"
          )}
        >
          <Flashlight className="h-6 w-6" aria-hidden />
        </button>
      ) : null}

      {cameraError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 border-l-4 border-signal-stop bg-card/95 p-6 text-center">
          <ScanLine className="h-8 w-8 text-signal-stop" aria-hidden />
          <p className="font-medium text-signal-stop">{cameraError}</p>
          <p className="text-sm text-muted-foreground">也可使用蓝牙扫码枪扫码（回车确认）</p>
        </div>
      ) : awaitingTap ? (
        <button
          type="button"
          onClick={async () => {
            const video = videoRef.current
            // 先试恢复播放；不行（流已被系统挂断）就整建相机
            if (video) {
              try {
                await video.play()
                setAwaitingTap(false)
                return
              } catch {
                // 落到重启
              }
            }
            setAttempt((a) => a + 1)
          }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-center touch-manipulation active:scale-[0.99]"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-hivis text-hivis">
            <ScanLine className="h-10 w-10" aria-hidden />
          </span>
          <span className="text-lg font-semibold">点按启动相机</span>
          <span className="px-8 text-sm text-muted-foreground">
            切后台/截屏后相机会被系统挂断，点这里重新拉起
          </span>
        </button>
      ) : null}
    </div>
  );
}
