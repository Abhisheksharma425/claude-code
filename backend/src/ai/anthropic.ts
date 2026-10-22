import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, CompletionRequest } from './provider.js'
import { AIError } from './types.js'

interface Options {
  apiKey: string
  model: string
  baseURL?: string
}

/** Turns an Anthropic SDK error into a message a beginner can act on. Never includes the key. */
export function mapAnthropicError(e: unknown, model: string): AIError {
  if (e instanceof AIError) return e
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new AIError('timeout', 'Claude took too long to answer. Please try again.', 504)
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new AIError('unavailable', "Couldn't reach Claude. Check your internet connection and try again.", 503)
  }
  if (e instanceof Anthropic.APIError) {
    const status = e.status
    if (status === 401) {
      return new AIError('bad_key', 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in your .env file, then restart the backend.', 401)
    }
    if (status === 403) {
      return new AIError('bad_key', "Your Anthropic key isn't allowed to use this model. Check ANTHROPIC_API_KEY and ANTHROPIC_MODEL.", 403)
    }
    if (status === 404) {
      return new AIError('bad_model', `Anthropic doesn't know the model "${model}", or your key can't use it. Check ANTHROPIC_MODEL in your .env file.`, 400)
    }
    if (status === 429) {
      return new AIError('rate_limit', "Anthropic says you're sending requests too fast (rate limit). Wait a moment and try again.", 429)
    }
    if (status === 400 || status === 422) {
      // Anthropic reports an empty account balance as a 400.
      if (/credit balance|billing/i.test(e.message)) {
        return new AIError(
          'no_credit',
          'Your Anthropic account has no credit left. Add credit at console.anthropic.com (Plans & Billing), then try again.',
          402,
        )
      }
      return new AIError('bad_request', `Claude couldn't process the request (${e.message}). If you changed ANTHROPIC_MODEL, pick a model that supports structured outputs.`, 400)
    }
    if (status === 529 || (status !== undefined && status >= 500)) {
      return new AIError('unavailable', 'Claude is having problems or is overloaded right now. Please try again in a minute.', 503)
    }
  }
  return new AIError('unavailable', 'Something went wrong while asking the AI. Please try again.', 500)
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic'
  private client: Anthropic
  private model: string

  constructor({ apiKey, model, baseURL }: Options) {
    this.model = model
    this.client = new Anthropic({ apiKey, baseURL, maxRetries: 1, timeout: 90_000 })
  }

  async complete(req: CompletionRequest): Promise<string> {
    try {
      const res = await this.client.messages.create({
        model: this.model,
        // Room for the answer plus any thinking the model does first.
        max_tokens: 16_000,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        // Structured outputs: the reply must be JSON matching the schema.
        output_config: { format: { type: 'json_schema', schema: req.schema } },
      })
      if (res.stop_reason === 'refusal') {
        throw new AIError('refused', 'The AI declined to answer this one. Try again or pick another position.', 502)
      }
      if (res.stop_reason === 'max_tokens') {
        throw new AIError('bad_response', 'The AI ran out of space before finishing. Please try again.', 502)
      }
      const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
      if (!text.trim()) throw new AIError('bad_response', 'The AI sent back an empty answer. Please try again.', 502)
      return text
    } catch (e) {
      throw mapAnthropicError(e, this.model)
    }
  }
}
