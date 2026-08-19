import { describe, expect, test } from "bun:test"
import { MODELS, modelsSharing, tokenizerRepo, tokenizerRepos, type ModelSpec } from "./models"

describe("tokenizerRepo", () => {
  test("returns a model's own id when it ships its own tokenizer", () => {
    // In the registry and not aliased — distinct from the fallback below.
    expect(MODELS.some((m) => m.id === "Qwen/Qwen3.8-27B")).toBe(true)
    expect(tokenizerRepo("Qwen/Qwen3.8-27B")).toBe("Qwen/Qwen3.8-27B")
  })

  test("points aliased models at the repo that actually holds the files", () => {
    expect(tokenizerRepo("google/gemma-4-31B-it")).toBe("google/gemma-4-26B-A4B-it")
  })

  test("falls back to the id for a model not in the registry", () => {
    expect(tokenizerRepo("some/unknown-model")).toBe("some/unknown-model")
  })
})

describe("tokenizerRepos", () => {
  test("collapses shared tokenizers into one download each", () => {
    expect(tokenizerRepos().length).toBeLessThan(MODELS.length)
    expect(new Set(tokenizerRepos()).size).toBe(tokenizerRepos().length)
    expect(tokenizerRepos()).not.toContain("google/gemma-4-31B-it")
    expect(tokenizerRepos()).toContain("google/gemma-4-26B-A4B-it")
  })

  test("every alias target is itself a real download", () => {
    for (const m of MODELS) {
      expect(tokenizerRepos()).toContain(tokenizerRepo(m.id))
    }
  })

  test("no alias points at another alias", () => {
    // One hop only: resolving twice must be the same as resolving once.
    for (const m of MODELS) {
      expect(tokenizerRepo(tokenizerRepo(m.id))).toBe(tokenizerRepo(m.id))
    }
  })
})

describe("modelsSharing", () => {
  test("names the siblings served by the same download", () => {
    expect(modelsSharing("google/gemma-4-26B-A4B-it").map((m) => m.id)).toEqual([
      "google/gemma-4-31B-it",
    ])
    expect(modelsSharing("google/gemma-4-31B-it").map((m) => m.id)).toEqual([
      "google/gemma-4-26B-A4B-it",
    ])
  })

  test("is empty for a model that shares with nothing", () => {
    // A registry entry with a genuinely distinct vocabulary, so the empty
    // result means "no siblings" rather than "not in the list".
    expect(MODELS.some((m) => m.id === "Qwen/Qwen3.8-27B")).toBe(true)
    expect(modelsSharing("Qwen/Qwen3.8-27B")).toEqual([])
  })
})

describe("alias validity", () => {
  /**
   * Aliasing is only sound while the files are actually identical. HF serves the
   * sha256 as the ETag for LFS objects, so this checks the claim with two HEAD
   * requests instead of downloading 60 MB. If Google republishes either repo
   * with a different tokenizer, this fails and the alias must be removed.
   */
  test(
    "aliased models really do serve byte-identical tokenizer files",
    async () => {
      const aliased = MODELS.filter((m) => m.tokenizer)
      expect(aliased.length).toBeGreaterThan(0)

      for (const model of aliased) {
        for (const file of ["tokenizer.json", "tokenizer_config.json"]) {
          const [a, b] = await Promise.all(
            [model.id, model.tokenizer!].map((repo) =>
              fetch(`https://huggingface.co/${repo}/resolve/main/${file}`, {
                method: "HEAD",
                redirect: "follow",
              }).then((r) => r.headers.get("etag")),
            ),
          )
          expect(a).toBeTruthy()
          expect(a).toBe(b)
        }
      }
    },
    60_000,
  )
})

describe("aliases on added models", () => {
  // A model added from the Hub can alias a curated one, so resolution has to
  // search the full list rather than only what shipped in models.ts.
  const added: ModelSpec[] = [
    {
      id: "google/gemma-4-12B-it",
      download: "31 MB",
      custom: true,
      tokenizer: "google/gemma-4-26B-A4B-it",
    },
  ]
  const all = [...MODELS, ...added]

  test("resolves an added model to the repo it shares", () => {
    expect(tokenizerRepo("google/gemma-4-12B-it", all)).toBe("google/gemma-4-26B-A4B-it")
  })

  test("ignoring the list would re-download — the regression this guards", () => {
    expect(tokenizerRepo("google/gemma-4-12B-it")).toBe("google/gemma-4-12B-it")
  })

  test("adds no extra download", () => {
    expect(tokenizerRepos(all)).toEqual(tokenizerRepos())
  })

  test("names every sibling in both directions", () => {
    expect(modelsSharing("google/gemma-4-12B-it", all).map((m) => m.id).sort()).toEqual([
      "google/gemma-4-26B-A4B-it",
      "google/gemma-4-31B-it",
    ])
    expect(modelsSharing("google/gemma-4-26B-A4B-it", all).map((m) => m.id).sort()).toEqual([
      "google/gemma-4-12B-it",
      "google/gemma-4-31B-it",
    ])
  })
})
