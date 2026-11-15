import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { FileStore } from './server/store.ts'
import { createApi } from './server/api.ts'
import { providers } from './server/providers.ts'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }
  return {
  plugins: [react(), {
    name: 'mission-api-local',
    configureServer(server) {
      const handler = createApi({ store: new FileStore(resolve('.mission-data')), ...providers(env) })
      server.middlewares.use('/api', async (req, res) => {
        try {
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of req) {
            size += chunk.length
            if (size > 1000000) { res.statusCode = 413; res.end('Petición demasiado grande'); return }
            chunks.push(Buffer.from(chunk))
          }
          const body = Buffer.concat(chunks)
          const request = new Request(`http://${req.headers.host}/api${req.url}`, {
            method: req.method, headers: req.headers as Record<string, string>,
            ...(body.length ? { body } : {}),
          })
          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(await response.text())
        } catch { res.statusCode = 500; res.end('{"error":"No se pudo atender la petición."}') }
      })
    },
  }],
  }
})
