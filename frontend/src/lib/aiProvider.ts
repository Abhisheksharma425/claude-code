import { useSyncExternalStore } from 'react'

export type AiProvider = 'openai' | 'anthropic'
export const PROVIDERS: readonly AiProvider[] = ['openai', 'anthropic']
export const PROVIDER_LABEL: Record<AiProvider, string> = { openai: 'OpenAI', anthropic: 'Claude' }
/** What to add to backend/.env for each provider; shown when it isn't set up. */
export const PROVIDER_ENV: Record<AiProvider, string> = { openai: 'OPENAI_API_KEY and OPENAI_MODEL', anthropic: 'ANTHROPIC_API_KEY and ANTHROPIC_MODEL' }

export type Ready = Partial<Record<AiProvider, boolean>>

const STORAGE_KEY = 'ai-provider'

export const isProvider = (v: unknown): v is AiProvider => v === 'openai' || v === 'anthropic'

/**
 * Which AI to use when the user hasn't chosen one yet: the backend's default if it is set up,
 * otherwise whichever one is set up, otherwise OpenAI (the backend will explain what's missing).
 */
export function pickDefault(backendDefault: unknown, ready: Ready): AiProvider {
  if (isProvider(backendDefault) && ready[backendDefault]) return backendDefault
  return PROVIDERS.find((p) => ready[p]) ?? (isProvider(backendDefault) ? backendDefault : 'openai')
}

interface Snapshot {
  provider: AiProvider
  ready: Ready
}

function readStored(): AiProvider | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isProvider(v) ? v : null
  } catch {
    return null
  }
}

let stored = readStored()
let snapshot: Snapshot = { provider: stored ?? 'openai', ready: {} }
let loaded = false
const listeners = new Set<() => void>()
const set = (next: Snapshot) => {
  snapshot = next
  listeners.forEach((l) => l())
}

/** Asks the backend which AIs have a key (once). If it can't be reached, both stay selectable. */
async function loadReady() {
  if (loaded) return
  loaded = true
  try {
    const res = await fetch('/api/health')
    const body = (await res.json()) as { provider?: unknown; providers?: Record<string, unknown> }
    const ready: Ready = {}
    for (const p of PROVIDERS) ready[p] = body.providers?.[p] === true
    set({ provider: stored ?? pickDefault(body.provider, ready), ready })
  } catch {
    // backend not running: the explain request will say so
  }
}

export function setProvider(p: AiProvider) {
  stored = p
  try {
    localStorage.setItem(STORAGE_KEY, p)
  } catch {
    // private mode etc.: the choice still works for this visit
  }
  set({ ...snapshot, provider: p })
}

/** The AI that explains positions (OpenAI or Claude), remembered per browser. */
export function useAiProvider() {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      void loadReady()
      return () => listeners.delete(cb)
    },
    () => snapshot,
  )
  return { provider: snap.provider, ready: snap.ready, setProvider }
}
