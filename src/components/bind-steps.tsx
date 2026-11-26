/** 两段式上架作业的步骤指示（真实工序序列：先定库位再扫货） */
export function BindSteps({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2 text-xs" aria-label="作业步骤">
      <span
        className={
          step === 1
            ? "rounded-full bg-hivis px-3 py-1 font-bold text-primary-foreground"
            : "rounded-full bg-muted px-3 py-1 text-muted-foreground"
        }
      >
        ① 确定库位
      </span>
      <span
        aria-hidden
        className={step === 2 ? "h-0.5 flex-1 rounded-full bg-hivis/50" : "h-px flex-1 bg-border"}
      />
      <span
        className={
          step === 2
            ? "rounded-full bg-hivis px-3 py-1 font-bold text-primary-foreground"
            : "rounded-full bg-muted px-3 py-1 text-muted-foreground"
        }
      >
        ② 扫货物上架
      </span>
    </div>
  )
}
