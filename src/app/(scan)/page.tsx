import Link from "next/link";
import { ClipboardList, PackageOpen, Truck, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
      <h1 className="px-1 pt-2 text-base font-medium text-muted-foreground">选择作业</h1>
      {JOBS.map((job) => {
        const Icon = job.icon;
        const content = (
          <div
            className={cn(
              "flex min-h-24 items-center gap-4 rounded-xl border bg-card px-5 py-4 touch-manipulation",
              job.enabled
                ? "border-border active:scale-[0.99]"
                : "border-border/50 opacity-45"
            )}
          >
            <span
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border",
                job.enabled ? "border-hivis/40 text-hivis" : "border-border text-muted-foreground"
              )}
            >
              <Icon className="h-7 w-7" aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-lg font-semibold">{job.title}</span>
              <span className="text-sm text-muted-foreground">{job.description}</span>
            </span>
            {job.enabled ? null : (
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <PackageOpen className="h-4 w-4" aria-hidden />
                未上线
              </span>
            )}
          </div>
        );
        return job.enabled ? (
          <Link key={job.href} href={job.href}>
            {content}
          </Link>
        ) : (
          <div key={job.href} aria-disabled>
            {content}
          </div>
        );
      })}
    </div>
  );
}
