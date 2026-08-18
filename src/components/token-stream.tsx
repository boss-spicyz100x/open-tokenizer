import { memo } from "react"
import { colorIndex, type TokenPiece } from "@/lib/tokens"
import { cn } from "@/lib/utils"

/** Rendering one span per token gets expensive fast; the count stays exact regardless. */
const MAX_RENDERED = 4000

function label(piece: TokenPiece): string {
  switch (piece.kind) {
    case "newline":
      // Show the break and take it: the container is whitespace-pre-wrap.
      return piece.decoded.replace(/\n/g, "↵\n")
    case "tab":
      return piece.decoded.replace(/\t/g, "⇥\t")
    case "bytes":
      // Partial UTF-8 — the decoded form is all U+FFFD, so show the vocab entry.
      return piece.raw
    case "stop":
      // Not part of the text; shown so the extra token in the count is visible.
      return piece.raw
    default:
      return piece.decoded
  }
}

const Token = memo(function Token({ piece }: { piece: TokenPiece }) {
  return (
    <span
      title={`#${piece.index}  id ${piece.id}  ${JSON.stringify(piece.raw)}`}
      data-color={colorIndex(piece.index)}
      className={cn(
        "token rounded-[3px] transition-colors hover:outline hover:outline-foreground/40",
        piece.kind === "bytes" && "text-muted-foreground underline decoration-dotted underline-offset-2",
        piece.kind === "stop" && "ml-1 rounded border border-dashed px-1 text-[11px] text-muted-foreground",
        (piece.kind === "newline" || piece.kind === "tab") && "text-muted-foreground",
      )}
    >
      {label(piece)}
    </span>
  )
})

export function TokenStream({ pieces }: { pieces: TokenPiece[] }) {
  const shown = pieces.slice(0, MAX_RENDERED)
  const hidden = pieces.length - shown.length

  return (
    <div className="space-y-3">
      <div className="token-stream whitespace-pre-wrap break-words text-[15px] leading-[2.1]">
        {shown.map((piece) => (
          <Token key={piece.index} piece={piece} />
        ))}
      </div>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing the first {MAX_RENDERED.toLocaleString()} tokens; {hidden.toLocaleString()} more are
          counted but not drawn.
        </p>
      )}
    </div>
  )
}

export function TokenIds({ pieces }: { pieces: TokenPiece[] }) {
  const shown = pieces.slice(0, MAX_RENDERED)
  const hidden = pieces.length - shown.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 font-mono text-xs">
        {shown.map((piece) => (
          <span
            key={piece.index}
            title={`#${piece.index}  ${JSON.stringify(piece.raw)}`}
            data-color={colorIndex(piece.index)}
            className="token rounded px-1.5 py-0.5 tabular-nums"
          >
            {piece.id}
          </span>
        ))}
      </div>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing the first {MAX_RENDERED.toLocaleString()} ids; {hidden.toLocaleString()} more omitted.
        </p>
      )}
    </div>
  )
}
