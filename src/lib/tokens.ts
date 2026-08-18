export type TokenKind = "text" | "space" | "newline" | "tab" | "bytes" | "stop"

export type TokenPiece = {
  index: number
  id: number
  /** Raw vocab entry, e.g. "▁hello" or "à¸¢". */
  raw: string
  /** `decode([id])` — readable unless the token is a partial UTF-8 sequence. */
  decoded: string
  kind: TokenKind
}

const REPLACEMENT = "�"

function classify(decoded: string): TokenKind {
  if (decoded.includes(REPLACEMENT)) return "bytes"
  if (decoded.includes("\n")) return "newline"
  if (decoded.includes("\t")) return "tab"
  if (decoded.length > 0 && decoded.trim().length === 0) return "space"
  return "text"
}

export function buildPieces(ids: number[], raw: string[], decoded: string[]): TokenPiece[] {
  return ids.map((id, index) => ({
    index,
    id,
    raw: raw[index] ?? "",
    decoded: decoded[index] ?? "",
    kind: classify(decoded[index] ?? ""),
  }))
}

/**
 * Appends the stop token a model emits to end a completion. Counting it is what
 * makes the total match an API's `completion_tokens`; the text itself is
 * unchanged, so chars and bytes stay as they were.
 */
export function withStopToken(
  pieces: TokenPiece[],
  stop: { token: string; id: number } | null,
): TokenPiece[] {
  if (pieces.length === 0) return pieces
  return [
    ...pieces,
    {
      index: pieces.length,
      id: stop?.id ?? -1,
      raw: stop?.token ?? "<stop>",
      decoded: "",
      kind: "stop" as const,
    },
  ]
}

export type Stats = {
  tokens: number
  chars: number
  bytes: number
  words: number
  charsPerToken: number
  bytesPerToken: number
  tokensPerWord: number
  /** Tokens that decode to a partial UTF-8 sequence — the tokenizer split mid-character. */
  byteTokens: number
}

const encoder = new TextEncoder()

/**
 * Thai does not put spaces between words, so splitting on whitespace counts
 * phrase groups and badly undercounts — 2 instead of 15 for a typical sentence.
 * `Intl.Segmenter` applies ICU's dictionary-based breaking for Thai (and Lao,
 * Khmer, Japanese, Chinese) and falls back to spaces elsewhere. The locale is
 * irrelevant: ICU picks the algorithm from the script, not the tag.
 */
const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null

export function countWords(text: string): number {
  if (!text.trim()) return 0
  if (!segmenter) return text.trim().split(/\s+/).length
  let n = 0
  for (const s of segmenter.segment(text)) if (s.isWordLike) n++
  return n
}

export function computeStats(text: string, pieces: TokenPiece[]): Stats {
  const tokens = pieces.length
  const chars = [...text].length
  const bytes = encoder.encode(text).length
  const words = countWords(text)
  return {
    tokens,
    chars,
    bytes,
    words,
    charsPerToken: tokens ? chars / tokens : 0,
    bytesPerToken: tokens ? bytes / tokens : 0,
    tokensPerWord: words ? tokens / words : 0,
    byteTokens: pieces.filter((p) => p.kind === "bytes").length,
  }
}

/** Ten hues cycled across the token stream so adjacent tokens stay distinguishable. */
export const TOKEN_COLORS = 10

export function colorIndex(i: number): number {
  return i % TOKEN_COLORS
}
