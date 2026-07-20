import { describe, it, expect } from 'vitest'
import { validateDPCount, validateConsentPeriod } from './consentValidator'
import type { SelectedDP } from '@/domain/types'

const makeDP = (id: string): SelectedDP => ({
  dpId: id,
  dpName: `ธนาคาร ${id}`,
  tcAccepted: true,
  selectedDatasets: [],
})

describe('validateDPCount', () => {
  it('passes when DP count is exactly 7', () => {
    const dps = Array.from({ length: 7 }, (_, i) => makeDP(String(i)))
    expect(validateDPCount(dps).valid).toBe(true)
  })

  it('passes when DP count is below 7', () => {
    expect(validateDPCount([makeDP('1'), makeDP('2')]).valid).toBe(true)
  })

  it('fails when DP count exceeds 7', () => {
    const dps = Array.from({ length: 8 }, (_, i) => makeDP(String(i)))
    const result = validateDPCount(dps)
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('error message mentions the limit', () => {
    const dps = Array.from({ length: 8 }, (_, i) => makeDP(String(i)))
    expect(validateDPCount(dps).error).toContain('7')
  })
})

describe('validateConsentPeriod', () => {
  it('passes for 1 month', () => {
    expect(validateConsentPeriod(1).valid).toBe(true)
  })

  it('passes for 12 months', () => {
    expect(validateConsentPeriod(12).valid).toBe(true)
  })

  it('fails for 0 months', () => {
    expect(validateConsentPeriod(0).valid).toBe(false)
  })

  it('fails for 13 months', () => {
    expect(validateConsentPeriod(13).valid).toBe(false)
  })
})
