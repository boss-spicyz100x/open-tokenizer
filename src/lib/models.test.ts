import { describe, expect, test } from "bun:test"
import { MODELS, TOKENIZER_REPOS, modelsSharing, tokenizerRepo } from "./models"

describe("tokenizerRepo", () => {
  test("returns a model's own id when it ships its own tokenizer", () => {
    expect(tokenizerRepo("Qwen/Qwen3.8-27B")).toBe("Qwen/Qwen3.8-27B")
    expect(tokenizerRepo("openai-community/gpt2")).toBe("openai-community/gpt2")
  })

  test("points aliased models at the repo that actually holds the files", () => {
    expect(tokenizerRepo("google/gemma-4-31B-it")).toBe("google/gemma-4-26B-A4B-it")
  })

  test("falls back to the id for a model not in the registry", () => {
    expect(tokenizerRepo("some/unknown-model")).toBe("some/unknown-model")
  })
})

describe("TOKENIZER_REPOS", () => {
  test("collapses shared tokenizers into one download each", () => {
    expect(TOKENIZER_REPOS.length).toBeLessThan(MODELS.length)
    expect(new Set(TOKENIZER_REPOS).size).toBe(TOKENIZER_REPOS.length)
    expect(TOKENIZER_REPOS).not.toContain("google/gemma-4-31B-it")
    expect(TOKENIZER_REPOS).toContain("google/gemma-4-26B-A4B-it")
  })

  test("every alias target is itself a real download", () => {
    for (const m of MODELS) {
      expect(TOKENIZER_REPOS).toContain(tokenizerRepo(m.id))
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
    expect(modelsSharing("openai-community/gpt2")).toEqual([])
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
