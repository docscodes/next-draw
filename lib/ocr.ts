import type { PDFPageProxy } from "pdfjs-dist"

import type { Region } from "@/lib/annotations"

/** Where `scripts/copy-tesseract-assets.mjs` puts the OCR runtime. */
const RUNTIME = "/tesseract"

/** Rectangles are rendered at this DPI to be read, which is what Tesseract wants. */
const OCR_DPI = 300

/** A PDF unit is 1/72", so this turns page units into OCR pixels. */
const OCR_SCALE = OCR_DPI / 72

/** Ceilings on one crop, so a rectangle over a whole A0 sheet still renders. */
const MAX_CROP_SIDE = 8_000
const MAX_CROP_PIXELS = 16_000_000

type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>

/** What one rectangle turned out to say. */
export type Reading = { text: string; confidence: number }

let engine: Promise<OcrWorker> | null = null

/**
 * The OCR worker, started on first use and shared by every read after that.
 * Starting it pulls ~7 MB of WebAssembly and model data from this app — the
 * browser caches both, so only the first read pays for it.
 */
function start() {
  engine ??= (async () => {
    const { createWorker, OEM, PSM } = await import("tesseract.js")

    const worker = await createWorker("eng", OEM.LSTM_ONLY, {
      // Served from public/tesseract rather than a CDN, so a page never
      // leaves this machine to be read.
      workerPath: `${RUNTIME}/worker.min.js`,
      corePath: RUNTIME,
      langPath: `${RUNTIME}/lang`,
    })

    // A rectangle is drawn around one block of text, so layout analysis has
    // nothing useful to find and only gets in the way.
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      user_defined_dpi: String(OCR_DPI),
    })

    return worker
  })()

  // A failed start must not be remembered, or every later read repeats it.
  return engine.catch((cause: unknown) => {
    engine = null
    throw cause
  })
}

/** Shuts the worker down, releasing the WebAssembly heap it holds. */
export async function stopOcr() {
  const running = engine
  engine = null
  await running?.then((worker) => worker.terminate()).catch(() => {})
}

/** Backs the scale off so even a rectangle over a whole page fits one canvas. */
function scaleFor(width: number, height: number) {
  return Math.min(
    OCR_SCALE,
    MAX_CROP_SIDE / Math.max(width, height, 1),
    Math.sqrt(MAX_CROP_PIXELS / Math.max(width * height, 1))
  )
}

/**
 * Draws one rectangle of a page at OCR resolution. Anything an ignore
 * rectangle covers is painted out first, so content marked to skip cannot
 * bleed into what is read.
 */
async function crop(pdfPage: PDFPageProxy, region: Region, ignored: Region[]) {
  const page = pdfPage.getViewport({ scale: 1 })
  const viewport = pdfPage.getViewport({
    scale: scaleFor(page.width * region.w, page.height * region.h),
  })

  const left = Math.round(region.x * viewport.width)
  const top = Math.round(region.y * viewport.height)

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(region.w * viewport.width))
  canvas.height = Math.max(1, Math.round(region.h * viewport.height))

  // The whole page is drawn, shifted so the rectangle lands at the origin;
  // everything outside the canvas is clipped away.
  await pdfPage.render({
    canvas,
    viewport,
    transform: [1, 0, 0, 1, -left, -top],
  }).promise

  const context = canvas.getContext("2d")

  if (context) {
    context.fillStyle = "#ffffff"
    for (const skip of ignored) {
      context.fillRect(
        skip.x * viewport.width - left,
        skip.y * viewport.height - top,
        skip.w * viewport.width,
        skip.h * viewport.height
      )
    }
  }

  return canvas
}

/** Collapses the whitespace OCR leaves behind, keeping the line breaks. */
const tidy = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")

/** Reads one capture rectangle with the OCR engine running in this browser. */
export async function readRegion(
  pdfPage: PDFPageProxy,
  region: Region,
  ignored: Region[]
): Promise<Reading> {
  const [worker, canvas] = await Promise.all([
    start(),
    crop(pdfPage, region, ignored),
  ])

  try {
    const { data } = await worker.recognize(canvas)
    return { text: tidy(data.text), confidence: data.confidence }
  } finally {
    // Drops the backing store now rather than waiting for a collection.
    canvas.width = 0
    canvas.height = 0
  }
}
