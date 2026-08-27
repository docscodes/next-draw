import { AlertTriangle, ArrowLeft, Download, ExternalLink } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getAnnotations } from "@/lib/annotations"
import { getFloorplan } from "@/lib/floorplans"
import { formatDate, formatSize } from "@/lib/format"
import { Button } from "@/components/ui/button"
import FloorplanViewer from "../components/FloorplanViewer"

// The viewer is driven by a signed URL minted per request.
export const dynamic = "force-dynamic"

type Props = { params: Promise<{ path: string[] }> }

export async function generateMetadata({ params }: Props) {
  const { path } = await params
  return { title: path[path.length - 1] ?? "Floorplan" }
}

export default async function Page({ params }: Props) {
  const { path } = await params
  const objectPath = path.join("/")
  const { floorplan, error } = await getFloorplan(objectPath)

  if (error === "notFound") notFound()

  // Marks are loaded here so the page opens with them already drawn.
  const { regions, error: regionsError } = await getAnnotations(objectPath)

  const updatedAt = floorplan && formatDate(floorplan.updatedAt)

  return (
    <div className="flex min-h-[calc(100svh-6rem)] flex-col py-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
            <Link href="/floorplans">
              <ArrowLeft className="size-4" />
              Floorplans
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {floorplan?.name ?? objectPath}
          </h1>
          <p className="text-sm text-muted-foreground">
            {floorplan
              ? [
                  floorplan.folder,
                  formatSize(floorplan.size),
                  updatedAt && `Updated ${updatedAt}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Could not load this floorplan."}
          </p>
        </div>

        {floorplan?.url && (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={floorplan.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                Open
              </a>
            </Button>
            <Button asChild size="sm">
              <a href={`${floorplan.url}&download=`}>
                <Download className="size-4" />
                Download
              </a>
            </Button>
          </div>
        )}
      </header>

      {error || !floorplan?.url ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-medium">Could not open this floorplan</p>
            <p className="mt-1 text-destructive/90">
              {error ?? "The download link could not be signed."}
            </p>
          </div>
        </div>
      ) : (
        <FloorplanViewer
          // Remounting on a new plan swaps in that plan's saved marks.
          key={floorplan.path}
          url={floorplan.url}
          name={floorplan.name}
          path={floorplan.path}
          regions={regions}
          regionsError={regionsError}
        />
      )}
    </div>
  )
}
