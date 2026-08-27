import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="py-6">
      <header className="mb-6 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-4 flex-1" />
            </div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
