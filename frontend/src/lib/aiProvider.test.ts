import { describe, expect, it } from 'vitest'
import { pickDefault } from './aiProvider'

describe('pickDefault', () => {
  it('uses the backend default when it is set up', () => {
    expect(pickDefault('anthropic', { openai: true, anthropic: true })).toBe('anthropic')
    expect(pickDefault('openai', { openai: true, anthropic: true })).toBe('openai')
  })
  it('falls back to the one that is set up', () => {
    expect(pickDefault('openai', { openai: false, anthropic: true })).toBe('anthropic')
    expect(pickDefault('anthropic', { openai: true, anthropic: false })).toBe('openai')
  })
  it('keeps the backend default (or OpenAI) when nothing is set up, so its error message explains what is missing', () => {
    expect(pickDefault('anthropic', { openai: false, anthropic: false })).toBe('anthropic')
    expect(pickDefault(undefined, {})).toBe('openai')
    expect(pickDefault('wat', { openai: false, anthropic: false })).toBe('openai')
  })
})
