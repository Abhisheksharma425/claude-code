import { PROVIDERS, PROVIDER_ENV, PROVIDER_LABEL, useAiProvider } from '../lib/aiProvider'

/** "Explained by: OpenAI | Claude". A provider the backend has no key for is disabled and says what to add. */
export default function ProviderPicker() {
  const { provider, ready, setProvider } = useAiProvider()
  return (
    <div className="provider-picker">
      <span className="muted" id="provider-label">Explained by</span>
      <div className="segmented" role="group" aria-labelledby="provider-label">
        {PROVIDERS.map((p) => {
          const off = ready[p] === false
          return (
            <button
              key={p}
              className={provider === p ? 'active' : ''}
              aria-pressed={provider === p}
              disabled={off}
              title={off ? `Not set up: add ${PROVIDER_ENV[p]} to backend/.env and restart the backend.` : undefined}
              onClick={() => setProvider(p)}
            >
              {PROVIDER_LABEL[p]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
