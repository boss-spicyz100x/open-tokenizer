export type TokenKind = "text" | "space" | "newline" | "tab" | "bytes"

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

export type Stats = {
  tokens: number
  chars: number
  bytes: number
  words: number
  charsPerToken: number
  bytesPerToken: number
  /** Tokens that decode to a partial UTF-8 sequence — the tokenizer split mid-character. */
  byteTokens: number
}

const encoder = new TextEncoder()

export function computeStats(text: string, pieces: TokenPiece[]): Stats {
  const tokens = pieces.length
  const chars = [...text].length
  const bytes = encoder.encode(text).length
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return {
    tokens,
    chars,
    bytes,
    words,
    charsPerToken: tokens ? chars / tokens : 0,
    bytesPerToken: tokens ? bytes / tokens : 0,
    byteTokens: pieces.filter((p) => p.kind === "bytes").length,
  }
}

/** Ten hues cycled across the token stream so adjacent tokens stay distinguishable. */
export const TOKEN_COLORS = 10

export function colorIndex(i: number): number {
  return i % TOKEN_COLORS
}
