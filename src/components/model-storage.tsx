import { AlertCircle, Download, HardDrive, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { LoadState } from "@/hooks/use-tokenizer"
import { modelsSharing, type ModelSpec } from "@/lib/models"
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
  onDownload: () => void
  onRemove: () => void
  onRemoveAll: () => void
  /** Only set for models added from the Hub, which can be dropped entirely. */
  onForget?: () => void
  /** Full list, so sharing resolves across added models too. */
  models: ModelSpec[]
}

export function ModelStorage({
  spec,
  load,
  entry,
  cache,
  onDownload,
  onRemove,
  onRemoveAll,
  onForget,
  models,
}: Props) {
  const cachedModels = Object.entries(cache).filter(([, e]) => e.cached)
  const totalBytes = cachedModels.reduce((sum, [, e]) => sum + e.bytes, 0)

  // Sharing cuts both ways: one download serves these, and removing it drops
  // them all. Say so rather than letting either come as a surprise.
  const shared = modelsSharing(spec.id, models)
  const sharedNames = shared.map((m) => m.label).join(", ")

  const summary = cachedModels.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <HardDrive className="size-3.5" />
      <span>
        {cachedModels.length} tokenizer{cachedModels.length === 1 ? "" : "s"} cached ·{" "}
        {formatBytes(totalBytes)}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-auto px-2 py-1 text-xs"
        onClick={onRemoveAll}
      >
        Remove all
      </Button>
    </div>
  )

  if (load.status === "loading") {
    return (
      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            <span>
              {entry?.cached ? "Loading" : "Downloading"} {spec.label}
              {entry?.cached ? " from cache" : ` — ${spec.download}`}…
            </span>
          </div>
          {!entry?.cached && <Progress value={load.progress} />}
        </CardContent>
      </Card>
    )
  }

  if (load.status === "error") {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex flex-wrap items-center gap-3 py-5 text-sm">
          <AlertCircle className="size-4 shrink-0 text-destructive" />
          <span className="mr-auto">Could not load {spec.label}: {load.message}</span>
          <Button size="sm" variant="outline" onClick={onDownload}>
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (load.status === "idle") {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-5">
          <div className="mr-auto">
            <p className="text-sm font-medium">{spec.label} isn't downloaded yet</p>
            <p className="text-xs text-muted-foreground">
              {spec.download} from the Hugging Face CDN, then cached in this browser.
              {shared.length > 0 && ` The same files serve ${sharedNames}.`}
            </p>
          </div>
          {onForget && (
        <Button
          size="sm"
          variant="ghost"
          className="h-auto px-2 py-1 text-xs text-muted-foreground"
          onClick={onForget}
        >
          Forget model
        </Button>
          )}
          {summary}
          <Button size="sm" onClick={onDownload}>
            <Download className="size-3.5" />
            Download tokenizer
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Ready.
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
      <span className="text-xs text-muted-foreground">
        {spec.label} · {entry?.cached ? `${formatBytes(entry.bytes)} cached` : "in memory"}
        {shared.length > 0 && ` · shared with ${sharedNames}`}
      </span>
      {entry?.cached && (
        <Button
          size="sm"
          variant="ghost"
          className="h-auto px-2 py-1 text-xs text-muted-foreground"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
          Remove download
        </Button>
      )}
      {onForget && (
        <Button
          size="sm"
          variant="ghost"
          className="h-auto px-2 py-1 text-xs text-muted-foreground"
          onClick={onForget}
        >
          Forget model
        </Button>
      )}
      <div className="ml-auto">{summary}</div>
    </div>
  )
}
