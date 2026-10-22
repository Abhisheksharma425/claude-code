import './env.js'
import { createApp } from './app.js'
import { createProvider, type AIProvider } from './ai/provider.js'

let provider: AIProvider | null = null
const getProvider = () => (provider ??= createProvider(process.env))

const app = createApp(getProvider, process.env.AI_PROVIDER ?? 'openai')
const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  let status = 'ready'
  try {
    getProvider()
  } catch (e) {
    status = e instanceof Error ? e.message : 'not configured'
  }
  console.log(`Backend listening on http://localhost:${port} (AI: ${status})`)
})
