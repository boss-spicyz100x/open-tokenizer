import { useState } from "react"
import { AlertCircle, Check, Copy, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
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
import { StatsBar } from "@/components/stats-bar"
import { ThemeToggle } from "@/components/theme-toggle"
import { TokenIds, TokenStream } from "@/components/token-stream"
import { useTokenizer } from "@/hooks/use-tokenizer"
import { DEFAULT_MODEL, MODELS } from "@/lib/models"

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
  const [text, setText] = useState(SAMPLES[1].text)
  const [copied, setCopied] = useState(false)
  const { load, result, encoding, retry } = useTokenizer(modelId, text)

  const spec = MODELS.find((m) => m.id === modelId)

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
                {(value: string) => MODELS.find((m) => m.id === value)?.label ?? value}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex flex-col items-start">
                    <span>{m.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.maker} · {m.download}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {load.status === "loading" && (
          <Card>
            <CardContent className="space-y-3 py-5">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                <span>
                  Downloading the {spec?.label} tokenizer ({spec?.download}) — cached by the browser
                  after this.
                </span>
              </div>
              <Progress value={load.progress} />
            </CardContent>
          </Card>
        )}

        {load.status === "error" && (
          <Card className="border-destructive/50">
            <CardContent className="flex flex-wrap items-center gap-3 py-5 text-sm">
              <AlertCircle className="size-4 text-destructive" />
              <span className="mr-auto">Could not load this tokenizer: {load.message}</span>
              <Button size="sm" variant="outline" onClick={retry}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {result && <StatsBar stats={result.stats} stale={encoding} />}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Input</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste or type text to tokenize…"
                spellCheck={false}
                className="min-h-[320px] flex-1 resize-y font-mono text-[13px] leading-relaxed"
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
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium">Tokens</CardTitle>
              {load.status === "ready" && (
                <div className="flex items-center gap-2">
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
              {!result ? (
                <p className="text-sm text-muted-foreground">
                  {load.status === "error" ? "No tokenizer loaded." : "Loading tokenizer…"}
                </p>
              ) : result.pieces.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to tokenize yet.</p>
              ) : (
                <Tabs defaultValue="text">
                  <div className="mb-3 flex items-center gap-2">
                    <TabsList>
                      <TabsTrigger value="text">Text</TabsTrigger>
                      <TabsTrigger value="ids">IDs</TabsTrigger>
                    </TabsList>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={copyIds}>
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      Copy IDs
                    </Button>
                  </div>
                  <TabsContent value="text">
                    <TokenStream pieces={result.pieces} />
                  </TabsContent>
                  <TabsContent value="ids">
                    <TokenIds pieces={result.pieces} />
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

        {spec && (
          <p className="text-xs text-muted-foreground">
            {spec.note}. Tokenizer files are fetched from the Hugging Face CDN and never leave your
            browser — the text you paste is not sent anywhere.
          </p>
        )}
      </main>
    </div>
  )
}
