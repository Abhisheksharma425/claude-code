import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // `npm run preview` (after a build) needs the same /api proxy as the dev server.
  preview: { proxy: { '/api': 'http://localhost:3001' } },
  server: {
    // `npm run dev:phone` sets this so a phone (or a tunnel's public host name) is allowed to use the dev server.
    allowedHosts: process.env.ALLOW_ALL_HOSTS === '1' ? true : undefined,
    // Step 5: the Express backend holds the OpenAI key; the browser only talks to /api.
    proxy: { '/api': 'http://localhost:3001' },
  },
  test: { environment: 'node' },
})
