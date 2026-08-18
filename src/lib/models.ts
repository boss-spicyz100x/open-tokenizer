export type ModelSpec = {
  id: string
  label: string
  maker: string
  /** Approximate tokenizer.json download size, shown before the first load. */
  download: string
  note: string
}

/**
 * Every entry must be an ungated repo that serves `tokenizer.json` without an
 * auth token — transformers.js fetches it straight from the HF CDN at runtime.
 * Gated repos (Llama) 401 in the browser, so they are deliberately absent.
 */
export const MODELS: ModelSpec[] = [
  {
    id: "google/gemma-4-26B-A4B-it",
    label: "Gemma 4 26B-A4B-it",
    maker: "Google",
    download: "31 MB",
    note: "262k vocab, shared across the Gemma 4 family",
  },
  {
    id: "google/gemma-4-31B-it",
    label: "Gemma 4 31B-it",
    maker: "Google",
    download: "31 MB",
    note: "262k vocab — identical tokenizer to the 26B-A4B model",
  },
  {
    id: "scb10x/typhoon2.1-gemma3-12b",
    label: "Typhoon 2.1 Gemma3 12B",
    maker: "SCB 10X",
    download: "32 MB",
    note: "Thai-tuned Gemma 3 — useful as a Thai baseline",
  },
  {
    id: "Qwen/Qwen3.8-27B",
    label: "Qwen3.8 27B",
    maker: "Alibaba",
    download: "12 MB",
    note: "248k vocab — much stronger on Thai than Qwen3's 151k vocab",
  },
  {
    id: "Qwen/Qwen3-8B",
    label: "Qwen3 8B",
    maker: "Alibaba",
    download: "11 MB",
    note: "151k byte-level BPE vocab",
  },
  {
    id: "deepseek-ai/DeepSeek-V3.2",
    label: "DeepSeek V3.2",
    maker: "DeepSeek",
    download: "7 MB",
    note: "129k byte-level BPE vocab",
  },
  {
    id: "openai-community/gpt2",
    label: "GPT-2",
    maker: "OpenAI",
    download: "1 MB",
    note: "50k vocab — loads instantly, poor on non-Latin scripts",
  },
]

export const DEFAULT_MODEL = MODELS[0].id
