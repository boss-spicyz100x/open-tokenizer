export type ModelSpec = {
  id: string
  /** Approximate tokenizer.json download size, shown before the first load. */
  download: string
  /**
   * Repo whose tokenizer files this model uses, when they are not its own.
   * The Gemma 4 family ships byte-identical tokenizer.json and
   * tokenizer_config.json across sizes, so they share one 31 MB download.
   */
  tokenizer?: string
  /** Added by the user from the Hub, rather than shipped in this list. */
  custom?: boolean
  /** Content digest of tokenizer.json, used to spot identical tokenizers. */
  digest?: string
}

/**
 * Every entry must be an ungated repo that serves `tokenizer.json` without an
 * auth token — transformers.js fetches it straight from the HF CDN at runtime.
 * Gated repos (Llama) 401 in the browser, so they are deliberately absent.
 */
export const MODELS: ModelSpec[] = [
  {
    id: "google/gemma-4-26B-A4B-it",
    download: "31 MB",
  },
  {
    id: "google/gemma-4-31B-it",
    download: "31 MB",
    tokenizer: "google/gemma-4-26B-A4B-it",
  },
  {
    id: "Qwen/Qwen3.8-27B",
    download: "12 MB",
  },
]

export const DEFAULT_MODEL = MODELS[0].id

/**
 * Display name: the repo name exactly as Hugging Face spells it. Derived rather
 * than stored so a curated model and one added from the Hub read identically —
 * storing a prettified label made the same model look like two different things
 * depending on how it got into the list.
 */
export function modelName(id: string): string {
  const slash = id.lastIndexOf("/")
  return slash === -1 ? id : id.slice(slash + 1)
}

/** Repo owner, or an empty string for a bare id. */
export function modelOwner(id: string): string {
  const slash = id.lastIndexOf("/")
  return slash === -1 ? "" : id.slice(0, slash)
}

/**
 * The repo a model's tokenizer files actually come from.
 *
 * Takes the list to search because models added from the Hub carry aliases too,
 * and looking only at the curated list would silently ignore them — the model
 * would re-download a tokenizer it already has.
 */
export function tokenizerRepo(modelId: string, models: ModelSpec[] = MODELS): string {
  return models.find((m) => m.id === modelId)?.tokenizer ?? modelId
}

/** Distinct downloads, which is fewer than the number of models. */
export function tokenizerRepos(models: ModelSpec[] = MODELS): string[] {
  return [...new Set(models.map((m) => tokenizerRepo(m.id, models)))]
}

/** Other models served by the same download — they share its cache entry. */
export function modelsSharing(modelId: string, models: ModelSpec[] = MODELS): ModelSpec[] {
  const repo = tokenizerRepo(modelId, models)
  return models.filter((m) => m.id !== modelId && tokenizerRepo(m.id, models) === repo)
}
