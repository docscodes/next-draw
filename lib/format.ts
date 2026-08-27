const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
})

export function formatSize(bytes: number | null) {
  if (bytes === null) return "Unknown size"
  if (bytes < 1024) return `${bytes} B`

  const units = ["KB", "MB", "GB"]
  let size = bytes / 1024
  let unit = 0

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }

  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`
}

export function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date)
}
