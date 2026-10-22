import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { sampleRequest, goodAnswer, goodModelAnswer } from './ai/fixtures.js'
import type { AIProvider } from './ai/provider.js'
import { AIError } from './ai/types.js'

describe('HTTP API', () => {
  let server: Server
  let base: string
  let provider: AIProvider | AIError = { name: 'fake', complete: async () => JSON.stringify(goodModelAnswer) }

  beforeAll(async () => {
    const app = createApp(() => {
      if (provider instanceof AIError) throw provider
      return provider
    })
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s))
    })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  const post = (body: unknown, raw = false) =>
    fetch(`${base}/api/explain`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body) })

  it('explains', async () => {
    const res = await post(sampleRequest)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(goodAnswer)
  })

  it('health reports whether the AI is configured', async () => {
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true, provider: 'openai', configured: true })
    provider = new AIError('not_configured', 'Add your key.', 503)
    expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({ ok: true, configured: false })
    const res = await post(sampleRequest)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: { code: 'not_configured', message: 'Add your key.' } })
    provider = { name: 'fake', complete: async () => JSON.stringify(goodModelAnswer) }
  })

  it('passes provider errors to the browser with their code', async () => {
    provider = { name: 'fake', complete: async () => { throw new AIError('rate_limit', 'Slow down.', 429) } }
    const res = await post(sampleRequest)
    expect(res.status).toBe(429)
    expect((await res.json()).error.code).toBe('rate_limit')
    provider = { name: 'fake', complete: async () => JSON.stringify(goodModelAnswer) }
  })

  it('rejects bad bodies', async () => {
    expect((await post({ fen: 'x' })).status).toBe(400)
    const bad = await post('{not json', true)
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.message).toMatch(/valid JSON/)
    const huge = await post(JSON.stringify({ pad: 'x'.repeat(200_000) }), true)
    expect(huge.status).toBe(413)
  })

  it('turns unexpected crashes into a generic error without details', async () => {
    provider = { name: 'fake', complete: async () => { throw new Error('secret internal detail') } }
    const res = await post(sampleRequest)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret internal detail')
  })
})
