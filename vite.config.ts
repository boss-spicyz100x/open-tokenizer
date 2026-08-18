import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // See src/lib/onnx-stub.ts — keeps a 23 MB WASM binary out of the bundle.
      "onnxruntime-web/webgpu": new URL("./src/lib/onnx-stub.ts", import.meta.url).pathname,
    },
  },
  worker: { format: "es" },
  // host: true binds 0.0.0.0 so the dev server is reachable from other
  // devices on the LAN; strictPort keeps the URL stable rather than
  // silently hopping to the next free port.
  server: { host: true, port: 7788, strictPort: true },
  preview: { host: true, port: 7789, strictPort: true },
})
