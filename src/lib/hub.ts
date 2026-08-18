/**
 * Minimal Hugging Face Hub client. The Hub serves permissive CORS headers on
 * both the JSON API and file requests, so search and validation run entirely in
 * the browser with no proxy.
 */

const API = "https://huggingface.co/api"

export type HubResult = { id: string; downloads: number; likes: number }

export async function searchModels(query: string, signal?: AbortSignal): Promise<HubResult[]> {
  const url = `${API}/models?search=${encodeURIComponent(query)}&sort=downloads&direction=-1&limit=20`
  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const raw: unknown = await res.json()
  if (!Array.isArray(raw)) return []
  return raw.map((m) => {
    const r = m as { id?: string; downloads?: number; likes?: number }
    return { id: r.id ?? "", downloads: r.downloads ?? 0, likes: r.likes ?? 0 }
  })
}

export type Inspection =
  | { ok: true; bytes: number }
  | { ok: false; reason: "gated" | "no-tokenizer" | "not-found" }

/**
 * A repo is usable only if it is ungated and ships `tokenizer.json`. Gated repos
 * answer 401 in the browser, and so do private and non-existent ones, so the
 * status code alone cannot tell them apart — the JSON API can.
 */
export async function inspectModel(id: string, signal?: AbortSignal): Promise<Inspection> {
  let info: unknown
  try {
    const res = await fetch(`${API}/models/${id}`, { signal })
    if (!res.ok) return { ok: false, reason: "not-found" }
    info = await res.json()
  } catch {
    return { ok: false, reason: "not-found" }
  }

  const d = info as {
    gated?: boolean | string
    siblings?: { rfilename?: string }[]
    error?: string
  }
  if (d.error) return { ok: false, reason: "not-found" }
  // `gated` is false when open, or "auto"/"manual" when it needs an access grant.
  if (d.gated) return { ok: false, reason: "gated" }
  const files = (d.siblings ?? []).map((s) => s.rfilename)
  if (!files.includes("tokenizer.json")) return { ok: false, reason: "no-tokenizer" }

  return { ok: true, bytes: await tokenizerBytes(id, signal) }
}

/**
 * Real download size, so the UI never has to guess before fetching.
 *
 * Read from the tree API rather than a HEAD on the file: small tokenizers are
 * stored inline rather than in LFS, and those responses carry neither
 * `x-linked-size` nor a CORS-readable `content-length` once the request has
 * followed its redirect. The tree endpoint reports both kinds.
 */
async function tokenizerBytes(id: string, signal?: AbortSignal): Promise<number> {
  try {
    const res = await fetch(`${API}/models/${id}/tree/main`, { signal })
    if (!res.ok) return 0
    const tree: unknown = await res.json()
    if (!Array.isArray(tree)) return 0
    const entry = (tree as { path?: string; size?: number }[]).find(
      (f) => f.path === "tokenizer.json",
    )
    return typeof entry?.size === "number" && entry.size > 0 ? entry.size : 0
  } catch {
    return 0
  }
}

export function describeFailure(reason: Exclude<Inspection, { ok: true }>["reason"]): string {
  switch (reason) {
    case "gated":
      return "This model is gated. Access has to be granted on Hugging Face, and the browser cannot authenticate, so its tokenizer can't be loaded here."
    case "no-tokenizer":
      return "This repo has no tokenizer.json. Only fast (JSON) tokenizers work in the browser."
    case "not-found":
      return "No such public model on Hugging Face — check the id, which looks like owner/name."
  }
}
