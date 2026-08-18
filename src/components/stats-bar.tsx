import type { Stats } from "@/lib/tokens"
import { cn } from "@/lib/utils"

type Tile = { label: string; value: string; hint?: string; accent?: boolean }

function tiles(stats: Stats): Tile[] {
  return [
    { label: "Tokens", value: stats.tokens.toLocaleString(), accent: true },
    { label: "Characters", value: stats.chars.toLocaleString() },
    { label: "UTF-8 bytes", value: stats.bytes.toLocaleString() },
    { label: "Words", value: stats.words.toLocaleString() },
    {
      label: "Chars / token",
      value: stats.tokens ? stats.charsPerToken.toFixed(2) : "—",
      hint: "higher is more efficient",
    },
    {
      label: "Bytes / token",
      value: stats.tokens ? stats.bytesPerToken.toFixed(2) : "—",
    },
  ]
}

export function StatsBar({ stats, stale }: { stats: Stats; stale?: boolean }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-6",
        stale && "opacity-60 transition-opacity",
      )}
    >
      {tiles(stats).map((tile) => (
        <div key={tile.label} className="bg-card px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {tile.label}
          </div>
          <div
            className={cn(
              "mt-1 font-mono tabular-nums",
              tile.accent ? "text-2xl font-semibold" : "text-lg",
            )}
          >
            {tile.value}
          </div>
          {tile.hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{tile.hint}</div>}
        </div>
      ))}
    </div>
  )
}
