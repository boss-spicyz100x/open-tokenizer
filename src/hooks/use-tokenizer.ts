import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CacheReport, WorkerRequest, WorkerResponse } from "@/workers/tokenizer.worker"
import { buildPieces, computeStats, type Stats, type TokenPiece } from "@/lib/tokens"

export type LoadState =
  | { status: "idle" }
  | { status: "loading"; progress: number; file?: string }
  | { status: "ready"; vocabSize: number; tokenizerClass: string }
  | { status: "error"; message: string }

export type TokenizerResult = { pieces: TokenPiece[]; stats: Stats }

const DEBOUNCE_MS = 150

export function useTokenizer(modelId: string, text: string, allModelIds: string[]) {
  const workerRef = useRef<Worker | null>(null)
  const modelIdRef = useRef(modelId)
  modelIdRef.current = modelId
  const requestId = useRef(0)
  const [load, setLoad] = useState<LoadState>({ status: "idle" })
  const [cache, setCache] = useState<CacheReport>({})
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
        case "status":
          setCache(msg.report)
          break
        case "removed":
          setCache(msg.report)
          // Batched with setCache, so the load-if-cached effect sees both the
          // idle status and the cleared flag and stays put.
          if (msg.modelIds.includes(modelIdRef.current)) {
            setLoad({ status: "idle" })
            setRaw(null)
            setEncoding(false)
          }
          break
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

  const ids = useMemo(() => allModelIds.join(","), [allModelIds])
  const refreshStatus = useCallback(
    () => send({ type: "status", modelIds: ids.split(",") }),
    [ids, send],
  )

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  // Switching models always drops back to idle; nothing is fetched implicitly.
  useEffect(() => {
    setRaw(null)
    setEncoding(false)
    setLoad({ status: "idle" })
  }, [modelId])

  // Selecting a model never starts a download. If its files are already cached,
  // loading is local and instant, so that happens without asking. Gating on
  // `idle` keeps this from re-firing once the load is under way — otherwise the
  // status refresh below would flip `cached` and restart it in a loop.
  const cached = cache[modelId]?.cached ?? false
  useEffect(() => {
    if (!cached || load.status !== "idle") return
    setLoad({ status: "loading", progress: 0 })
    send({ type: "load", modelId })
  }, [cached, load.status, modelId, send])

  // A finished load may have populated the cache, so re-measure it.
  useEffect(() => {
    if (load.status === "ready") refreshStatus()
  }, [load.status, refreshStatus])

  // Re-encode on text change, once the tokenizer is ready.
  useEffect(() => {
    if (load.status !== "ready") return
    if (!text) {
      setRaw({ ids: [], raw: [], decoded: [] })
      setEncoding(false)
      return
    }
    setEncoding(true)
    const id = ++requestId.current
    const timer = setTimeout(
      () => send({ type: "encode", modelId, text, requestId: id }),
      DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [text, modelId, load.status, send])

  const result = useMemo<TokenizerResult | null>(() => {
    if (!raw) return null
    const pieces = buildPieces(raw.ids, raw.raw, raw.decoded)
    return { pieces, stats: computeStats(text, pieces) }
  }, [raw, text])

  const download = useCallback(() => {
    setLoad({ status: "loading", progress: 0 })
    send({ type: "load", modelId })
  }, [modelId, send])

  // State is reset by the worker's "removed" reply, not optimistically here.
  const remove = useCallback(
    (target: string) => send({ type: "remove", modelId: target, modelIds: ids.split(",") }),
    [ids, send],
  )

  const removeAll = useCallback(
    () => send({ type: "removeAll", modelIds: ids.split(",") }),
    [ids, send],
  )

  return { load, result, encoding, cache, download, remove, removeAll, refreshStatus }
}
