import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Vista de usuario experto: entrada propia (expert.html) en su propio puerto,
// separada de la vista común (vite.config.ts, puerto 5173).
const EXPERT_PAGE = '/expert.html'

// Sirve expert.html en la raíz, así http://localhost:5174 abre la vista experta.
function expertAsRoot(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url === '/' || req.url === '/index.html') req.url = EXPERT_PAGE
    next()
  }
  return {
    name: 'expert-as-root',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

export default defineConfig({
  plugins: [react(), expertAsRoot()],
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  build: {
    outDir: 'dist-expert',
    rollupOptions: { input: 'expert.html' },
  },
})
