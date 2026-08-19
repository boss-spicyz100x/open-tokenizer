import { useEffect, useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ModelStorage } from "@/components/model-storage"
import { StatsBar } from "@/components/stats-bar"
import { ThemeToggle } from "@/components/theme-toggle"
import { TokenIds, TokenStream } from "@/components/token-stream"
import { useTokenizer } from "@/hooks/use-tokenizer"
import {
  DEFAULT_MODEL,
  MODELS,
  modelName,
  modelOwner,
  tokenizerRepo,
  tokenizerRepos,
  type ModelSpec,
} from "@/lib/models"
import { loadCustomModels, saveCustomModels } from "@/lib/custom-models"
import { repairAliases } from "@/lib/share"
import { AddModel } from "@/components/add-model"
import { cn } from "@/lib/utils"
const STOP_KEY = "count-stop-token"

/**
 * Input and output are the same fixed height, so the frame never moves: content
 * scrolls inside a stable box instead of the box resizing as you type. Fixed
 * rather than max- for that reason, and bounded so neither can grow the page
 * enough to scroll the token count off screen.
 */
const PANEL_H = "h-[50vh]"

// Applied to a plain div inside TabsContent, not to TabsContent itself: that
// carries `flex-1`, and flex-grow overrides `height` (max-height would clamp,
// but then the panel only fills once the content is long enough).

const SAMPLES: { label: string; text: string }[] = [
  {
    label: "Thai — formal reply",
    text: "ดิฉันต้องขออภัยด้วยนะคะ เนื่องจากข้อมูลชื่อของเจ้าหน้าที่ที่จะเป็นผู้ดูแลหรือติดต่อกลับนั้น อยู่นอกเหนือจากข้อมูลที่ดิฉันสามารถตรวจสอบได้ในขณะนี้ค่ะ\n\nอย่างไรก็ตาม ดิฉันได้บันทึกรายละเอียดความประสงค์ของคุณเอทั้งหมดลงในระบบอย่างครบถ้วนแล้ว เพื่อให้เจ้าหน้าที่ที่เกี่ยวข้องสามารถรับทราบและดำเนินการติดต่อกลับคุณเอได้อย่างรวดเร็วและถูกต้องที่สุดค่ะ หากคุณเอมีเรื่องอื่นที่ต้องการให้ดิฉันช่วยประสานงานเพิ่มเติม สามารถแจ้งได้ทันทีเลยนะคะ",
  },
  {
    label: "Thai — short",
    text: "ยินดีค่ะ คุณเอต้องการสอบถามหรือแจ้งข้อมูลเพิ่มเติมในเรื่องไหนคะ สามารถแจ้งรายละเอียดได้เลยค่ะ ดิฉันยินดีรับฟังและบันทึกข้อมูลให้ค่ะ",
  },
  {
    label: "English",
    text: "The quick brown fox jumps over the lazy dog. Tokenizers split text into subword units, and the same sentence costs a different number of tokens in every vocabulary.",
  },
  {
    label: "Code + mixed",
    text: 'function greet(name: string) {\n  return `สวัสดี ${name}!`\n}\n\ngreet("เอ") // → "สวัสดี เอ!"',
  },
]

