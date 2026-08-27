"use server"

import { revalidatePath } from "next/cache"

import {
  ANNOTATIONS_TABLE,
  isRegion,
  reasonForTable,
  toRow,
  type Region,
} from "@/lib/annotations"
import {
  BUCKET,
  MAX_UPLOAD_BYTES,
  emptyUploadState,
  type UploadState,
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

function isPdf(file: File) {
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

/**
 * Imports one or more PDFs into the floorplans bucket. Existing files are never
 * overwritten — a name clash is reported back so the user can rename first.
 */
export async function uploadFloorplans(
  _prevState: UploadState,
  formData: FormData
): Promise<UploadState> {
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)

  if (files.length === 0) {
    return { ...emptyUploadState, error: "Select at least one PDF to import." }
  }

  const uploaded: string[] = []
  const failed: UploadState["failed"] = []

  let supabase: ReturnType<typeof getSupabase>
  try {
    supabase = getSupabase()
  } catch (error) {
    return {
      ...emptyUploadState,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }

  const results = await Promise.all(
    files.map(async (file) => {
      if (!isPdf(file)) {
        return { name: file.name, reason: "Not a PDF" }
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        const limit = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)
        return { name: file.name, reason: `Larger than ${limit} MB` }
      }

      try {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(toObjectName(file.name), file, {
            contentType: "application/pdf",
            upsert: false,
          })

        return error
          ? { name: file.name, reason: reasonFor(error.message) }
          : null
      } catch (error) {
        // Network-level failures reject instead of returning an error.
        return {
          name: file.name,
          reason: error instanceof Error ? error.message : "Upload failed",
        }
      }
    })
  )

  files.forEach((file, index) => {
    const failure = results[index]
    if (failure) failed.push(failure)
    else uploaded.push(file.name)
  })

  if (uploaded.length > 0) revalidatePath("/floorplans")

  return { uploaded, failed, error: null }
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
