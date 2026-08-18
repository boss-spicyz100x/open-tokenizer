import { tokenizerDigest } from "@/lib/hub"
import { tokenizerRepos, type ModelSpec } from "@/lib/models"

const KEY = "tokenizer-digests"

function readCache(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}")
    return raw && typeof raw === "object" ? raw : {}
  } catch {
    return {}
  }
}

function remember(repo: string, digest: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readCache(), [repo]: digest }))
  } catch {
    // Storage full or blocked: matching still works, it just re-fetches.
  }
}

/** Digest of a repo's tokenizer.json, memoised across visits. */
export async function digestFor(repo: string, signal?: AbortSignal): Promise<string | null> {
  const cached = readCache()[repo]
  if (cached) return cached
  const digest = await tokenizerDigest(repo, signal)
  if (digest) remember(repo, digest)
  return digest
}

/**
 * A repo already in the list whose tokenizer.json is byte-identical to
 * `digest`, so a model can reuse that download instead of fetching its own.
 *
 * This replaces hardcoding known pairs: the whole Gemma 4 family ships one
 * tokenizer, and so do many finetunes of a common base, which no fixed table
 * would keep up with.
 *
 * Only canonical repos are considered — an alias is not itself a download, and
 * pointing at one would create a chain that `tokenizerRepo` does not follow.
 */
export async function findSharedRepo(
  digest: string | null,
  models: ModelSpec[],
  signal?: AbortSignal,
): Promise<string | null> {
  if (!digest) return null

  const repos = tokenizerRepos(models)
  // Seed from specs that already recorded one, so known models cost no request.
  for (const m of models) {
    if (m.digest && repos.includes(m.id)) remember(m.id, m.digest)
  }

  const found = await Promise.all(
    repos.map(async (repo) => ((await digestFor(repo, signal)) === digest ? repo : null)),
  )
  return found.find((r): r is string => r !== null) ?? null
}
