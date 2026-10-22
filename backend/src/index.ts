import './env.js'
import { createApp } from './app.js'
import { createProvider, defaultProviderName, PROVIDER_NAMES, type AIProvider } from './ai/provider.js'

// One provider object per name, created on first use, so the app can switch between OpenAI and Claude per request.
const providers = new Map<string, AIProvider>()
const getProvider = (name: string = defaultProviderName(process.env)) => {
  let p = providers.get(name)
  if (!p) {
    p = createProvider(process.env, name)
    providers.set(name, p)
  }
  return p
}

const app = createApp(getProvider, defaultProviderName(process.env))
const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  const status = PROVIDER_NAMES.map((name) => {
    try {
      getProvider(name)
      return `${name}: ready`
    } catch {
      return `${name}: not set up`
    }
  }).join(', ')
  console.log(`Backend listening on http://localhost:${port} (AI: ${status}; default ${defaultProviderName(process.env)})`)
})
