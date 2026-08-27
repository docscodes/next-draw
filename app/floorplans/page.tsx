import { AlertTriangle, FolderOpen } from "lucide-react"

import { listFloorplans } from "@/lib/floorplans"
import FloorplanCard from "./components/FloorplanCard"
import ImportFloorplans from "./components/ImportFloorplans"

export const metadata = {
  title: "Floorplans",
  description: "PDF floorplans stored in Supabase Storage.",
}

// Signed URLs are minted per request, so never serve this page from the cache.
export const dynamic = "force-dynamic"

export default async function Page() {
  const result = await listFloorplans()
  const floorplans = result.floorplans ?? []

  return (
    <div className="py-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Floorplans</h1>
          <p className="text-sm text-muted-foreground">
            {result.error
              ? "PDF floorplans from Supabase Storage."
              : `${floorplans.length} PDF ${
                  floorplans.length === 1 ? "file" : "files"
                } in Supabase Storage.`}
          </p>
        </div>
        <ImportFloorplans />
      </header>

      {result.error ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">Could not load floorplans</p>
            <p className="mt-1 text-destructive/90">{result.error}</p>
          </div>
        </div>
      ) : floorplans.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <FolderOpen className="size-8" />
          <p className="font-medium">No floorplans yet</p>
          <p className="text-sm">
            Import PDF files and they will show up here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {floorplans.map((floorplan) => (
            <FloorplanCard key={floorplan.path} floorplan={floorplan} />
          ))}
        </div>
      )}
    </div>
  )
}
