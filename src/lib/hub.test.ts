import { describe, expect, test } from "bun:test"
import { describeFailure, inspectModel, searchModels, tokenizerDigest } from "./hub"
import { specFromRepo } from "./custom-models"

describe("specFromRepo", () => {
  test("splits owner and name for the picker", () => {
    const spec = specFromRepo("Qwen/Qwen3-8B", 11_422_654)
    expect(spec.id).toBe("Qwen/Qwen3-8B")
    expect(spec.label).toBe("Qwen3-8B")
    expect(spec.maker).toBe("Qwen")
    expect(spec.custom).toBe(true)
  })

  test("formats the real size, finer-grained when small", () => {
    expect(specFromRepo("a/b", 11_422_654).download).toBe("11 MB")
    expect(specFromRepo("a/b", 1_400_000).download).toBe("1.3 MB")
  })

  test("says so rather than inventing a size", () => {
    expect(specFromRepo("a/b", 0).download).toBe("unknown size")
  })

  test("survives an id with no owner", () => {
    expect(specFromRepo("gpt2", 0).label).toBe("gpt2")
  })
})

describe("describeFailure", () => {
  test("explains each rejection in terms of what to do", () => {
    expect(describeFailure("gated")).toContain("gated")
    expect(describeFailure("no-tokenizer")).toContain("tokenizer.json")
    expect(describeFailure("not-found")).toContain("owner/name")
  })
})

/** Live Hub calls; they pin how each rejection is detected, not just handled. */
describe("inspectModel", () => {
  const T = 30_000

  test("accepts an open model and reports its real size", async () => {
    const r = await inspectModel("openai-community/gpt2")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bytes).toBeGreaterThan(1_000_000)
  }, T)

  test("rejects a gated model instead of failing at download time", async () => {
    // `gated` comes back as "manual" here, not `true` — truthiness is the test.
    const r = await inspectModel("meta-llama/Llama-3.3-70B-Instruct")
    expect(r).toEqual({ ok: false, reason: "gated" })
  }, T)

  test("rejects an id that does not resolve", async () => {
    const r = await inspectModel("definitely-not/a-real-model-xyz")
    expect(r).toEqual({ ok: false, reason: "not-found" })
  }, T)
})

describe("searchModels", () => {
  test("finds models by keyword", async () => {
    const results = await searchModels("qwen3")
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.id.includes("/"))).toBe(true)
  }, 30_000)

  test("returns nothing for a query that matches nothing", async () => {
    expect(await searchModels("zzzz-no-such-model-zzzz")).toEqual([])
  }, 30_000)
})

describe("tokenizerDigest", () => {
  const T = 30_000

  test("is equal across the whole Gemma 4 family", async () => {
    // Five sizes, one tokenizer. This is what lets adding any of them from the
    // Hub reuse a download instead of fetching another 31 MB.
    const family = [
      "google/gemma-4-26B-A4B-it",
      "google/gemma-4-31B-it",
      "google/gemma-4-12B-it",
      "google/gemma-4-E4B-it",
      "google/gemma-4-E2B-it",
    ]
    const digests = await Promise.all(family.map((id) => tokenizerDigest(id)))
    expect(digests[0]).toBeTruthy()
    expect(new Set(digests).size).toBe(1)
  }, T)

  test("differs between unrelated vocabularies", async () => {
    const [gemma, qwen] = await Promise.all([
      tokenizerDigest("google/gemma-4-26B-A4B-it"),
      tokenizerDigest("Qwen/Qwen3.8-27B"),
    ])
    expect(gemma).not.toBe(qwen)
  }, T)

  test("is namespaced so LFS and git digests never compare equal", async () => {
    // gpt2's tokenizer.json is small enough to be stored inline, not in LFS, so
    // its digest is a git blob oid rather than a sha256.
    const [big, small] = await Promise.all([
      tokenizerDigest("google/gemma-4-26B-A4B-it"),
      tokenizerDigest("openai-community/gpt2"),
    ])
    expect(big?.startsWith("sha256:")).toBe(true)
    expect(small?.startsWith("git:")).toBe(true)
  }, T)
})
