import { beforeAll, describe, expect, test } from "bun:test"
import { AutoTokenizer, type PreTrainedTokenizer } from "@huggingface/transformers"
import { encodeText, tokenizerClass, vocabSize } from "./tokenizer-core"

/**
 * These hit the network on a cold cache (~44 MB total across the three models)
 * and are cached by transformers.js afterwards. They exist to catch a
 * transformers.js upgrade silently changing counts — the one regression that is
 * invisible by eye.
 */
const TIMEOUT = 180_000

const THAI =
  "ยินดีค่ะ คุณเอต้องการสอบถามหรือแจ้งข้อมูลเพิ่มเติมในเรื่องไหนคะ สามารถแจ้งรายละเอียดได้เลยค่ะ ดิฉันยินดีรับฟังและบันทึกข้อมูลให้ค่ะ"
const ENGLISH = "The quick brown fox jumps over the lazy dog."

const CASES = [
  {
    id: "google/gemma-4-26B-A4B-it",
    thai: 35,
    english: 10,
    vocab: 262_144,
    declaredCls: "GemmaTokenizer",
    byteTokens: 0,
  },
  {
    id: "Qwen/Qwen3.8-27B",
    thai: 28,
    english: 10,
    vocab: 248_044,
    declaredCls: "Qwen2Tokenizer",
    byteTokens: 0,
  },
  {
    // GPT-2 has no Thai coverage: every character is split into raw UTF-8 bytes.
    id: "openai-community/gpt2",
    thai: 259,
    english: 10,
    vocab: 50_257,
    // No tokenizer_class in its config, so the name depends on the build.
    declaredCls: null,
    byteTokens: 256,
  },
]

const tokenizers = new Map<string, PreTrainedTokenizer>()

beforeAll(async () => {
  for (const c of CASES) tokenizers.set(c.id, await AutoTokenizer.from_pretrained(c.id))
}, TIMEOUT)

describe.each(CASES)("$id", (c) => {
  const tok = () => tokenizers.get(c.id)!

  test("pins the Thai and English token counts", () => {
    expect(encodeText(tok(), THAI).ids.length).toBe(c.thai)
    expect(encodeText(tok(), ENGLISH).ids.length).toBe(c.english)
  })

  test("reports the vocabulary size", () => {
    expect(vocabSize(tok())).toBe(c.vocab)
  })

  test("reports a class name that survives minification", () => {
    const name = tokenizerClass(tok())
    if (c.declaredCls) {
      // Declared in tokenizer_config.json, so identical in every build.
      expect(name).toBe(c.declaredCls)
    } else {
      // Falls back to constructor.name, which the production minifier rewrites.
      // Either the real name (unminified, as here) or "" — never mangled junk.
      expect(name === "" || name.endsWith("Tokenizer")).toBe(true)
    }
  })

  test("keeps ids, raw tokens and decoded tokens aligned", () => {
    const { ids, raw, decoded } = encodeText(tok(), THAI)
    expect(raw.length).toBe(ids.length)
    expect(decoded.length).toBe(ids.length)
  })

  test("counts tokens that decode to a partial UTF-8 sequence", () => {
    const { decoded } = encodeText(tok(), THAI)
    expect(decoded.filter((d) => d.includes("�")).length).toBe(c.byteTokens)
  })
})

describe("decoded tokens", () => {
  test("reassemble into the original text when the vocabulary covers it", () => {
    for (const id of ["google/gemma-4-26B-A4B-it", "Qwen/Qwen3.8-27B"]) {
      expect(encodeText(tokenizers.get(id)!, THAI).decoded.join("")).toBe(THAI)
    }
  })

  test("are the only readable form: raw tokens are mojibake for byte-level BPE", () => {
    const { raw, decoded } = encodeText(tokenizers.get("Qwen/Qwen3.8-27B")!, "ยินดี")
    expect(raw.join("")).not.toContain("ยิน")
    expect(decoded.join("")).toBe("ยินดี")
  })
})

describe("Thai efficiency ordering", () => {
  test("Qwen3.8 beats Gemma 4, which beats GPT-2 by a wide margin", () => {
    const n = (id: string) => encodeText(tokenizers.get(id)!, THAI).ids.length
    expect(n("Qwen/Qwen3.8-27B")).toBeLessThan(n("google/gemma-4-26B-A4B-it"))
    expect(n("google/gemma-4-26B-A4B-it")).toBeLessThan(n("openai-community/gpt2") / 5)
  })
})
