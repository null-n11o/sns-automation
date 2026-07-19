// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { maskSecrets } from '@/lib/publish-log'

describe('maskSecrets', () => {
  it('masks token-like keys recursively', () => {
    const input = {
      id: 'post-1',
      access_token: 'secret-token',
      nested: { api_key: 'k', api_secret: 's', label: 'ok' },
      list: [{ token: 't' }, { safe: 'v' }],
    }
    expect(maskSecrets(input)).toEqual({
      id: 'post-1',
      access_token: '***',
      nested: { api_key: '***', api_secret: '***', label: 'ok' },
      list: [{ token: '***' }, { safe: 'v' }],
    })
  })

  it('leaves non-secret values untouched', () => {
    expect(maskSecrets({ error: { message: 'nope' } })).toEqual({
      error: { message: 'nope' },
    })
  })

  it('passes through primitives and null', () => {
    expect(maskSecrets('hello')).toBe('hello')
    expect(maskSecrets(null)).toBe(null)
    expect(maskSecrets(42)).toBe(42)
  })
})
