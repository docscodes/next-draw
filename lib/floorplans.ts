import { getSupabase } from "@/lib/supabase"
import type { SupabaseClient } from "@supabase/supabase-js"

/** `FileObject` isn't re-exported by supabase-js, so derive it from `list`. */
type StorageFile = NonNullable<
  Awaited<
    ReturnType<ReturnType<SupabaseClient["storage"]["from"]>["list"]>
  >["data"]
>[number]

export const BUCKET = process.env.SUPABASE_FLOORPLANS_BUCKET ?? "floorplans"

/**
 * Per-file upload cap. Keep this in sync with `serverActions.bodySizeLimit`
 * in next.config.ts, which bounds the whole request.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** How long the links handed to the browser stay valid, in seconds. */
const SIGNED_URL_TTL = 60 * 60

/** Supabase caps `list` at 100 rows per call, so folders are paged through. */
const PAGE_SIZE = 100

/** Guards against pathological bucket layouts while still walking subfolders. */
const MAX_DEPTH = 5

export type Floorplan = {
  /** Full object path inside the bucket, e.g. `level-1/east-wing.pdf`. */
  path: string
  /** File name without its parent folders. */
  name: string
  /** Parent folder path, empty for files at the bucket root. */
  folder: string
  size: number | null
  updatedAt: string | null
  /** Time-limited link, null when signing the object failed. */
  url: string | null
}

export type FloorplansResult =
  { floorplans: Floorplan[]; error: null } | { floorplans: null; error: string }

/** Result of an import, rendered back into the page by `useActionState`. */
export type UploadState = {
  uploaded: string[]
  failed: { name: string; reason: string }[]
  /** Set when the import failed before any file was attempted. */
  error: string | null
}

export const emptyUploadState: UploadState = {
  uploaded: [],
  failed: [],
  error: null,
}

const isPdf = (file: StorageFile) =>
  file.metadata?.mimetype === "application/pdf" ||
  file.name.toLowerCase().endsWith(".pdf")

/**
 * Folder rows come back without an id, as does the placeholder object Supabase
 * writes when an empty folder is created.
 */
const isFolder = (file: StorageFile) => file.id === null

/** Lists one prefix and recurses into its subfolders, keeping full paths. */
async function listFolder(
  prefix: string,
  depth: number
): Promise<{ file: StorageFile; path: string }[]> {
  const supabase = getSupabase()
  const entries: StorageFile[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    })

    if (error) throw new Error(error.message)
    entries.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  const join = (name: string) => (prefix ? `${prefix}/${name}` : name)

  const files = entries
    .filter((entry) => !isFolder(entry))
    .map((file) => ({ file, path: join(file.name) }))

  if (depth >= MAX_DEPTH) return files

  const nested = await Promise.all(
    entries
      .filter(isFolder)
      .map((folder) => listFolder(join(folder.name), depth + 1))
  )

  return [...files, ...nested.flat()]
}

/** Builds the app URL for a floorplan detail page from its object path. */
export function floorplanHref(path: string) {
  return `/floorplans/${path.split("/").map(encodeURIComponent).join("/")}`
}

export type FloorplanResult =
  { floorplan: Floorplan; error: null } | { floorplan: null; error: string }

/**
 * Looks up a single object by its full path. Returns `notFound` as the error
 * when the bucket has no such PDF, so the caller can render a 404.
 */
export async function getFloorplan(path: string): Promise<FloorplanResult> {
  const slash = path.lastIndexOf("/")
  const folder = slash === -1 ? "" : path.slice(0, slash)
  const name = path.slice(slash + 1)

  if (!name) return { floorplan: null, error: "notFound" }

  const supabase = getSupabase()

  const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
    limit: PAGE_SIZE,
    // `search` is a partial match, so the exact name is picked out below.
    search: name,
  })

  if (error) return { floorplan: null, error: error.message }

  const file = data.find((entry) => entry.name === name && !isFolder(entry))
  if (!file || !isPdf(file)) return { floorplan: null, error: "notFound" }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL)

  return {
    floorplan: {
      path,
      name,
      folder,
      size: file.metadata?.size ?? null,
      updatedAt: file.updated_at ?? file.created_at,
      url: signed?.signedUrl ?? null,
    },
    error: null,
  }
}

/** Lists every PDF in the floorplans bucket, each with a signed URL. */
export async function listFloorplans(): Promise<FloorplansResult> {
  let files: { file: StorageFile; path: string }[]

  try {
    files = (await listFolder("", 0)).filter((entry) => isPdf(entry.file))
  } catch (error) {
    return {
      floorplans: null,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }

  if (files.length === 0) return { floorplans: [], error: null }

  const supabase = getSupabase()
  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      files.map((entry) => entry.path),
      SIGNED_URL_TTL
    )

  if (error) return { floorplans: null, error: error.message }

  const urls = new Map(signed.map((entry) => [entry.path, entry.signedUrl]))

  const floorplans = files.map(({ file, path }) => {
    const slash = path.lastIndexOf("/")

    return {
      path,
      name: path.slice(slash + 1),
      folder: slash === -1 ? "" : path.slice(0, slash),
      size: file.metadata?.size ?? null,
      updatedAt: file.updated_at ?? file.created_at,
      url: urls.get(path) ?? null,
    }
  })

  floorplans.sort((a, b) => a.path.localeCompare(b.path))

  return { floorplans, error: null }
}
