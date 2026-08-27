"use client"

import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react"
import { useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { emptyUploadState, type UploadState } from "@/lib/floorplans"
import { createUploadSlots, revalidateFloorplans } from "../actions"

/**
 * Turns a failed PUT to the storage endpoint into something worth showing.
 * Storage reports a name clash as HTTP 400 carrying `"statusCode": "409"`, so
 * the reason has to come out of the body rather than the status line.
 */
async function reasonForResponse(response: Response) {
  const body: unknown = await response.json().catch(() => null)
  const message =
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message
      : null

  if (message && /already exists|duplicate/i.test(message)) {
    return "A floorplan with that name already exists"
  }

  return message ?? `Upload failed (${response.status})`
}

/**
 * Sends one PDF straight to Supabase. The URL is already signed, so no key
 * travels with the request and the bytes never touch a server action — which
 * is what kept large imports under the host's request body limit.
 */
async function upload(file: File, url: string) {
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "content-type": "application/pdf",
        "cache-control": "max-age=3600",
        // The slot was signed with `upsert: false`; say so on the wire too.
        "x-upsert": "false",
      },
      body: file,
    })

    return response.ok ? null : await reasonForResponse(response)
  } catch (error) {
    return error instanceof Error ? error.message : "Upload failed"
  }
}

const ImportFloorplans = () => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>(emptyUploadState)
  const [pending, startTransition] = useTransition()

  const importFiles = (files: File[]) => {
    startTransition(async () => {
      // Destructured, the union stops narrowing `slots` off `error`.
      const prepared = await createUploadSlots(
        files.map(({ name, size, type }) => ({ name, size, type }))
      )

      if (prepared.error !== null) {
        setState({ ...emptyUploadState, error: prepared.error })
        return
      }

      // Slots come back in the order the files were offered, so two files
      // sharing a name still line up with their own slot.
      const results = await Promise.all(
        prepared.slots.map((slot, index) =>
          slot.url ? upload(files[index], slot.url) : slot.reason
        )
      )

      const uploaded: string[] = []
      const failed: UploadState["failed"] = []

      files.forEach((file, index) => {
        const reason = results[index]
        if (reason) failed.push({ name: file.name, reason })
        else uploaded.push(file.name)
      })

      setState({ uploaded, failed, error: null })
      if (uploaded.length > 0) await revalidateFloorplans()
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        // Importing straight from the picker keeps this to a single click.
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).filter(
            (file) => file.size > 0
          )
          // Lets the same file be picked again after a failed import.
          event.target.value = ""
          if (files.length) importFiles(files)
        }}
      />
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4" />
        )}
        {pending ? "Importing…" : "Import"}
      </Button>

      <div aria-live="polite" className="text-right text-xs">
        {state.error && (
          <p className="flex items-center gap-1.5 text-destructive">
            <XCircle className="size-3.5 shrink-0" />
            {state.error}
          </p>
        )}
        {state.uploaded.length > 0 && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0" />
            Imported {state.uploaded.length}{" "}
            {state.uploaded.length === 1 ? "file" : "files"}
          </p>
        )}
        {state.failed.map((failure) => (
          <p
            key={failure.name}
            className="flex items-center gap-1.5 text-destructive"
          >
            <XCircle className="size-3.5 shrink-0" />
            <span className="truncate">
              {failure.name}: {failure.reason}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

export default ImportFloorplans
