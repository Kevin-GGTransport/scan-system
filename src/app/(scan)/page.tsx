import Link from "next/link";
import { ArrowRight, ClipboardList, PackageOpen, Truck, Warehouse } from "lucide-react";

const JOBS = [
  {
    href: "/bind",
    title: "库位绑定",
    description: "先扫库位，再连续扫货物码上架",
    icon: Warehouse,
    enabled: true,
  },
  {
    href: "/stocktake",
    title: "盘点",
    description: "按库位连续盘点，与系统比对",
    icon: ClipboardList,
    enabled: false,
  },
  {
    href: "/picking",
    title: "提货核对",
    description: "按出库单逐件扫码核对",
    icon: Truck,
    enabled: false,
  },
] as const;

export default function JobSelectPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center gap-3 p-4">
      <h1 className="px-1 pb-1 text-base font-medium text-muted-foreground">选择作业</h1>

      {/* 可用作业：大主卡——戴手套低头一眼点中；未上线：压缩单行不抢焦点 */}
      {JOBS.map((job) => {
        const Icon = job.icon;
        if (job.enabled) {
          return (
            <Link key={job.href} href={job.href} className="touch-manipulation active:scale-[0.99]">
              <div className="flex min-h-28 items-center gap-4 rounded-xl border border-hivis/50 bg-card px-5 py-5 shadow-lg shadow-black/30">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-hivis text-primary-foreground">
                  <Icon className="h-8 w-8" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-xl font-bold">{job.title}</span>
                  <span className="text-sm text-muted-foreground">{job.description}</span>
                </span>
                <ArrowRight className="ml-auto h-6 w-6 shrink-0 text-hivis" aria-hidden />
              </div>
            </Link>
          );
        }
        return (
          <div
            key={job.href}
            aria-disabled
            className="flex min-h-14 items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-3 opacity-45"
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span className="text-sm font-medium">{job.title}</span>
            <span className="truncate text-xs text-muted-foreground">{job.description}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <PackageOpen className="h-3.5 w-3.5" aria-hidden />
              未上线
            </span>
          </div>
        );
      })}
    </div>
  );
}
