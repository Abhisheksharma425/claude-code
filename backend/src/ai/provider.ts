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
 * Anything that can turn a prompt into a JSON string. To add another provider (Anthropic, Gemini, a local model…):
 * implement this interface, then add a case to `createProvider` and set AI_PROVIDER.
 */
export interface AIProvider {
  readonly name: string
  /** Returns the model's reply as a JSON string. Throws AIError with a user-friendly message on failure. */
  complete(req: CompletionRequest): Promise<string>
}

export function createProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  const name = (env.AI_PROVIDER ?? 'openai').toLowerCase()
  switch (name) {
    case 'openai': {
      const apiKey = env.OPENAI_API_KEY?.trim()
      const model = env.OPENAI_MODEL?.trim()
      if (!apiKey || !model) {
        throw new AIError(
          'not_configured',
          'The AI isn\'t set up yet: add OPENAI_API_KEY and OPENAI_MODEL to backend/.env and restart the backend.',
          503,
        )
      }
      return new OpenAIProvider({ apiKey, model, baseURL: env.OPENAI_BASE_URL?.trim() || undefined })
    }
    default:
      throw new AIError('not_configured', `Unknown AI_PROVIDER "${name}". Supported: openai.`, 503)
  }
}
