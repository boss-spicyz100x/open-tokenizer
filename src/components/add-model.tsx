import { useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { describeFailure, inspectModel, searchModels, type HubResult } from "@/lib/hub"
import { specFromRepo } from "@/lib/custom-models"
import { findSharedRepo } from "@/lib/share"
import type { ModelSpec } from "@/lib/models"

const DEBOUNCE_MS = 250

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export function AddModel({
  models,
  onAdd,
}: {
  models: ModelSpec[]
  onAdd: (spec: ModelSpec) => void
}) {
  const known = models.map((m) => m.id)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<HubResult[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
      setError(null)
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setResults(await searchModels(q, controller.signal))
      } catch {
        // Aborted by the next keystroke, or the Hub is unreachable.
      } finally {
        setSearching(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const add = async (id: string) => {
    setError(null)
    if (known.includes(id)) {
      setError("That model is already in the list.")
      return
    }
    setAdding(id)
    abort.current?.abort()
    abort.current = new AbortController()
    try {
      const check = await inspectModel(id, abort.current.signal)
      if (!check.ok) {
        setError(describeFailure(check.reason))
        return
      }
      // Reuse an existing download when the files are byte-identical — the whole
      // Gemma 4 family ships one tokenizer, as do many finetunes of a base model.
      const shared = await findSharedRepo(check.digest, models, abort.current.signal)
      onAdd({
        ...specFromRepo(id, check.bytes),
        digest: check.digest ?? undefined,
        ...(shared && shared !== id ? { tokenizer: shared } : {}),
      })
      setOpen(false)
    } catch {
      setError("Could not reach Hugging Face. Check your connection and try again.")
    } finally {
      setAdding(null)
    }
  }

  const typedId = query.trim()
  const looksLikeId = /^[\w.-]+\/[\w.-]+$/.test(typedId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Base UI composes via `render`, not `asChild`. */}
      <DialogTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Add a model from Hugging Face" />
        }
      >
        <Plus className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a tokenizer</DialogTitle>
          <DialogDescription>
            Search the Hugging Face Hub, or paste a repo id like{" "}
            <code className="font-mono text-xs">owner/model</code>. Any public model that ships a
            fast tokenizer works.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && looksLikeId) add(typedId)
            }}
            placeholder="mistral, llama, or owner/model…"
            className="pl-9"
            spellCheck={false}
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="max-h-[46vh] min-h-[3rem] overflow-y-auto">
          {looksLikeId && !results.some((r) => r.id === typedId) && (
            <Row
              id={typedId}
              hint="use this id"
              disabled={adding !== null}
              busy={adding === typedId}
              already={known.includes(typedId)}
              onClick={() => add(typedId)}
            />
          )}
          {results.map((r) => (
            <Row
              key={r.id}
              id={r.id}
              hint={`${compact(r.downloads)} downloads`}
              disabled={adding !== null}
              busy={adding === r.id}
              already={known.includes(r.id)}
              onClick={() => add(r.id)}
            />
          ))}
          {searching && results.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground">Searching…</p>
          )}
          {!searching && query.trim().length >= 2 && results.length === 0 && !looksLikeId && (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              Nothing matched. Gated models (Llama, some Mistral) can't be used here.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  id,
  hint,
  busy,
  disabled,
  already,
  onClick,
}: {
  id: string
  hint: string
  busy: boolean
  disabled: boolean
  already: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || already}
      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
    >
      <span className="truncate font-mono text-xs">{id}</span>
      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
        {already ? "already added" : hint}
      </span>
      {busy && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
    </button>
  )
}
