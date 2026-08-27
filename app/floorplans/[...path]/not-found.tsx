import { FileQuestion } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 py-6 text-center text-muted-foreground">
      <FileQuestion className="size-8" />
      <p className="font-medium">Floorplan not found</p>
      <p className="text-sm">
        It may have been renamed or removed from the bucket.
      </p>
      <Button asChild size="sm" variant="outline" className="mt-2">
        <Link href="/floorplans">Back to floorplans</Link>
      </Button>
    </div>
  )
}
