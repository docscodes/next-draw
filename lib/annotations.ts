import { getSupabase } from "@/lib/supabase"

/**
 * Table holding the rectangles drawn over a floorplan. Created by
 * `supabase/migrations/0001_floorplan_annotations.sql`.
 */
export const ANNOTATIONS_TABLE =
  process.env.SUPABASE_ANNOTATIONS_TABLE ?? "floorplan_annotations"

/** What a drawn rectangle is for. */
export type RegionKind = "ignore" | "capture"

/**
 * A rectangle over part of a page: either content the reader should skip —
 * title blocks, legends, revision tables — or text that should be pulled out
 * of the plan. Stored as fractions of the page so it survives resizing.
 */
export type Region = {
  id: string
  kind: RegionKind
  x: number
  y: number
  w: number
  h: number
}

/** A plan's regions, grouped by 1-based page number. */
export type PageRegions = Record<number, Region[]>

/** Shape of a row as it is stored. */
type AnnotationRow = {
  id: string
  object_path: string
  page: number
  kind: RegionKind
  x: number
  y: number
  w: number
  h: number
}

const KINDS: RegionKind[] = ["ignore", "capture"]

const isFraction = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1

/**
 * Rejects anything that would not draw as a rectangle on the page. Regions come
 * from the browser, so they are checked again before they reach the table.
 */
export function isRegion(value: unknown): value is Region {
  if (!value || typeof value !== "object") return false
  const region = value as Region

  return (
    typeof region.id === "string" &&
    region.id.length > 0 &&
    region.id.length <= 64 &&
    KINDS.includes(region.kind) &&
    isFraction(region.x) &&
    isFraction(region.y) &&
    isFraction(region.w) &&
    isFraction(region.h) &&
    region.w > 0 &&
    region.h > 0
  )
}

/** Turns a Postgres failure into something worth showing a user. */
export function reasonForTable(message: string, code?: string) {
  // 42P01 is Postgres; PGRST205 is PostgREST failing to find it in its cache.
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist|could not find the table/i.test(message)
  ) {
    return `Table "${ANNOTATIONS_TABLE}" is missing. Run supabase/migrations/0001_floorplan_annotations.sql in your Supabase project.`
  }
  if (code === "42501" || /row-level security/i.test(message)) {
    return `Not allowed to write "${ANNOTATIONS_TABLE}". Use a service role key, or add the policy at the end of the migration.`
  }
  return message
}

export const toRow = (
  objectPath: string,
  page: number,
  region: Region
): AnnotationRow => ({
  id: region.id,
  object_path: objectPath,
  page,
  kind: region.kind,
  x: region.x,
  y: region.y,
  w: region.w,
  h: region.h,
})

export type AnnotationsResult = { regions: PageRegions; error: string | null }

/**
 * Loads every saved region for one floorplan, grouped by page. A failure comes
 * back with empty regions so the plan still opens — marking just starts blank.
 */
export async function getAnnotations(
  objectPath: string
): Promise<AnnotationsResult> {
  let rows: AnnotationRow[]

  try {
    const { data, error } = await getSupabase()
      .from(ANNOTATIONS_TABLE)
      .select("id, object_path, page, kind, x, y, w, h")
      .eq("object_path", objectPath)
      .order("created_at", { ascending: true })

    if (error) {
      return { regions: {}, error: reasonForTable(error.message, error.code) }
    }

    rows = data as AnnotationRow[]
  } catch (error) {
    return {
      regions: {},
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }

  const regions: PageRegions = {}

  for (const row of rows) {
    const region = {
      id: row.id,
      kind: row.kind,
      x: row.x,
      y: row.y,
      w: row.w,
      h: row.h,
    }
    if (!isRegion(region)) continue
    ;(regions[row.page] ??= []).push(region)
  }

  return { regions, error: null }
}
