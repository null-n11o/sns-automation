// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt } from '@/lib/crypto'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64) // 32-byte hex key for testing
})

describe('crypto', () => {
  it('encrypts and decrypts a string', () => {
    const original = 'my-secret-api-key'
    const encrypted = encrypt(original)
    expect(encrypted).not.toBe(original)
    expect(decrypt(encrypted)).toBe(original)
  })

  it('produces different ciphertext for same input (random IV)', () => {
    const encrypted1 = encrypt('same-value')
    const encrypted2 = encrypt('same-value')
    expect(encrypted1).not.toBe(encrypted2)
  })

  it('encrypted value contains three colon-separated parts', () => {
    const encrypted = encrypt('test')
    expect(encrypted.split(':')).toHaveLength(3)
  })
})
