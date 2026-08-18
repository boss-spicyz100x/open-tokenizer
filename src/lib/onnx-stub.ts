/**
 * transformers.js statically imports `onnxruntime-web/webgpu`, which drags a
 * ~23 MB WASM binary into the bundle. This app only ever calls `AutoTokenizer`,
 * which is pure JS — no inference session is ever created — so the runtime is
 * aliased to this stub in vite.config.ts.
 *
 * Only the surface touched at import time by
 * `@huggingface/transformers/src/backends/onnx.js` needs to exist:
 *   - `Tensor`        — used by an `instanceof` check
 *   - `InferenceSession` — read into a module-scope const, only called for models
 *   - `env.wasm` / `env.webgpu` / `env.versions` — mutated during backend setup
 *
 * `versions` is left empty on purpose: that makes transformers.js skip the
 * branch that computes CDN `wasmPaths`.
 */
export class Tensor {}

export const InferenceSession = {
  create() {
    throw new Error(
      "onnxruntime-web is stubbed out in this build: it only tokenizes, it cannot run models.",
    )
  },
}

export const env = {
  wasm: {} as Record<string, unknown>,
  webgpu: {} as Record<string, unknown>,
  versions: {} as Record<string, string>,
}
