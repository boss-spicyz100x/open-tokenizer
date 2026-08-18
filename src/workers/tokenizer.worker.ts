/// <reference lib="webworker" />
import { AutoTokenizer, env, type PreTrainedTokenizer } from "@huggingface/transformers"

// Tokenizers are fetched from the HF CDN and cached by the browser's Cache API.
// Downloads are never started implicitly — the UI asks for them explicitly.
env.allowLocalModels = false
env.useBrowserCache = true

/**
 * transformers.js opens `caches.open(env.cacheKey)` and keys entries by their
 * full remote URL (`https://huggingface.co/{model}/resolve/main/{file}`), so
 * cached files for one model can be found by matching that prefix.
 */
const CACHE_NAME = env.cacheKey
const modelPrefix = (modelId: string) => `${env.remoteHost}${modelId}/resolve/`

export type CacheEntry = { cached: boolean; bytes: number; files: number }
export type CacheReport = Record<string, CacheEntry>

export type WorkerRequest =
  | { type: "status"; modelIds: string[] }
  | { type: "load"; modelId: string }
  | { type: "remove"; modelId: string; modelIds: string[] }
  | { type: "removeAll"; modelIds: string[] }
  | { type: "encode"; modelId: string; text: string; requestId: number }

export type WorkerResponse =
  | { type: "status"; report: CacheReport }
  | { type: "removed"; modelIds: string[]; report: CacheReport }
  | { type: "progress"; modelId: string; file?: string; progress?: number }
  | { type: "ready"; modelId: string; vocabSize: number; tokenizerClass: string }
  | { type: "error"; modelId: string; requestId?: number; message: string }
  | {
      type: "result"
      modelId: string
      requestId: number
      ids: number[]
      raw: string[]
      decoded: string[]
    }

const ctx = self as unknown as DedicatedWorkerGlobalScope
const post = (msg: WorkerResponse) => ctx.postMessage(msg)

const loaded = new Map<string, Promise<PreTrainedTokenizer>>()

async function openCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null
  try {
    return await caches.open(CACHE_NAME)
  } catch {
    // Cache API can be present but blocked (e.g. inside a sandboxed iframe).
    return null
  }
}

/** Measures what is actually on disk rather than trusting a hardcoded estimate. */
async function report(modelIds: string[]): Promise<CacheReport> {
  const out: CacheReport = Object.fromEntries(
    modelIds.map((id) => [id, { cached: false, bytes: 0, files: 0 }]),
  )
  const cache = await openCache()
  if (!cache) return out

  const keys = await cache.keys()
  for (const modelId of modelIds) {
    const prefix = modelPrefix(modelId)
    const matching = keys.filter((req) => req.url.startsWith(prefix))
    if (matching.length === 0) continue

    let bytes = 0
    for (const req of matching) {
      const res = await cache.match(req)
      if (!res) continue
      // Content-Length avoids buffering the whole 30 MB body just to size it.
      const declared = Number(res.headers.get("content-length"))
      bytes += Number.isFinite(declared) && declared > 0
        ? declared
        : (await res.clone().blob()).size
    }
    out[modelId] = { cached: true, bytes, files: matching.length }
  }
  return out
}

async function purge(modelIds: string[]): Promise<void> {
  const cache = await openCache()
  if (!cache) return
  const keys = await cache.keys()
  const prefixes = modelIds.map(modelPrefix)
  await Promise.all(
    keys.filter((req) => prefixes.some((p) => req.url.startsWith(p))).map((req) => cache.delete(req)),
  )
}

function load(modelId: string): Promise<PreTrainedTokenizer> {
  let pending = loaded.get(modelId)
  if (!pending) {
    pending = AutoTokenizer.from_pretrained(modelId, {
      progress_callback: (p: unknown) => {
        const e = p as { file?: string; progress?: number }
        post({ type: "progress", modelId, file: e.file, progress: e.progress })
      },
    }).catch((err) => {
      loaded.delete(modelId)
      throw err
    })
    loaded.set(modelId, pending)
  }
  return pending
}

/**
 * `constructor.name` is mangled by the production minifier ("To"), so prefer the
 * `tokenizer_class` recorded in tokenizer_config.json. Not every repo sets it
 * (GPT-2 does not), so fall back to the constructor name only when it still
 * looks like a real class, and otherwise report nothing.
 */
function tokenizerClass(tok: PreTrainedTokenizer): string {
  const config = (tok as unknown as { _tokenizerConfig?: { tokenizer_class?: string } })
    ._tokenizerConfig
  const declared = config?.tokenizer_class
  if (declared) return declared
  const ctor = tok.constructor.name
  return ctor.endsWith("Tokenizer") ? ctor : ""
}

/**
 * `get_vocab()` returns an empty object in transformers.js v3 for these
 * tokenizers, so read the size off the parsed tokenizer.json instead.
 */
function vocabSize(tok: PreTrainedTokenizer): number {
  const json = (tok as unknown as { _tokenizerJSON?: { model?: { vocab?: unknown } } })._tokenizerJSON
  const vocab = json?.model?.vocab
  if (Array.isArray(vocab)) return vocab.length
  if (vocab && typeof vocab === "object") return Object.keys(vocab).length
  return Object.keys(tok.get_vocab() ?? {}).length
}

ctx.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data

  try {
    switch (msg.type) {
      case "status":
        post({ type: "status", report: await report(msg.modelIds) })
        return

      case "remove":
      case "removeAll": {
        const targets = msg.type === "remove" ? [msg.modelId] : msg.modelIds
        // Evict the in-memory copy too, or it would keep tokenizing after the
        // files are gone and the "removed" state would be a lie.
        for (const id of targets) loaded.delete(id)
        await purge(targets)
        // A dedicated message, not a plain status update: the UI must reset the
        // affected model to "not downloaded" in the same commit that clears its
        // cached flag. Inferring it from the report instead races the
        // load-if-cached effect, which would immediately re-download the files.
        post({ type: "removed", modelIds: targets, report: await report(msg.modelIds) })
        return
      }

      case "load": {
        const tok = await load(msg.modelId)
        post({
          type: "ready",
          modelId: msg.modelId,
          vocabSize: vocabSize(tok),
          tokenizerClass: tokenizerClass(tok),
        })
        return
      }

      case "encode": {
        const tok = await load(msg.modelId)
        const ids: number[] = tok.encode(msg.text, { add_special_tokens: false })
        const raw: string[] = tok.tokenize(msg.text, { add_special_tokens: false })
        // Per-token decode is the only display form that survives byte-level BPE:
        // raw tokens come back as mojibake ("à¸¢") for anything non-Latin.
        const decoded = ids.map((id) => tok.decode([id]))
        post({ type: "result", modelId: msg.modelId, requestId: msg.requestId, ids, raw, decoded })
        return
      }
    }
  } catch (err) {
    post({
      type: "error",
      modelId: "modelId" in msg ? msg.modelId : "",
      requestId: msg.type === "encode" ? msg.requestId : undefined,
      message: err instanceof Error ? err.message : String(err),
    })
  }
})
