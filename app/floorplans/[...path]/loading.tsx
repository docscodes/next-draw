import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="py-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
      </header>
      <Skeleton className="h-[70svh] w-full rounded-xl" />
    </div>
  )
}