export default function App() {
  const [modelId, setModelId] = useState(DEFAULT_MODEL)
  const [custom, setCustom] = useState<ModelSpec[]>(loadCustomModels)
  const [text, setText] = useState(SAMPLES[1].text)
  const [copied, setCopied] = useState(false)
  // Persisted: anyone cross-checking API counts wants this on every visit.
  const [includeStop, setIncludeStop] = useState(
    () => localStorage.getItem(STOP_KEY) === "1",
  )
  // Entries added before digest matching existed carry no alias, so re-resolve
  // them once on load rather than leaving them with a duplicate download.
  useEffect(() => {
    const controller = new AbortController()
    repairAliases(MODELS, loadCustomModels(), controller.signal)
      .then((repaired) => {
        if (!repaired || controller.signal.aborted) return
        setCustom(repaired)
        saveCustomModels(repaired)
      })
      .catch(() => {
        // Offline, or the Hub is unreachable: keep what is stored.
      })
    return () => controller.abort()
  }, [])

  const allModels = useMemo(() => [...MODELS, ...custom], [custom])
  // Only curated models declare aliases, so anything added from the Hub resolves
  // to itself and needs no special handling here.
  const repos = useMemo(() => tokenizerRepos(allModels), [allModels])

  const addModel = (m: ModelSpec) => {
    const next = [...custom, m]
    setCustom(next)
    saveCustomModels(next)
    setModelId(m.id)
  }

  const forgetModel = (id: string) => {
    const next = custom.filter((m) => m.id !== id)
    setCustom(next)
    saveCustomModels(next)
    if (modelId === id) setModelId(DEFAULT_MODEL)
  }

  // Several models can share one tokenizer download (the Gemma 4 family ships
  // byte-identical files), so loading and caching key on the repo, not the model.
  const repo = tokenizerRepo(modelId, allModels)
  const { load, result, encoding, cache, download, remove, removeAll } = useTokenizer(
    repo,
    text,
    repos,
    includeStop,
  )

  const toggleStop = (on: boolean) => {
    setIncludeStop(on)
    localStorage.setItem(STOP_KEY, on ? "1" : "0")
  }

  const spec = allModels.find((m) => m.id === modelId)

  const copyIds = async () => {
    if (!result) return
    await navigator.clipboard.writeText(JSON.stringify(result.pieces.map((p) => p.id)))
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <h1 className="text-base font-semibold leading-tight">Tokenizer</h1>
            <p className="text-xs text-muted-foreground">
              Count tokens for any text, in the browser
            </p>
          </div>

          <Select value={modelId} onValueChange={(v) => v && setModelId(v)}>
            <SelectTrigger className="w-[280px]" aria-label="Tokenizer model">
              {/* Base UI renders the raw value by default; map it back to the label. */}
              <SelectValue>
                {(value: string) => modelName(value)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {allModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex flex-col items-start">
                    <span className="font-mono text-[13px]">{modelName(m.id)}</span>
                    <span className="text-xs text-muted-foreground">
                      {modelOwner(m.id)} ·{" "}
                      {cache[tokenizerRepo(m.id, allModels)]?.cached ? "downloaded" : m.download}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AddModel models={allModels} onAdd={addModel} />

          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <ModelStorage
          spec={spec ?? MODELS[0]}
          models={allModels}
          onForget={spec?.custom ? () => forgetModel(spec.id) : undefined}
          load={load}
          entry={cache[repo]}
          cache={cache}
          onDownload={download}
          onRemove={() => remove(repo)}
          onRemoveAll={removeAll}
        />

        {result && <StatsBar stats={result.stats} stale={encoding} />}

        {/* Stretch is safe now the textarea is a fixed height: it was `flex-1`
            filling the stretched row that used to grow the page on a paste. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Input</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste or type text to tokenize…"
                spellCheck={false}
                className={cn(PANEL_H, "resize-y font-mono text-[13px] leading-relaxed")}
              />
              <div className="flex flex-wrap items-center gap-2">
                {SAMPLES.map((s) => (
                  <Button key={s.label} size="sm" variant="outline" onClick={() => setText(s.text)}>
                    {s.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setText("")}
                  disabled={!text}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="text-sm font-medium">Tokens</CardTitle>
              {load.status === "ready" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {load.vocabSize.toLocaleString()} vocab
                  </Badge>
                  {load.tokenizerClass && (
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {load.tokenizerClass}
                    </Badge>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1">
              {load.status !== "ready" ? (
                <p className="text-sm text-muted-foreground">
                  {load.status === "idle"
                    ? "Download this tokenizer to see how it splits your text."
                    : load.status === "error"
                      ? "No tokenizer loaded."
                      : "Loading tokenizer…"}
                </p>
              ) : !result ? (
                <p className="text-sm text-muted-foreground">Tokenizing…</p>
              ) : result.pieces.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to tokenize yet.</p>
              ) : (
                <Tabs defaultValue="text">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <TabsList>
                      <TabsTrigger value="text">Text</TabsTrigger>
                      <TabsTrigger value="ids">IDs</TabsTrigger>
                    </TabsList>
                    <div className="ml-2 flex items-center gap-2">
                      <Switch
                        id="stop-token"
                        checked={includeStop}
                        onCheckedChange={toggleStop}
                      />
                      <Label htmlFor="stop-token" className="text-xs font-normal">
                        Stop token
                      </Label>
                    </div>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={copyIds}>
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      Copy IDs
                    </Button>
                  </div>
                  <TabsContent value="text">
                    <div className={cn(PANEL_H, "overflow-y-auto")}>
                      <TokenStream pieces={result.pieces} />
                    </div>
                  </TabsContent>
                  <TabsContent value="ids">
                    <div className={cn(PANEL_H, "overflow-y-auto")}>
                      <TokenIds pieces={result.pieces} />
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        {result && result.stats.byteTokens > 0 && (
          <p className="text-xs text-muted-foreground">
            {result.stats.byteTokens.toLocaleString()} token
            {result.stats.byteTokens === 1 ? "" : "s"} decode to a partial UTF-8 sequence — this
            vocabulary splits some characters mid-byte, so the raw vocab entry is shown instead.
          </p>
        )}

        {includeStop && (
          <p className="text-xs text-muted-foreground">
            Counting the stop token that ends a completion, so the total matches an API's{" "}
            <code className="font-mono">completion_tokens</code>. A model may stop on any of
            several tokens — Gemma 4 declares three — but every one of them is a single token,
            so the count is content + 1 either way.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Tokenizer files are fetched from the Hugging Face CDN and never leave your browser — the
          text you paste is not sent anywhere.
        </p>
      </main>
    </div>
  )
}
