import { Download, FileText } from "lucide-react"

import type { Floorplan } from "@/lib/floorplans"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
})

function formatSize(bytes: number | null) {
  if (bytes === null) return "Unknown size"
  if (bytes < 1024) return `${bytes} B`

  const units = ["KB", "MB", "GB"]
  let size = bytes / 1024
  let unit = 0

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }

  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`
}

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date)
}

const FloorplanCard = ({ floorplan }: { floorplan: Floorplan }) => {
  const updatedAt = formatDate(floorplan.updatedAt)

  return (
    <Card className="transition-shadow hover:ring-ring/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate" title={floorplan.name}>
            {floorplan.name}
          </span>
        </CardTitle>
        {floorplan.folder && (
          <CardDescription
            className="truncate text-xs"
            title={floorplan.folder}
          >
            {floorplan.folder}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent>
        <dl className="flex gap-4 text-xs text-muted-foreground">
          <div>
            <dt className="sr-only">Size</dt>
            <dd>{formatSize(floorplan.size)}</dd>
          </div>
          {updatedAt && (
            <div>
              <dt className="sr-only">Last updated</dt>
              <dd>Updated {updatedAt}</dd>
            </div>
          )}
        </dl>
      </CardContent>

      <CardFooter className="mt-auto gap-2">
        {floorplan.url ? (
          <>
            <Button asChild size="sm" className="flex-1">
              <a href={floorplan.url} target="_blank" rel="noopener noreferrer">
                View
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`${floorplan.url}&download=`}>
                <Download className="size-4" />
                <span className="sr-only">Download {floorplan.name}</span>
              </a>
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Link unavailable</p>
        )}
      </CardFooter>
    </Card>
  )
}

export default FloorplanCard
