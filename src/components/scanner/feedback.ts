/**
 * 扫码结果反馈：WebAudio 蜂鸣 + 振动（无音频文件依赖）。
 * iOS 无 navigator.vibrate，靠声音兜底；AudioContext 依赖用户手势后创建（进作业页已点过相机启动）。
 */

type FeedbackKind = "ok" | "warn" | "error"

let audioCtx: AudioContext | null = null

function ensureCtx(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audioCtx ??= new Ctor()
    if (audioCtx.state === "suspended") void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function tone(freq: number, durationMs: number, delayMs = 0): void {
  const ctx = ensureCtx()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "square"
  osc.frequency.value = freq
  const start = ctx.currentTime + delayMs / 1000
  gain.gain.setValueAtTime(0.12, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + durationMs / 1000 + 0.02)
}

const VIBRATE_PATTERNS: Record<FeedbackKind, number[] | null> = {
  ok: [30],
  warn: [60, 50, 60],
  error: [120, 60, 120],
}

export function playFeedback(kind: FeedbackKind): void {
  if (kind === "ok") {
    tone(880, 80)
  } else if (kind === "warn") {
    tone(660, 90)
    tone(520, 110, 140)
  } else {
    tone(220, 200)
  }

  const pattern = VIBRATE_PATTERNS[kind]
  if (pattern && typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* 振动失败静默 */
    }
  }
}
