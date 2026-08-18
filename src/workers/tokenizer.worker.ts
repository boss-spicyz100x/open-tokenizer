/// <reference lib="webworker" />
import { AutoTokenizer, env, type PreTrainedTokenizer } from "@huggingface/transformers"

// Tokenizers are fetched from the HF CDN and cached by the browser's Cache API,
// so only the first load of a given model pays the download cost.
env.allowLocalModels = false
env.useBrowserCache = true

export type LoadRequest = { type: "load"; modelId: string }
export type EncodeRequest = {
  type: "encode"
  modelId: string
  text: string
  requestId: number
}
export type WorkerRequest = LoadRequest | EncodeRequest

export type WorkerResponse =
  | { type: "progress"; modelId: string; file?: string; progress?: number; status?: string }
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

const cache = new Map<string, Promise<PreTrainedTokenizer>>()

function load(modelId: string): Promise<PreTrainedTokenizer> {
  let pending = cache.get(modelId)
  if (!pending) {
    pending = AutoTokenizer.from_pretrained(modelId, {
      progress_callback: (p: unknown) => {
        const e = p as { file?: string; progress?: number; status?: string }
        post({
          type: "progress",
          modelId,
          file: e.file,
          progress: e.progress,
          status: e.status,
        })
      },
    }).catch((err) => {
      // Drop the rejected promise so a retry is possible.
      cache.delete(modelId)
      throw err
    })
    cache.set(modelId, pending)
  }
  return pending
}

/**
 * `get_vocab()` returns an empty object in transformers.js v3 for these
 * tokenizers, so read the size off the parsed tokenizer.json instead.
 */
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
    const tok = await load(msg.modelId)

    if (msg.type === "load") {
      post({
        type: "ready",
        modelId: msg.modelId,
        vocabSize: vocabSize(tok),
        tokenizerClass: tokenizerClass(tok),
      })
      return
    }

    const ids: number[] = tok.encode(msg.text, { add_special_tokens: false })
    const raw: string[] = tok.tokenize(msg.text, { add_special_tokens: false })
    // Per-token decode is the only display form that survives byte-level BPE:
    // raw tokens come back as mojibake ("à¸¢") for anything non-Latin.
    const decoded = ids.map((id) => tok.decode([id]))

    post({
      type: "result",
      modelId: msg.modelId,
      requestId: msg.requestId,
      ids,
      raw,
      decoded,
    })
  } catch (err) {
    post({
      type: "error",
      modelId: msg.modelId,
      requestId: msg.type === "encode" ? msg.requestId : undefined,
      message: err instanceof Error ? err.message : String(err),
    })
  }
})
