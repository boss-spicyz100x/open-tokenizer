import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { WorkerRequest, WorkerResponse } from "@/workers/tokenizer.worker"
import { buildPieces, computeStats, type Stats, type TokenPiece } from "@/lib/tokens"

export type LoadState =
  | { status: "idle" }
  | { status: "loading"; progress: number; file?: string }
  | { status: "ready"; vocabSize: number; tokenizerClass: string }
  | { status: "error"; message: string }

export type TokenizerResult = {
  pieces: TokenPiece[]
  stats: Stats
}

const DEBOUNCE_MS = 150

export function useTokenizer(modelId: string, text: string) {
  const workerRef = useRef<Worker | null>(null)
  const requestId = useRef(0)
  const [load, setLoad] = useState<LoadState>({ status: "idle" })
  const [raw, setRaw] = useState<{ ids: number[]; raw: string[]; decoded: string[] } | null>(null)
  const [encoding, setEncoding] = useState(false)

  // One worker for the whole session; it keeps every loaded tokenizer in memory,
  // so switching back to a previously used model is instant.
  useEffect(() => {
    const worker = new Worker(new URL("../workers/tokenizer.worker.ts", import.meta.url), {
      type: "module",
    })
    workerRef.current = worker

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      switch (msg.type) {
        case "progress":
          setLoad((prev) =>
            prev.status === "ready" || prev.status === "error"
              ? prev
              : { status: "loading", progress: msg.progress ?? 0, file: msg.file },
          )
          break
        case "ready":
          setLoad({ status: "ready", vocabSize: msg.vocabSize, tokenizerClass: msg.tokenizerClass })
          break
        case "error":
          setLoad({ status: "error", message: msg.message })
          setEncoding(false)
          break
        case "result":
          // Ignore results from a superseded keystroke.
          if (msg.requestId !== requestId.current) return
          setRaw({ ids: msg.ids, raw: msg.raw, decoded: msg.decoded })
          setEncoding(false)
          break
      }
    })

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const send = useCallback((msg: WorkerRequest) => workerRef.current?.postMessage(msg), [])

  // Load whenever the selected model changes.
  useEffect(() => {
    setLoad({ status: "loading", progress: 0 })
    setRaw(null)
    send({ type: "load", modelId })
  }, [modelId, send])

  // Re-encode on text or model change, once the tokenizer is ready.
  useEffect(() => {
    if (load.status !== "ready") return
    if (!text) {
      setRaw({ ids: [], raw: [], decoded: [] })
      setEncoding(false)
      return
    }
    setEncoding(true)
    const id = ++requestId.current
    const timer = setTimeout(() => send({ type: "encode", modelId, text, requestId: id }), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, modelId, load.status, send])

  const result = useMemo<TokenizerResult | null>(() => {
    if (!raw) return null
    const pieces = buildPieces(raw.ids, raw.raw, raw.decoded)
    return { pieces, stats: computeStats(text, pieces) }
  }, [raw, text])

  const retry = useCallback(() => {
    setLoad({ status: "loading", progress: 0 })
    send({ type: "load", modelId })
  }, [modelId, send])

  return { load, result, encoding, retry }
}
