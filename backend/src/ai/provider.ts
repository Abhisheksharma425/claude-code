import { AnthropicProvider } from './anthropic.js'
import { OpenAIProvider } from './openai.js'
import { AIError } from './types.js'

export interface CompletionRequest {
  system: string
  user: string
  /** Name and JSON Schema of the JSON object the model must return. */
  schemaName: string
  schema: Record<string, unknown>
}

/**
 * Anything that can turn a prompt into a JSON string. To add another provider (Gemini, a local model…):
 * implement this interface, add its name to `PROVIDER_NAMES` and a case to `createProvider`.
 */
export interface AIProvider {
  readonly name: string
  /** Returns the model's reply as a JSON string. Throws AIError with a user-friendly message on failure. */
  complete(req: CompletionRequest): Promise<string>
}

export const PROVIDER_NAMES = ['openai', 'anthropic'] as const
export type ProviderName = (typeof PROVIDER_NAMES)[number]

export function isProviderName(v: unknown): v is ProviderName {
  return typeof v === 'string' && (PROVIDER_NAMES as readonly string[]).includes(v)
}

/** The provider used when the browser doesn't pick one (AI_PROVIDER, else OpenAI). */
export function defaultProviderName(env: NodeJS.ProcessEnv = process.env): string {
  return (env.AI_PROVIDER ?? 'openai').toLowerCase()
}

/** `name` is the provider the user picked in the app; without it AI_PROVIDER decides. */
export function createProvider(env: NodeJS.ProcessEnv = process.env, name: string = defaultProviderName(env)): AIProvider {
  switch (name) {
    case 'openai': {
      const apiKey = env.OPENAI_API_KEY?.trim()
      const model = env.OPENAI_MODEL?.trim()
      if (!apiKey || !model) {
        throw new AIError(
          'not_configured',
          'OpenAI isn\'t set up yet: add OPENAI_API_KEY and OPENAI_MODEL to backend/.env and restart the backend (or pick another AI in the app).',
          503,
        )
      }
      return new OpenAIProvider({ apiKey, model, baseURL: env.OPENAI_BASE_URL?.trim() || undefined })
    }
    case 'anthropic': {
      const apiKey = env.ANTHROPIC_API_KEY?.trim()
      const model = env.ANTHROPIC_MODEL?.trim()
      if (!apiKey || !model) {
        throw new AIError(
          'not_configured',
          'Claude isn\'t set up yet: add ANTHROPIC_API_KEY and ANTHROPIC_MODEL to backend/.env and restart the backend (or pick another AI in the app).',
          503,
        )
      }
      return new AnthropicProvider({ apiKey, model, baseURL: env.ANTHROPIC_BASE_URL?.trim() || undefined })
    }
    default:
      throw new AIError('not_configured', `Unknown AI provider "${name}". Supported: ${PROVIDER_NAMES.join(', ')}.`, 503)
  }
}
