import type { ModelSpec } from "@/lib/models"

const KEY = "custom-models"

/** Turns `owner/Some-Model-7B` into a spec the picker can render. */
export function specFromRepo(id: string, bytes: number): ModelSpec {
  const [owner, ...rest] = id.split("/")
  const name = rest.join("/") || owner
  return {
    id,
    label: name,
    maker: rest.length ? owner : "Hugging Face",
    download: bytes > 0 ? `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB` : "unknown size",
    note: "Added from the Hugging Face Hub",
    custom: true,
  }
}

export function loadCustomModels(): ModelSpec[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    if (!Array.isArray(raw)) return []
    // Stored specs come from an older version of this code as much as from the
    // Hub, so keep only entries that still have what the UI needs.
    return raw.filter(
      (m): m is ModelSpec =>
        !!m && typeof m.id === "string" && typeof m.label === "string" && typeof m.download === "string",
    )
  } catch {
    return []
  }
}

export function saveCustomModels(models: ModelSpec[]): void {
  localStorage.setItem(KEY, JSON.stringify(models))
}
