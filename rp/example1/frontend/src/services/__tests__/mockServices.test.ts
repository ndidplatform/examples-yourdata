import { describe, it, expect } from 'vitest'
import { ConsentServiceMock } from '../consent/ConsentServiceMock'
import { DataProviderServiceMock } from '../dp/DataProviderServiceMock'
import { IdentityProviderServiceMock } from '../idp/IdentityProviderServiceMock'

describe('ConsentServiceMock', () => {
  const service = new ConsentServiceMock()

  it('initConsentRequest returns referenceId and requestId strings', async () => {
    const result = await service.initConsentRequest({
      referenceId: 'ref-test',
      purpose: 'test',
      dcName: 'Test DC',
      requestMessage: 'Test message',
      selectedDPs: [],
      selectedIdPId: 'idp-test',
    })
    expect(typeof result.referenceId).toBe('string')
    expect(result.referenceId.length).toBeGreaterThan(0)
    expect(typeof result.requestId).toBe('string')
    expect(result.requestId.length).toBeGreaterThan(0)
  })

  it('getPreConsentStatus returns "complete"', async () => {
    const result = await service.getPreConsentStatus('ref-test')
    expect(result).toBe('complete')
  })

  it('completeConsent returns consentedAccountIds list', async () => {
    const result = await service.completeConsent({
      referenceId: 'ref-test',
      requestId: 'req-test',
      selectedDPs: [],
      selectedAccounts: [],
    })
    expect(Array.isArray(result.consentedAccountIds)).toBe(true)
    expect(result.consentedAccountIds.length).toBeGreaterThan(0)
  })
})

describe('DataProviderServiceMock', () => {
  const service = new DataProviderServiceMock()

  it('getDPList returns non-empty array', async () => {
    const result = await service.getDPList()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('getDPAccounts returns array for a known dpId', async () => {
    const result = await service.getDPAccounts('bank-a', 'ref-test')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('getDPAccounts returns empty array for unknown dpId', async () => {
    const result = await service.getDPAccounts('unknown-bank', 'ref-test')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
  })
})

describe('IdentityProviderServiceMock', () => {
  const service = new IdentityProviderServiceMock()

  it('getIdPList returns non-empty array', async () => {
    const result = await service.getIdPList()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })
})
