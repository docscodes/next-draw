import { Download, FileText } from "lucide-react"
import Link from "next/link"

import { floorplanHref, type Floorplan } from "@/lib/floorplans"
import { formatDate, formatSize } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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
        <Button asChild size="sm" className="flex-1">
          {/* The viewer page signs its own URL, so this link never expires. */}
          <Link href={floorplanHref(floorplan.path)}>View</Link>
        </Button>
        {floorplan.url && (
          <Button asChild size="sm" variant="outline">
            <a href={`${floorplan.url}&download=`}>
              <Download className="size-4" />
              <span className="sr-only">Download {floorplan.name}</span>
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export default FloorplanCard
