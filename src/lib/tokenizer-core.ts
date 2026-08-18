import type { PreTrainedTokenizer } from "@huggingface/transformers"

export type Encoded = { ids: number[]; raw: string[]; decoded: string[] }

/**
 * Shared by the worker and the integration tests, so the tests pin the same
 * code path the app runs rather than a re-implementation of it.
 */
export function encodeText(tok: PreTrainedTokenizer, text: string): Encoded {
  const ids: number[] = tok.encode(text, { add_special_tokens: false })
  const raw: string[] = tok.tokenize(text, { add_special_tokens: false })
  // Per-token decode is the only display form that survives byte-level BPE:
  // raw tokens come back as mojibake ("à¸¢") for anything non-Latin.
  const decoded = ids.map((id) => tok.decode([id]))
  return { ids, raw, decoded }
}

/**
 * `constructor.name` is mangled by the production minifier ("To"), so prefer the
 * `tokenizer_class` recorded in tokenizer_config.json. Not every repo sets it
 * (GPT-2 does not), so fall back to the constructor name only when it still
 * looks like a real class, and otherwise report nothing.
 */
export function tokenizerClass(tok: PreTrainedTokenizer): string {
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
export function vocabSize(tok: PreTrainedTokenizer): number {
  const json = (tok as unknown as { _tokenizerJSON?: { model?: { vocab?: unknown } } })._tokenizerJSON
  const vocab = json?.model?.vocab
  if (Array.isArray(vocab)) return vocab.length
  if (vocab && typeof vocab === "object") return Object.keys(vocab).length
  return Object.keys(tok.get_vocab() ?? {}).length
}

export type StopToken = { token: string; id: number }

/**
 * The stop token a completion ends on. Models may declare several — Gemma 4
 * lists `<eos>`, `<turn|>` and `<tool_response|>` — and the server does not
 * report which one fired. It does not matter for counting: every stop token is
 * a single token, so an API's `completion_tokens` is always content + 1. This
 * returns the declared eos purely so the UI can name something concrete.
 */
export function stopToken(tok: PreTrainedTokenizer): StopToken | null {
  const t = tok as unknown as { eos_token?: string | null; eos_token_id?: number | null }
  return t.eos_token && typeof t.eos_token_id === "number"
    ? { token: t.eos_token, id: t.eos_token_id }
    : null
}
