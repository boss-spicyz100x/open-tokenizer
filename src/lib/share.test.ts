import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { ModelSpec } from "./models"

// bun has no localStorage and no DOM; share.ts needs both a store and fetch.
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}

const { repairAliases } = await import("./share")

/** tokenizer.json digest per repo, served through a stubbed tree API. */
const DIGESTS: Record<string, string> = {
  "google/gemma-4-26B-A4B-it": "sha256:aaa",
  "google/gemma-4-31B-it": "sha256:aaa",
  "google/gemma-4-12B-it": "sha256:aaa",
  "Qwen/Qwen3.8-27B": "sha256:bbb",
  "some/orphan": "sha256:ccc",
}

const realFetch = globalThis.fetch
let calls = 0

beforeEach(() => {
  store.clear()
  calls = 0
  globalThis.fetch = (async (url: string | URL) => {
    calls++
    const id = String(url).replace(/^.*\/models\/(.+)\/tree\/main$/, "$1")
    const oid = DIGESTS[id]
    if (!oid) return new Response("[]", { status: 200 })
    return Response.json([
      { path: "tokenizer.json", size: 100, lfs: { oid: oid.replace("sha256:", "") } },
    ])
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const curated: ModelSpec[] = [
  { id: "google/gemma-4-26B-A4B-it", download: "31 MB" },
  {
    id: "google/gemma-4-31B-it",
    download: "31 MB",
    tokenizer: "google/gemma-4-26B-A4B-it",
  },
  { id: "Qwen/Qwen3.8-27B", download: "12 MB" },
]

const added = (id: string, extra: Partial<ModelSpec> = {}): ModelSpec => ({
  id,
  download: "31 MB",
  custom: true,
  ...extra,
})

describe("repairAliases", () => {
  test("aliases an entry added before digest matching existed", async () => {
    // Exactly the reported bug: stored with no tokenizer field.
    const out = await repairAliases(curated, [added("google/gemma-4-12B-it")])
    expect(out).not.toBeNull()
    expect(out![0].tokenizer).toBe("google/gemma-4-26B-A4B-it")
    expect(out![0].digest).toBe("sha256:aaa")
  })

  test("leaves a genuinely distinct tokenizer alone", async () => {
    const out = await repairAliases(curated, [added("some/orphan")])
    expect(out![0].tokenizer).toBeUndefined()
  })

  test("reports no change when everything already resolves", async () => {
    const already = added("google/gemma-4-12B-it", {
      tokenizer: "google/gemma-4-26B-A4B-it",
      digest: "sha256:aaa",
    })
    expect(await repairAliases(curated, [already])).toBeNull()
  })

  test("never aliases two added models into a cycle", async () => {
    // Both share a digest with each other and with a curated model.
    const out = await repairAliases(curated, [
      added("mirror/one"),
      added("mirror/two"),
    ])
    // Neither points at the other in a way that loops back.
    for (const m of out ?? []) {
      if (m.tokenizer) expect(out!.find((x) => x.id === m.tokenizer)?.tokenizer).toBeUndefined()
    }
  })

  test("points a later duplicate at the earlier one, not the reverse", async () => {
    DIGESTS["dup/first"] = "sha256:ddd"
    DIGESTS["dup/second"] = "sha256:ddd"
    const out = await repairAliases(curated, [added("dup/first"), added("dup/second")])
    expect(out![0].tokenizer).toBeUndefined()
    expect(out![1].tokenizer).toBe("dup/first")
  })

  test("memoises digests so a repeat costs no requests", async () => {
    await repairAliases(curated, [added("google/gemma-4-12B-it")])
    const first = calls
    expect(first).toBeGreaterThan(0)
    calls = 0
    await repairAliases(curated, [added("google/gemma-4-12B-it")])
    expect(calls).toBe(0)
  })

  test("does nothing when there are no added models", async () => {
    expect(await repairAliases(curated, [])).toBeNull()
  })
})
