import { MAX_DP_COUNT, MAX_CONSENT_PERIOD_MONTHS, MIN_CONSENT_PERIOD_MONTHS } from '@/domain/rules/consentRules'
import type { SelectedDP, ValidationResult } from '@/domain/types'

export function validateDPCount(dps: SelectedDP[]): ValidationResult {
  if (dps.length > MAX_DP_COUNT) {
    return { valid: false, error: `จำนวนผู้ให้บริการข้อมูลต้องไม่เกิน ${MAX_DP_COUNT} ราย` }
  }
  return { valid: true }
}

export function validateConsentPeriod(months: number): ValidationResult {
  if (months < MIN_CONSENT_PERIOD_MONTHS || months > MAX_CONSENT_PERIOD_MONTHS) {
    return {
      valid: false,
      error: `ระยะเวลาการให้ความยินยอมต้องอยู่ระหว่าง ${MIN_CONSENT_PERIOD_MONTHS} ถึง ${MAX_CONSENT_PERIOD_MONTHS} เดือน`,
    }
  }
  return { valid: true }
}
