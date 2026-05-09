/**
 * taxNumber.test.ts — VKN/TCKN validation ve normalizasyon testleri (Faz 7.3.50A.3.3)
 *
 * T_TAX1  — isValidTaxNumber: 10 haneli rakam → true
 * T_TAX2  — isValidTaxNumber: 11 haneli rakam → true
 * T_TAX3  — isValidTaxNumber: 9 haneli → false
 * T_TAX4  — isValidTaxNumber: 12 haneli → false
 * T_TAX5  — isValidTaxNumber: boş string → false
 * T_TAX6  — isValidTaxNumber: null → false
 * T_TAX7  — isValidTaxNumber: undefined → false
 * T_TAX8  — isValidTaxNumber: harf içeren → false
 * T_TAX9  — isValidOptionalTaxNumber: null → true
 * T_TAX10 — isValidOptionalTaxNumber: undefined → true
 * T_TAX11 — isValidOptionalTaxNumber: boş string → true
 * T_TAX12 — isValidOptionalTaxNumber: 10 haneli → true
 * T_TAX13 — isValidOptionalTaxNumber: 11 haneli → true
 * T_TAX14 — isValidOptionalTaxNumber: 9 haneli → false
 * T_TAX15 — normalizeTaxNumber: null → null
 * T_TAX16 — normalizeTaxNumber: boş string → null
 * T_TAX17 — normalizeTaxNumber: trim ve dolu değer → string döner
 */

import {
  isValidTaxNumber,
  isValidOptionalTaxNumber,
  normalizeTaxNumber,
} from './taxNumber'

// ─── isValidTaxNumber ─────────────────────────────────────────────────────────

describe('isValidTaxNumber', () => {

  test('T_TAX1 — 10 haneli rakam → true', () => {
    expect(isValidTaxNumber('1234567890')).toBe(true)
  })

  test('T_TAX2 — 11 haneli rakam → true', () => {
    expect(isValidTaxNumber('12345678901')).toBe(true)
  })

  test('T_TAX3 — 9 haneli → false', () => {
    expect(isValidTaxNumber('123456789')).toBe(false)
  })

  test('T_TAX4 — 12 haneli → false', () => {
    expect(isValidTaxNumber('123456789012')).toBe(false)
  })

  test('T_TAX5 — boş string → false', () => {
    expect(isValidTaxNumber('')).toBe(false)
  })

  test('T_TAX6 — null → false', () => {
    expect(isValidTaxNumber(null)).toBe(false)
  })

  test('T_TAX7 — undefined → false', () => {
    expect(isValidTaxNumber(undefined)).toBe(false)
  })

  test('T_TAX8 — harf içeren değer → false', () => {
    expect(isValidTaxNumber('123ABC7890')).toBe(false)
  })

})

// ─── isValidOptionalTaxNumber ─────────────────────────────────────────────────

describe('isValidOptionalTaxNumber', () => {

  test('T_TAX9  — null → true (opsiyonel boş kabul edilir)', () => {
    expect(isValidOptionalTaxNumber(null)).toBe(true)
  })

  test('T_TAX10 — undefined → true', () => {
    expect(isValidOptionalTaxNumber(undefined)).toBe(true)
  })

  test('T_TAX11 — boş string → true', () => {
    expect(isValidOptionalTaxNumber('')).toBe(true)
  })

  test('T_TAX12 — 10 haneli rakam → true', () => {
    expect(isValidOptionalTaxNumber('1234567890')).toBe(true)
  })

  test('T_TAX13 — 11 haneli rakam → true', () => {
    expect(isValidOptionalTaxNumber('12345678901')).toBe(true)
  })

  test('T_TAX14 — 9 haneli → false', () => {
    expect(isValidOptionalTaxNumber('123456789')).toBe(false)
  })

})

// ─── normalizeTaxNumber ───────────────────────────────────────────────────────

describe('normalizeTaxNumber', () => {

  test('T_TAX15 — null → null', () => {
    expect(normalizeTaxNumber(null)).toBeNull()
  })

  test('T_TAX16 — boş string → null', () => {
    expect(normalizeTaxNumber('')).toBeNull()
  })

  test('T_TAX17 — trim edilmiş dolu değer → string döner', () => {
    expect(normalizeTaxNumber('  1234567890  ')).toBe('1234567890')
  })

})
