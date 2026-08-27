/**
 * Copies the tesseract.js runtime out of node_modules and into
 * `public/tesseract`, so OCR runs entirely on the machine serving the app and
 * never reaches for a CDN. Run by `dev` and `build`; safe to re-run.
 *
 * Only the LSTM builds are copied. lib/ocr.ts pins `OEM.LSTM_ONLY`, which is
 * the only engine tesseract.js asks for at these paths.
 */
import { copyFile, mkdir, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(root, "public", "tesseract")

/** Locates an installed package by its manifest, which pnpm always exposes. */
const packageDir = (id, from = import.meta.url) =>
  dirname(createRequire(from).resolve(`${id}/package.json`))

const tesseract = packageDir("tesseract.js")
// `tesseract.js-core` is a dependency of tesseract.js, not of this app, so
// under pnpm it is only resolvable from there.
const core = packageDir("tesseract.js-core", join(tesseract, "package.json"))
const lang = packageDir("@tesseract.js-data/eng")

const assets = [
  [join(tesseract, "dist", "worker.min.js"), join(out, "worker.min.js")],
  // getCore.js picks between these three by what the browser supports.
  ...["", "-simd", "-relaxedsimd"].map((simd) => {
    const file = `tesseract-core${simd}-lstm.wasm.js`
    return [join(core, file), join(out, file)]
  }),
  // `4.0.0_best_int` is the model the LSTM engine wants, and a third the size
  // of the combined legacy one.
  [
    join(lang, "4.0.0_best_int", "eng.traineddata.gz"),
    join(out, "lang", "eng.traineddata.gz"),
  ],
]

/** Copies only when the destination is missing or a different size. */
async function sync(from, to) {
  const source = await stat(from)
  const target = await stat(to).catch(() => null)

  if (target?.size === source.size) return false

  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
  return true
}

try {
  const copied = await Promise.all(assets.map(([from, to]) => sync(from, to)))
  const count = copied.filter(Boolean).length

  console.log(
    count === 0
      ? `tesseract assets already in ${relative(root, out)}`
      : `tesseract assets: copied ${count} file(s) to ${relative(root, out)}`
  )
} catch (error) {
  console.error(
    `Could not copy the tesseract assets: ${error.message}\nRun "pnpm install" and try again.`
  )
  process.exit(1)
}
