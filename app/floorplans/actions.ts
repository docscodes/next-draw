"use server"

import { revalidatePath } from "next/cache"

import {
  ANNOTATIONS_TABLE,
  MAX_TEXT_LENGTH,
  isRegion,
  reasonForTable,
  toRow,
  type Region,
} from "@/lib/annotations"
import {
  BUCKET,
  MAX_UPLOAD_BYTES,
  type UploadSlot,
  type UploadSlots,
} from "@/lib/floorplans"
import { getSupabase } from "@/lib/supabase"

/**
 * Strips any directory part the browser may have sent and reduces the rest to
 * characters Supabase accepts in an object key.
 */
function toObjectName(fileName: string) {
  const base = fileName.split(/[/\\]/).pop() ?? ""
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "")

  if (!cleaned) return `floorplan-${Date.now()}.pdf`

  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`
}

/** What the browser tells us about one file it wants to import. */
type Candidate = { name: string; size: number; type: string }

function isPdf(file: Candidate) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  )
}

/** Turns a Supabase storage error into something worth showing a user. */
function reasonFor(message: string) {
  if (/already exists|duplicate/i.test(message)) {
    return "A floorplan with that name already exists"
  }
  return message
}

/** Guards against a client asking for an unbounded number of signatures. */
const MAX_FILES_PER_IMPORT = 50

/**
 * Hands the browser one pre-authorised URL per PDF, so the bytes go straight
 * to the floorplans bucket. Sending the files through this action instead
 * would cap an import at the host's request body limit — 4.5 MB on Vercel, no
 * matter what `serverActions.bodySizeLimit` says.
 *
 * Returns one slot per file, in the order they were offered. Existing files
 * are never overwritten: the signed URL is minted with `upsert: false`, so a
 * name clash is rejected when the browser uploads.
 */
export async function createUploadSlots(
  files: Candidate[]
): Promise<UploadSlots> {
  if (files.length === 0) {
    return { slots: null, error: "Select at least one PDF to import." }
  }

  if (files.length > MAX_FILES_PER_IMPORT) {
    return {
      slots: null,
      error: `Import at most ${MAX_FILES_PER_IMPORT} files at a time.`,
    }
  }

  let supabase: ReturnType<typeof getSupabase>
  try {
    supabase = getSupabase()
  } catch (error) {
    return {
      slots: null,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }

  const slots = await Promise.all(
    files.map(async (file): Promise<UploadSlot> => {
      if (!isPdf(file)) return { reason: "Not a PDF" }

      if (file.size > MAX_UPLOAD_BYTES) {
        const limit = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)
        return { reason: `Larger than ${limit} MB` }
      }

      try {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(toObjectName(file.name), { upsert: false })

        return error
          ? { reason: reasonFor(error.message) }
          : { url: data.signedUrl }
      } catch (error) {
        // Network-level failures reject instead of returning an error.
        return {
          reason: error instanceof Error ? error.message : "Upload failed",
        }
      }
    })
  )

  return { slots, error: null }
}

/**
 * Refreshes the list once the browser has finished uploading. Separate from
 * `createUploadSlots` because the objects do not exist until then.
 */
export async function revalidateFloorplans() {
  revalidatePath("/floorplans")
}

/** Outcome of a write, with `error` set when the change did not stick. */
export type SaveState = { error: string | null }

const ok: SaveState = { error: null }

/** Adds one drawn rectangle to a floorplan. */
export async function saveRegion(
  objectPath: string,
  page: number,
  region: Region
): Promise<SaveState> {
  if (!objectPath) return { error: "Missing floorplan" }
  if (!Number.isInteger(page) || page < 1) return { error: "Invalid page" }
  if (!isRegion(region)) return { error: "Invalid region" }

  try {
    const { error } = await getSupabase()
      .from(ANNOTATIONS_TABLE)
      // Re-saving the same id is a no-op, so a retried write cannot duplicate.
      .upsert(toRow(objectPath, page, region))

    return error ? { error: reasonForTable(error.message, error.code) } : ok
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save" }
  }
}

/**
 * Stores what OCR read out of one capture rectangle. Scoped to the floorplan
 * and to `capture`, so a stray id cannot write text onto an ignored area.
 */
export async function saveRegionText(
  objectPath: string,
  id: string,
  text: string,
  confidence: number
): Promise<SaveState> {
  if (!objectPath) return { error: "Missing floorplan" }
  if (!id) return { error: "Missing region" }

  try {
    const { error } = await getSupabase()
      .from(ANNOTATIONS_TABLE)
      .update({
        text: text.slice(0, MAX_TEXT_LENGTH),
        confidence: Number.isFinite(confidence)
          ? Math.min(Math.max(confidence, 0), 100)
          : null,
        read_at: new Date().toISOString(),
      })
      .eq("object_path", objectPath)
      .eq("id", id)
      .eq("kind", "capture")

    return error ? { error: reasonForTable(error.message, error.code) } : ok
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save" }
  }
}

/** Removes drawn rectangles by id, scoped to the floorplan they belong to. */
export async function deleteRegions(
  objectPath: string,
  ids: string[]
): Promise<SaveState> {
  if (!objectPath) return { error: "Missing floorplan" }
  if (ids.length === 0) return ok

  try {
    const { error } = await getSupabase()
      .from(ANNOTATIONS_TABLE)
      .delete()
      .eq("object_path", objectPath)
      .in("id", ids)

    return error ? { error: reasonForTable(error.message, error.code) } : ok
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not remove",
    }
  }
}
