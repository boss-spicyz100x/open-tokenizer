import { AlertCircle, Download, HardDrive, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { LoadState } from "@/hooks/use-tokenizer"
import { modelName, modelsSharing, type ModelSpec } from "@/lib/models"
import type { CacheEntry, CacheReport } from "@/workers/tokenizer.worker"

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB"
  const mb = bytes / 1_048_576
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`
}

type Props = {
  spec: ModelSpec
  load: LoadState
  entry?: CacheEntry
  cache: CacheReport
  models: ModelSpec[]
  onDownload: () => void
  onRemove: () => void
  onRemoveAll: () => void
  /** Only set for models added from the Hub, which can be dropped entirely. */
  onForget?: () => void
}

/**
 * One row, the same height in every state. Downloading used to swap a tall card
 * for a slim row, which moved everything below it down the page.
 */
export function ModelStorage({
  spec,
  load,
  entry,
  cache,
  models,
  onDownload,
  onRemove,
  onRemoveAll,
  onForget,
}: Props) {
  const cachedModels = Object.entries(cache).filter(([, e]) => e.cached)
  const totalBytes = cachedModels.reduce((sum, [, e]) => sum + e.bytes, 0)

  // Sharing cuts both ways: one download serves these, and removing it drops
  // them all. Say so rather than letting either come as a surprise.
  const shared = modelsSharing(spec.id, models)
  const sharedNames = shared.map((m) => modelName(m.id)).join(", ")
  const name = modelName(spec.id)

  return (
    <div className="flex h-8 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
      {load.status === "idle" && (
        <>
          <span>
            <span className="font-medium text-foreground">{name}</span> isn't downloaded ·{" "}
            {spec.download}
            {shared.length > 0 && ` · also serves ${sharedNames}`}
          </span>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={onDownload}>
            <Download className="size-3.5" />
            Download tokenizer
          </Button>
        </>
      )}

      {load.status === "loading" && (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          <span>
            {entry?.cached ? "Loading" : "Downloading"}{" "}
            <span className="font-medium text-foreground">{name}</span>
            {!entry?.cached && ` — ${spec.download}`}…
          </span>
          {!entry?.cached && <Progress value={load.progress} className="h-1.5 w-32" />}
        </>
      )}

      {load.status === "error" && (
        <>
          <AlertCircle className="size-3.5 shrink-0 text-destructive" />
          <span className="truncate">
            Could not load {name}: {load.message}
          </span>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onDownload}>
            Try again
          </Button>
        </>
      )}

      {load.status === "ready" && (
        <>
          <span>
            <span className="font-medium text-foreground">{name}</span> ·{" "}
            {entry?.cached ? `${formatBytes(entry.bytes)} cached` : "in memory"}
            {shared.length > 0 && ` · shared with ${sharedNames}`}
          </span>
          {entry?.cached && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onRemove}>
              <Trash2 className="size-3.5" />
              Remove download
            </Button>
          )}
        </>
      )}

      {onForget && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onForget}>
          Forget model
        </Button>
      )}

      {cachedModels.length > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <HardDrive className="size-3.5" />
          <span>
            {cachedModels.length} tokenizer{cachedModels.length === 1 ? "" : "s"} cached ·{" "}
            {formatBytes(totalBytes)}
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onRemoveAll}>
            Remove all
          </Button>
        </div>
      )}
    </div>
  )
}
