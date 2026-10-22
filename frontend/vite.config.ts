import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Step 5: the Express backend holds the OpenAI key; the browser only talks to /api.
    proxy: { '/api': 'http://localhost:3001' },
  },
  test: { environment: 'node' },
})
