"use client"

import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react"
import { useActionState, useRef } from "react"

import { Button } from "@/components/ui/button"
import { emptyUploadState } from "@/lib/floorplans"
import { uploadFloorplans } from "../actions"

const ImportFloorplans = () => {
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, formAction, pending] = useActionState(
    uploadFloorplans,
    emptyUploadState
  )

  return (
    <div className="flex flex-col items-end gap-2">
      <form ref={formRef} action={formAction}>
        <input
          ref={inputRef}
          type="file"
          name="files"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          // Submitting straight from the picker keeps this to a single click.
          onChange={(event) => {
            if (event.target.files?.length) formRef.current?.requestSubmit()
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
      </form>

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
