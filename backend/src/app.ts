import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { explain } from './ai/explain.js'
import { isProviderName, PROVIDER_NAMES, type AIProvider } from './ai/provider.js'
import { AIError } from './ai/types.js'
import { validateExplainRequest, ValidationError } from './ai/validate.js'

/**
 * `getProvider` is called per request so a missing key gives a clear error instead of crashing the server.
 * The browser may name the provider it wants ("openai" or "anthropic"); without a name the default is used.
 */
export function createApp(getProvider: (name?: string) => AIProvider, providerName = 'openai') {
  const app = express()
  app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (_req, res) => {
    const ready = (name?: string) => {
      try {
        getProvider(name)
        return true
      } catch {
        return false
      }
    }
    res.json({
      ok: true,
      provider: providerName,
      configured: ready(),
      providers: Object.fromEntries(PROVIDER_NAMES.map((n) => [n, ready(n)])),
    })
  })

  app.post('/api/explain', async (req, res) => {
    try {
      const wanted = (req.body as { provider?: unknown } | null)?.provider
      if (wanted !== undefined && !isProviderName(wanted)) throw new ValidationError(`"provider" must be one of: ${PROVIDER_NAMES.join(', ')}.`)
      const request = validateExplainRequest(req.body)
      const explanation = await explain(getProvider(wanted), request)
      res.json(explanation)
    } catch (e) {
      if (e instanceof ValidationError) {
        res.status(400).json({ error: { code: 'bad_request', message: `Bad request: ${e.message}` } })
      } else if (e instanceof AIError) {
        console.error(`[explain] ${e.code} (${e.status})`)
        res.status(e.status).json({ error: { code: e.code, message: e.message } })
      } else {
        console.error('[explain] unexpected error:', e instanceof Error ? e.name : 'unknown')
        res.status(500).json({ error: { code: 'unavailable', message: 'Something went wrong on the server. Please try again.' } })
      }
    }
  })

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const tooBig = err?.type === 'entity.too.large'
    res.status(tooBig ? 413 : 400).json({
      error: { code: 'bad_request', message: tooBig ? 'Request too large.' : 'The request body was not valid JSON.' },
    })
  }
  app.use(onError)
  return app
}
