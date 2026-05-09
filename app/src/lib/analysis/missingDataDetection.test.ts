/**
 * missingDataDetection — Pure helper unit testleri (Faz 7.3.50A.10)
 *
 * T_MD1-T_MD7: detectMissingQuarterlySource çeşitli senaryolar
 */

import {
  detectMissingQuarterlySource,
  hasBalanceAccounts,
  hasIncomeAccounts,
} from './missingDataDetection'

describe('detectMissingQuarterlySource (Faz 7.3.50A.10)', () => {

  // T_MD1: Q4 + sadece bilanço kodları → BEYANNAME_MISSING
  test('T_MD1 — Q4 + [1xx/5xx] → BEYANNAME_MISSING', () => {
    expect(detectMissingQuarterlySource('Q4', ['100', '102', '153'])).toBe('BEYANNAME_MISSING')
  })

  // T_MD2: Q4 + sadece gelir tablosu kodları → MIZAN_MISSING
  test('T_MD2 — Q4 + [6xx] → MIZAN_MISSING', () => {
    expect(detectMissingQuarterlySource('Q4', ['600', '621', '632'])).toBe('MIZAN_MISSING')
  })

  // T_MD3: Q4 + her iki grup → null (tam veri)
  test('T_MD3 — Q4 + [1xx + 6xx] → null (her iki kaynak mevcut)', () => {
    expect(detectMissingQuarterlySource('Q4', ['100', '600', '621'])).toBeNull()
  })

  // T_MD4: ANNUAL → null (uyarı yok)
  test('T_MD4 — ANNUAL + [1xx] → null (ANNUAL uyarı dışı)', () => {
    expect(detectMissingQuarterlySource('ANNUAL', ['100'])).toBeNull()
  })

  // T_MD5: Q1 + sadece 1xx-5xx → BEYANNAME_MISSING
  test('T_MD5 — Q1 + [1xx] → BEYANNAME_MISSING', () => {
    expect(detectMissingQuarterlySource('Q1', ['100', '120'])).toBe('BEYANNAME_MISSING')
  })

  // T_MD6: Q3 + boş liste → null (veri yok)
  test('T_MD6 — Q3 + [] → null (hesap kodu yok)', () => {
    expect(detectMissingQuarterlySource('Q3', [])).toBeNull()
  })

  // T_MD7: Q2 + sadece 1xx-5xx → BEYANNAME_MISSING
  test('T_MD7 — Q2 + [1xx] → BEYANNAME_MISSING', () => {
    expect(detectMissingQuarterlySource('Q2', ['100', '102'])).toBe('BEYANNAME_MISSING')
  })

})

describe('hasBalanceAccounts + hasIncomeAccounts (Faz 7.3.50A.10)', () => {

  test('hasBalanceAccounts — 1xx-5xx kodları true döner', () => {
    expect(hasBalanceAccounts(['100', '321', '500'])).toBe(true)
    expect(hasBalanceAccounts(['600', '621'])).toBe(false)
    expect(hasBalanceAccounts([])).toBe(false)
  })

  test('hasIncomeAccounts — 6xx kodları true döner', () => {
    expect(hasIncomeAccounts(['600', '621', '660'])).toBe(true)
    expect(hasIncomeAccounts(['100', '321'])).toBe(false)
    expect(hasIncomeAccounts([])).toBe(false)
  })

})
