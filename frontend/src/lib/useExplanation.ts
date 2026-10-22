import { useCallback, useEffect, useRef, useState } from 'react'
import { ExplainFailure, fetchExplanation } from './explainApi'
import type { ExplainError, ExplainRequest, Explanation } from './explainTypes'

export type ExplanationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; data: Explanation }
  | { status: 'error'; error: ExplainError }

// One answer per position (and move/viewer), so going back to a position never costs another API call.
const cache = new Map<string, Explanation>()

export function useExplanation(key: string | null) {
  const [state, setState] = useState<ExplanationState>({ status: 'idle' })
  const controller = useRef<AbortController | null>(null)

  // Position changed: drop any request in flight and show the cached answer if there is one.
  useEffect(() => {
    controller.current?.abort()
    const hit = key ? cache.get(key) : undefined
    setState(hit ? { status: 'done', data: hit } : { status: 'idle' })
    return () => controller.current?.abort()
  }, [key])

  const request = useCallback(
    async (req: ExplainRequest) => {
      if (!key) return
      controller.current?.abort()
      const c = new AbortController()
      controller.current = c
      setState({ status: 'loading' })
      try {
        const data = await fetchExplanation(req, c.signal)
        if (c.signal.aborted) return
        cache.set(key, data)
        setState({ status: 'done', data })
      } catch (e) {
        if (c.signal.aborted) return
        setState({
          status: 'error',
          error: e instanceof ExplainFailure ? e.info : { code: 'unknown', message: 'Something went wrong. Please try again.' },
        })
      }
    },
    [key],
  )

  return { state, request }
}
