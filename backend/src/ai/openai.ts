import OpenAI from 'openai'
import type { AIProvider, CompletionRequest } from './provider.js'
import { AIError } from './types.js'

interface Options {
  apiKey: string
  model: string
  baseURL?: string
}

/** Turns an OpenAI SDK error into a message a beginner can act on. Never includes the key. */
export function mapOpenAIError(e: unknown, model: string): AIError {
  if (e instanceof AIError) return e
  if (e instanceof OpenAI.APIConnectionTimeoutError) {
    return new AIError('timeout', 'OpenAI took too long to answer. Please try again.', 504)
  }
  if (e instanceof OpenAI.APIConnectionError) {
    return new AIError('unavailable', "Couldn't reach OpenAI. Check your internet connection and try again.", 503)
  }
  if (e instanceof OpenAI.APIError) {
    const status = e.status
    if (status === 401) {
      return new AIError('bad_key', 'OpenAI rejected the API key. Check OPENAI_API_KEY in your .env file, then restart the backend.', 401)
    }
    if (status === 403) {
      return new AIError('bad_key', "Your OpenAI key isn't allowed to use this model or project. Check OPENAI_API_KEY and OPENAI_MODEL.", 403)
    }
    if (status === 429) {
      if (e.code === 'insufficient_quota' || e.type === 'insufficient_quota') {
        return new AIError(
          'no_credit',
          'Your OpenAI account has no credit left. Add credit or a payment method at platform.openai.com, then try again.',
          402,
        )
      }
      return new AIError('rate_limit', "OpenAI says you're sending requests too fast (rate limit). Wait a moment and try again.", 429)
    }
    if (status === 404 || e.code === 'model_not_found') {
      return new AIError('bad_model', `OpenAI doesn't know the model "${model}", or your key can't use it. Check OPENAI_MODEL in your .env file.`, 400)
    }
    if (status === 400 || status === 422) {
      return new AIError('bad_request', `OpenAI couldn't process the request (${e.message}). If you changed OPENAI_MODEL, pick a model that supports structured outputs.`, 400)
    }
    if (status !== undefined && status >= 500) {
      return new AIError('unavailable', 'OpenAI is having problems right now. Please try again in a minute.', 503)
    }
  }
  return new AIError('unavailable', 'Something went wrong while asking the AI. Please try again.', 500)
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai'
  private client: OpenAI
  private model: string

  constructor({ apiKey, model, baseURL }: Options) {
    this.model = model
    this.client = new OpenAI({ apiKey, baseURL, maxRetries: 1, timeout: 60_000 })
  }

  async complete(req: CompletionRequest): Promise<string> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        // Structured outputs: the model must return JSON matching the schema.
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.schemaName, strict: true, schema: req.schema },
        },
      })
      const choice = res.choices[0]
      if (choice?.message?.refusal) {
        throw new AIError('refused', 'The AI declined to answer this one. Try again or pick another position.', 502)
      }
      if (choice?.finish_reason === 'length') {
        throw new AIError('bad_response', 'The AI ran out of space before finishing. Please try again.', 502)
      }
      const content = choice?.message?.content
      if (!content) throw new AIError('bad_response', 'The AI sent back an empty answer. Please try again.', 502)
      return content
    } catch (e) {
      throw mapOpenAIError(e, this.model)
    }
  }
}
