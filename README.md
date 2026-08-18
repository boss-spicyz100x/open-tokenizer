# Tokenizer

Paste text, see exactly how a model's tokenizer splits it and what it costs.
Everything runs in the browser — the text you type is never sent anywhere.

Live at **https://tokenizer-6f6.pages.dev**

Built for comparing tokenizer efficiency on Thai, where the gap between
vocabularies is large: the same 131-character sentence costs 28 tokens on
Qwen3.8, 35 on Gemma 4, and 259 on GPT-2.

## Running it

```bash
bun install
bun run dev        # http://localhost:7788 — also bound to the LAN
```

`vite.config.ts` sets `server.host = true`, so the dev server is reachable from
other devices on the network at `http://<your-lan-ip>:7788`. `bun run build`
then `bun run preview` serves the production build on port 7789 the same way.

## Deploying

```bash
bun run deploy     # builds, then wrangler pages deploy dist
```

Cloudflare Pages, project `tokenizer`. Auth comes from the
`CLOUDFLARE_API_TOKEN` environment variable. The whole site is static — no Pages
Functions, no server side — because tokenization happens in the visitor's
browser.

Two runtime dependencies leave the origin: `huggingface.co` for tokenizer files
and `fonts.googleapis.com` for Google Sans. Both serve permissive CORS headers,
so they work unchanged from the deployed HTTPS origin. Nothing the user types is
transmitted.

## Models

Every entry in `src/lib/models.ts` must be an **ungated** HF repo that serves
`tokenizer.json` without an auth token — transformers.js fetches it straight
from the CDN at runtime. Gated repos (Llama) return 401 in the browser, which
is why they are absent.

| Model | Vocab |
| --- | --- |
| `google/gemma-4-26B-A4B-it` | 262,144 |
| `google/gemma-4-31B-it` | 262,144 (identical tokenizer) |
| `scb10x/typhoon2.1-gemma3-12b` | Thai-tuned Gemma 3 |
| `Qwen/Qwen3.8-27B` | 248,044 |
| `Qwen/Qwen3-8B` | 151,643 |
| `deepseek-ai/DeepSeek-V3.2` | 128,000 |
| `openai-community/gpt2` | 50,257 |

Tokenizer files are 1–32 MB and are cached by the browser after the first load.

## How it works

`src/workers/tokenizer.worker.ts` runs `AutoTokenizer` off the main thread so
parsing a 32 MB `tokenizer.json` doesn't freeze the UI. It keeps every loaded
tokenizer in memory, so switching back to a previous model is instant.

Three details worth knowing before changing that file:

- **Display text comes from `decode([id])`, not `tokenize()`.** Byte-level BPE
  vocabularies (Qwen, DeepSeek, GPT-2) return raw entries as mojibake — Thai
  comes back as `à¸¢à¸´à¸Ļ`. Per-token decode renders correctly and reassembles
  into the original string.
- **Tokens that decode to `�` are real, not a bug.** They mean the vocabulary
  split a character mid-UTF-8. GPT-2 does this to every Thai character. Those
  tokens fall back to showing the raw vocab entry and are counted separately in
  the footer.
- **The tokenizer class name comes from `tokenizer_config.json`, not
  `constructor.name`.** The production minifier rewrites class names, so
  `constructor.name` renders as `To` in a deployed build. Repos that omit
  `tokenizer_class` (GPT-2) simply hide the badge.

`get_vocab()` returns an empty object in transformers.js v3, so vocab size is
read off the parsed `tokenizer.json` instead.

## The ONNX stub

transformers.js statically imports `onnxruntime-web/webgpu`, which pulls a
23 MB WASM binary into the bundle. This app only calls `AutoTokenizer` — pure
JS, no inference session — so `vite.config.ts` aliases that import to
`src/lib/onnx-stub.ts`. Dropping it takes the build from 24 MB to under 1 MB,
which also keeps it under Cloudflare Pages' 25 MB per-file limit.

The stub implements only what the backend touches at import time (`Tensor`,
`InferenceSession`, `env.wasm` / `env.webgpu` / `env.versions`). If a
transformers.js upgrade starts reaching for something else at module scope,
that is the first place to look.

## Stack

Vite 8, React 19, Tailwind 4, shadcn/ui (Base UI), transformers.js 4,
Google Sans / Google Sans Code.
