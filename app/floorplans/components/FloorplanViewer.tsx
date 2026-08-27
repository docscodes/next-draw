"use client"

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Loader2,
  SquareDashed,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

/** Widest the page is drawn, so single-page plans stay readable on 4K screens. */
const MAX_PAGE_WIDTH = 1400

/** Drags shorter than this are treated as a stray click, not a rectangle. */
const MIN_REGION_PX = 8

/**
 * A rectangle covering content the reader should skip — title blocks, legends,
 * revision tables. Stored as fractions of the page so it survives resizing.
 */
type Region = { id: string; x: number; y: number; w: number; h: number }

type Props = { url: string; name: string }

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

const FloorplanViewer = ({ url, name }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** Where the current drag began, in page fractions. */
  const originRef = useRef<{ x: number; y: number } | null>(null)

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  /** What the page box shows while it is being typed into. */
  const [draft, setDraft] = useState("1")
  const [width, setWidth] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [marking, setMarking] = useState(false)
  const [regions, setRegions] = useState<Record<number, Region[]>>({})
  /** The rectangle being dragged out, drawn until the pointer is released. */
  const [pending, setPending] = useState<Region | null>(null)

  const pages = doc?.numPages ?? 0
  const pageRegions = regions[page] ?? []

  const goTo = useCallback(
    (next: number) => {
      if (!pages) return
      const clamped = Math.min(Math.max(next, 1), pages)
      setPage(clamped)
      setDraft(String(clamped))
      scrollRef.current?.scrollTo({ top: 0 })
    },
    [pages]
  )

  const cancelDrag = useCallback(() => {
    originRef.current = null
    setPending(null)
  }, [])

  // pdf.js only runs in the browser, so it is pulled in once the viewer mounts.
  useEffect(() => {
    let cancelled = false
    let loading: PDFDocumentLoadingTask | null = null

    const open = async () => {
      const pdfjs = await import("pdfjs-dist")

      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString()

      if (cancelled) return

      loading = pdfjs.getDocument({ url })
      const opened = await loading.promise
      if (cancelled) return

      setDoc(opened)
      setPage(1)
      setDraft("1")
      setRegions({})
    }

    const task = open().catch((cause: unknown) => {
      if (cancelled) return
      setError(cause instanceof Error ? cause.message : "Unknown error")
    })

    return () => {
      cancelled = true
      setDoc(null)
      // The document may still be loading, so tear down once it settles.
      task.then(() => loading?.destroy()).catch(() => {})
    }
  }, [url])

  // Pages are drawn to fit the width available to the viewer.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.min(entry.contentRect.width, MAX_PAGE_WIDTH))
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!doc || !canvas || !width) return

    let cancelled = false
    let render: RenderTask | null = null

    const draw = async () => {
      const pdfPage = await doc.getPage(page)
      if (cancelled) return

      const scale = width / pdfPage.getViewport({ scale: 1 }).width
      const viewport = pdfPage.getViewport({ scale })
      // Backing store is drawn at device resolution to keep line work crisp.
      const ratio = window.devicePixelRatio || 1

      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      render = pdfPage.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      })

      await render.promise
    }

    draw().catch((cause: unknown) => {
      // Superseded renders reject; only a real failure is worth reporting.
      if (cancelled) return
      setError(cause instanceof Error ? cause.message : "Unknown error")
    })

    return () => {
      cancelled = true
      render?.cancel()
    }
  }, [doc, page, width])

  // Arrow and page keys move through the document, unless a field has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable]")) return

      if (event.key === "Escape" && originRef.current) {
        cancelDrag()
        event.preventDefault()
        return
      }

      const step = {
        ArrowLeft: -1,
        ArrowRight: 1,
        PageUp: -1,
        PageDown: 1,
      }[event.key]

      if (step) goTo(page + step)
      else if (event.key === "Home") goTo(1)
      else if (event.key === "End") goTo(pages)
      else return

      event.preventDefault()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [cancelDrag, goTo, page, pages])

  /** Turns a pointer position into a fraction of the rendered page. */
  const pointIn = (element: HTMLElement, clientX: number, clientY: number) => {
    const box = element.getBoundingClientRect()
    return {
      x: clamp01((clientX - box.left) / box.width),
      y: clamp01((clientY - box.top) / box.height),
    }
  }

  const removeRegion = (id: string) =>
    setRegions((current) => ({
      ...current,
      [page]: (current[page] ?? []).filter((region) => region.id !== id),
    }))

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-medium">Could not open this floorplan</p>
          <p className="mt-1 text-destructive/90">{error}</p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open {name}
            </a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[70svh] flex-1 flex-col overflow-hidden rounded-xl border bg-muted">
      <div className="flex flex-wrap items-center justify-center gap-2 border-b bg-background px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="sr-only">Page number</span>
          <Input
            value={draft}
            inputMode="numeric"
            disabled={!pages}
            className="h-8 w-14 text-center"
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            // Committing on blur as well keeps a typed page from being lost.
            onBlur={() => goTo(Number(draft) || page)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                goTo(Number(draft) || page)
                event.currentTarget.blur()
              }
              if (event.key === "Escape") setDraft(String(page))
            }}
          />
          of {pages || "—"}
        </label>
        <Button
          size="sm"
          variant="ghost"
          disabled={page >= pages}
          onClick={() => goTo(page + 1)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button
          size="sm"
          variant={marking ? "secondary" : "ghost"}
          aria-pressed={marking}
          disabled={!doc}
          onClick={() => {
            cancelDrag()
            setMarking((on) => !on)
          }}
        >
          <SquareDashed className="size-4" />
          Ignore areas
        </Button>
        {pageRegions.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setRegions((current) => ({ ...current, [page]: [] }))
            }
          >
            <Eraser className="size-4" />
            Clear {pageRegions.length}
          </Button>
        )}
        {marking && (
          <span className="hidden text-sm text-muted-foreground md:inline">
            Drag over content to ignore
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex flex-1 justify-center overflow-auto p-4"
      >
        {doc ? (
          <div className="relative h-fit shadow-sm">
            <canvas
              ref={canvasRef}
              className="block"
              aria-label={`${name}, page ${page} of ${pages}`}
            />
            {/* Drag surface, above the page but below the marks. */}
            {marking && (
              <div
                className="absolute inset-0 cursor-crosshair touch-none"
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  const start = pointIn(
                    event.currentTarget,
                    event.clientX,
                    event.clientY
                  )
                  originRef.current = start
                  setPending({ id: "pending", ...start, w: 0, h: 0 })
                }}
                onPointerMove={(event) => {
                  const origin = originRef.current
                  if (!origin) return
                  const to = pointIn(
                    event.currentTarget,
                    event.clientX,
                    event.clientY
                  )
                  setPending({
                    id: "pending",
                    x: Math.min(origin.x, to.x),
                    y: Math.min(origin.y, to.y),
                    w: Math.abs(to.x - origin.x),
                    h: Math.abs(to.y - origin.y),
                  })
                }}
                onPointerUp={(event) => {
                  const box = event.currentTarget.getBoundingClientRect()
                  const drawn = pending
                  cancelDrag()
                  if (
                    !drawn ||
                    drawn.w * box.width < MIN_REGION_PX ||
                    drawn.h * box.height < MIN_REGION_PX
                  )
                    return
                  const region = { ...drawn, id: crypto.randomUUID() }
                  setRegions((current) => ({
                    ...current,
                    [page]: [...(current[page] ?? []), region],
                  }))
                }}
                onPointerCancel={cancelDrag}
              />
            )}
            {/* Marks sit on top so they stay clickable while marking. */}
            <div className="pointer-events-none absolute inset-0">
              {pageRegions.map((region) => (
                <div
                  key={region.id}
                  className="absolute border-2 border-red-500 bg-red-500/10"
                  style={{
                    left: `${region.x * 100}%`,
                    top: `${region.y * 100}%`,
                    width: `${region.w * 100}%`,
                    height: `${region.h * 100}%`,
                  }}
                >
                  {marking && (
                    <button
                      type="button"
                      aria-label="Remove ignored area"
                      onClick={() => removeRegion(region.id)}
                      className="pointer-events-auto absolute -top-2.5 -right-2.5 grid size-5 place-items-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              ))}
              {pending && (
                <div
                  className="absolute border-2 border-dashed border-red-500 bg-red-500/10"
                  style={{
                    left: `${pending.x * 100}%`,
                    top: `${pending.y * 100}%`,
                    width: `${pending.w * 100}%`,
                    height: `${pending.h * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading {name}…
          </div>
        )}
      </div>
    </div>
  )
}

export default FloorplanViewer
