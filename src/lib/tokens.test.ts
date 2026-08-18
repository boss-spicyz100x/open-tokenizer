import { describe, expect, test } from "bun:test"
import { buildPieces, colorIndex, computeStats, countWords } from "./tokens"

describe("countWords", () => {
  test("segments Thai without relying on spaces", () => {
    // Thai does not space-separate words; splitting on whitespace gives 2.
    expect(countWords("ยินดีค่ะ คุณเอต้องการสอบถามหรือแจ้งข้อมูลเพิ่มเติมในเรื่องไหนคะ")).toBe(15)
    expect(countWords("ยินดีค่ะ คุณเอต้องการสอบถาม")).toBe(6)
  })

  test("still handles Latin text and mixed scripts", () => {
    expect(countWords("The quick brown fox jumps over the lazy dog.")).toBe(9)
    expect(countWords("สวัสดี hello world ครับ")).toBe(4)
  })

  test("ignores punctuation and empty input", () => {
    expect(countWords("")).toBe(0)
    expect(countWords("   \n\t ")).toBe(0)
    expect(countWords("!!! ??? ...")).toBe(0)
  })
})

describe("buildPieces", () => {
  test("classifies whitespace, newlines and tabs distinctly", () => {
    const pieces = buildPieces(
      [1, 2, 3, 4],
      ["hello", "▁", "\n", "\t"],
      ["hello", " ", "\n", "\t"],
    )
    expect(pieces.map((p) => p.kind)).toEqual(["text", "space", "newline", "tab"])
  })

  test("flags partial UTF-8 tokens as bytes and keeps the raw entry", () => {
    // GPT-2 splits Thai mid-character; decode() yields U+FFFD per byte.
    const pieces = buildPieces([100], ["à¸"], ["�"])
    expect(pieces[0].kind).toBe("bytes")
    expect(pieces[0].raw).toBe("à¸")
  })

  test("preserves index and id alignment", () => {
    const pieces = buildPieces([7, 8, 9], ["a", "b", "c"], ["a", "b", "c"])
    expect(pieces.map((p) => p.index)).toEqual([0, 1, 2])
    expect(pieces.map((p) => p.id)).toEqual([7, 8, 9])
  })
})

describe("computeStats", () => {
  const pieces = (n: number) =>
    buildPieces(
      Array.from({ length: n }, (_, i) => i),
      Array.from({ length: n }, () => "x"),
      Array.from({ length: n }, () => "x"),
    )

  test("counts code points, not UTF-16 units", () => {
    // The emoji is one code point but two UTF-16 units and four UTF-8 bytes.
    const stats = computeStats("a🙂", pieces(2))
    expect(stats.chars).toBe(2)
    expect(stats.bytes).toBe(5)
  })

  test("measures Thai bytes as three per character", () => {
    const stats = computeStats("ยินดี", pieces(3))
    expect(stats.bytes).toBe(15)
    expect(stats.chars).toBe(5)
  })

  test("derives the efficiency ratios", () => {
    const stats = computeStats("aaaaaaaa", pieces(4))
    expect(stats.charsPerToken).toBe(2)
    expect(stats.bytesPerToken).toBe(2)
  })

  test("reports tokens per word", () => {
    const text = "ยินดีค่ะ คุณเอต้องการสอบถาม" // 6 words
    const stats = computeStats(text, pieces(12))
    expect(stats.words).toBe(6)
    expect(stats.tokensPerWord).toBe(2)
  })

  test("avoids dividing by zero on empty input", () => {
    const stats = computeStats("", pieces(0))
    expect(stats.charsPerToken).toBe(0)
    expect(stats.tokensPerWord).toBe(0)
    expect(stats.words).toBe(0)
  })

  test("counts partial-byte tokens", () => {
    const mixed = buildPieces([1, 2], ["ok", "à¸"], ["ok", "�"])
    expect(computeStats("ok", mixed).byteTokens).toBe(1)
  })
})

describe("colorIndex", () => {
  test("cycles through ten hues", () => {
    expect(colorIndex(0)).toBe(0)
    expect(colorIndex(9)).toBe(9)
    expect(colorIndex(10)).toBe(0)
    expect(colorIndex(23)).toBe(3)
  })
})
