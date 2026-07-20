import { describe, it, expect } from 'vitest'
import { buildConsentMessage } from './messageBuilder'
import type { ConsentMessageData } from '@/domain/types'

const baseData: ConsentMessageData = {
  purpose: 'พิจารณาอนุมัติสินเชื่อ',
  dcName: 'บริษัท ABC จำกัด',
  dpItems: [
    {
      dpName: 'ธนาคาร A',
      accountRef: 'XXX-001',
      datasets: [
        { name: 'รายการเดินบัญชีเงินฝาก', permission: 'รายการเดินบัญชี (แบบมีรายละเอียด)' },
      ],
    },
  ],
}

describe('buildConsentMessage', () => {
  it('includes the purpose in the title line', () => {
    const result = buildConsentMessage(baseData)
    expect(result).toContain('พิจารณาอนุมัติสินเชื่อ')
  })

  it('includes DC name', () => {
    const result = buildConsentMessage(baseData)
    expect(result).toContain('บริษัท ABC จำกัด')
  })

  it('includes DP name', () => {
    const result = buildConsentMessage(baseData)
    expect(result).toContain('ธนาคาร A')
  })

  it('includes account reference for each DP', () => {
    const result = buildConsentMessage(baseData)
    expect(result).toContain('XXX-001')
  })

  it('includes dataset name and permission', () => {
    const result = buildConsentMessage(baseData)
    expect(result).toContain('รายการเดินบัญชีเงินฝาก')
    expect(result).toContain('รายการเดินบัญชี (แบบมีรายละเอียด)')
  })

  it('numbers multiple DPs', () => {
    const data: ConsentMessageData = {
      ...baseData,
      dpItems: [
        { dpName: 'ธนาคาร A', accountRef: 'XXX-001', datasets: [{ name: 'ชุดข้อมูล A', permission: 'สิทธิ์ A' }] },
        { dpName: 'ธนาคาร B', accountRef: 'XXX-002', datasets: [{ name: 'ชุดข้อมูล B', permission: 'สิทธิ์ B' }] },
      ],
    }
    const result = buildConsentMessage(data)
    expect(result).toContain('1. ธนาคาร A')
    expect(result).toContain('2. ธนาคาร B')
  })

  it('does not include consent expiry date for one-time (no consentExpiryDate)', () => {
    const result = buildConsentMessage(baseData)
    expect(result).not.toContain('วันที่ Consent หมดอายุ')
  })

  it('includes consent expiry date when provided (recurring)', () => {
    const data: ConsentMessageData = { ...baseData, consentExpiryDate: '15/10/2569' }
    const result = buildConsentMessage(data)
    expect(result).toContain('15/10/2569')
  })

  it('returns a non-empty string', () => {
    expect(buildConsentMessage(baseData).length).toBeGreaterThan(50)
  })
})
