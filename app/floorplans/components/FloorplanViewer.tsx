"use client"

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Loader2,
  ScanText,
  SquareDashed,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import type { PageRegions, Region, RegionKind } from "@/lib/annotations"
import { deleteRegions, saveRegion } from "../actions"

/** Widest the page is drawn, so single-page plans stay readable on 4K screens. */
const MAX_PAGE_WIDTH = 1400

/** Drags shorter than this are treated as a stray click, not a rectangle. */
const MIN_REGION_PX = 8

/** Wording and colours per kind. Classes are spelled out so Tailwind keeps them. */
const KINDS: Record<
  RegionKind,
  {
    icon: LucideIcon
    label: string
    hint: string
    remove: string
    box: string
    handle: string
  }
> = {
  ignore: {
    icon: SquareDashed,
    label: "Ignore areas",
    hint: "Drag over content to ignore",
    remove: "Remove ignored area",
    box: "border-red-500 bg-red-500/10",
    handle: "bg-red-500 hover:bg-red-600",
  },
  capture: {
    icon: ScanText,
    label: "Capture text",
    hint: "Drag over text to capture",
    remove: "Remove captured area",
    box: "border-green-500 bg-green-500/10",
    handle: "bg-green-500 hover:bg-green-600",
  },
}

const KIND_ORDER = Object.keys(KINDS) as RegionKind[]

/**
 * How a mark's remove handle behaves. While marking it stays out, and the mark
 * itself must not swallow drags. While reading the mark takes the pointer so
 * hovering it — or tabbing to the handle — brings the handle up.
 */
const HANDLES = {
  marking: { mark: "", handle: "pointer-events-auto" },
  reading: {
    mark: "pointer-events-auto",
    handle:
      "pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100",
  },
}

type Props = {
  url: string
  name: string
  /** Object path in the bucket, used as the key marks are saved under. */
  path: string
  /** Marks already saved for this plan, grouped by page. */
  regions: PageRegions
  /** Set when the saved marks could not be read; marking still works. */
  regionsError: string | null
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

const FloorplanViewer = ({
  url,
  name,
  path,
  regions: saved,
  regionsError,
}: Props) => {
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
  /** Which kind of rectangle the pointer draws, or null when just reading. */
  const [mode, setMode] = useState<RegionKind | null>(null)
  const [regions, setRegions] = useState<PageRegions>(saved)
  /** The rectangle being dragged out, drawn until the pointer is released. */
  const [pending, setPending] = useState<Region | null>(null)
  /** Why the last write to Supabase did not stick, if it failed. */
  const [saveError, setSaveError] = useState<string | null>(regionsError)
  /** How many writes are still in flight. */
  const [writes, setWrites] = useState(0)

  const pages = doc?.numPages ?? 0
  const pageRegions = regions[page] ?? []
  const handles = HANDLES[mode ? "marking" : "reading"]

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

  /**
   * Applies a change to the page straight away and sends it to Supabase. A
   * rejected write is undone, so what is drawn always matches what is stored.
   */
  const write = async (
    send: () => Promise<{ error: string | null }>,
    undo: () => void
  ) => {
    setWrites((count) => count + 1)
    try {
      const { error } = await send()
      if (error) {
        setSaveError(error)
        undo()
      } else {
        setSaveError(null)
      }
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not save")
      undo()
    } finally {
      setWrites((count) => count - 1)
    }
  }

  const addRegion = (on: number, region: Region) =>
    setRegions((current) => ({
      ...current,
      [on]: [...(current[on] ?? []), region],
    }))

  const dropRegions = (on: number, ids: Set<string>) =>
    setRegions((current) => ({
      ...current,
      [on]: (current[on] ?? []).filter((region) => !ids.has(region.id)),
    }))

  const createRegion = (region: Region) => {
    const on = page
    addRegion(on, region)
    void write(
      () => saveRegion(path, on, region),
      () => dropRegions(on, new Set([region.id]))
    )
  }

  const removeRegions = (removed: Region[]) => {
    const on = page
    dropRegions(on, new Set(removed.map((region) => region.id)))
    void write(
      () =>
        deleteRegions(
          path,
          removed.map((region) => region.id)
        ),
      // Order within a page is not meaningful, so restoring by append is fine.
      () =>
        setRegions((current) => ({
          ...current,
          [on]: [...(current[on] ?? []), ...removed],
        }))
    )
  }

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
        {KIND_ORDER.map((kind) => {
          const { icon: Icon, label } = KINDS[kind]
          return (
            <Button
              key={kind}
              size="sm"
              variant={mode === kind ? "secondary" : "ghost"}
              aria-pressed={mode === kind}
              disabled={!doc}
              onClick={() => {
                cancelDrag()
                setMode((current) => (current === kind ? null : kind))
              }}
            >
              <Icon className="size-4" />
              {label}
            </Button>
          )
        })}
        {pageRegions.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => removeRegions(pageRegions)}
          >
            <Eraser className="size-4" />
            Clear {pageRegions.length}
          </Button>
        )}
        {writes > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Saving
          </span>
        )}
        {mode && (
          <span className="hidden text-sm text-muted-foreground md:inline">
            {KINDS[mode].hint}
          </span>
        )}
      </div>
      {saveError && (
        <div className="flex items-start gap-2 border-b border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-medium">Marks are not being saved.</span>{" "}
            {saveError}
          </p>
        </div>
      )}
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
            {mode && (
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
                  setPending({
                    id: "pending",
                    kind: mode,
                    ...start,
                    w: 0,
                    h: 0,
                  })
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
                    kind: mode,
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
                  createRegion({ ...drawn, id: crypto.randomUUID() })
                }}
                onPointerCancel={cancelDrag}
              />
            )}
            {/* Marks sit on top so they stay clickable while marking. */}
            <div className="pointer-events-none absolute inset-0">
              {pageRegions.map((region) => (
                <div
                  key={region.id}
                  className={`group absolute border-2 ${handles.mark} ${KINDS[region.kind].box}`}
                  style={{
                    left: `${region.x * 100}%`,
                    top: `${region.y * 100}%`,
                    width: `${region.w * 100}%`,
                    height: `${region.h * 100}%`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={KINDS[region.kind].remove}
                    onClick={() => removeRegions([region])}
                    className={`absolute -top-2.5 -right-2.5 grid size-5 place-items-center rounded-full text-white shadow-sm ${handles.handle} ${KINDS[region.kind].handle}`}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {pending && (
                <div
                  className={`absolute border-2 border-dashed ${KINDS[pending.kind].box}`}
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
