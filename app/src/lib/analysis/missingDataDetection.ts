/**
 * missingDataDetection.ts — Q dönem eksik kaynak tespiti (Faz 7.3.50A.10)
 *
 * Faz 7.3.15 mimarisi:
 *   MIZAN     → 1xx-5xx finansalAccounts (bilanço)
 *   BEYANNAME → 6xx finansalAccounts (gelir tablosu)
 *
 * Q dönemde tek kaynak yüklendiğinde kullanıcıyı yönlendir.
 * ANNUAL tek dosya ile yeterli — sadece Q1/Q2/Q3/Q4 için uyarı.
 *
 * Saf fonksiyonlar — test edilebilir export.
 */

export type MissingQuarterlySourceWarning =
  | 'MIZAN_MISSING'
  | 'BEYANNAME_MISSING'
  | null

/**
 * Q dönemde hangi kaynağın eksik olduğunu tespit eder.
 *
 * Kural:
 *   ANNUAL veya tanımsız dönem → null (uyarı yok)
 *   her iki kod grubu da var    → null (tam veri)
 *   sadece 1xx-5xx var         → BEYANNAME_MISSING
 *   sadece 6xx var             → MIZAN_MISSING
 *   hiç kod yok                → null (veri yok, uyarı anlamsız)
 */
export function detectMissingQuarterlySource(
  period: string,
  accountCodes: string[],
): MissingQuarterlySourceWarning {
  const Q_PERIODS = ['Q1', 'Q2', 'Q3', 'Q4']
  if (!Q_PERIODS.includes(period)) return null

  const hasBalance = accountCodes.some(c => /^[1-5]/.test(c))
  const hasIncome  = accountCodes.some(c => /^6/.test(c))

  if (!hasBalance && !hasIncome) return null

  if (hasBalance && !hasIncome) return 'BEYANNAME_MISSING'
  if (!hasBalance && hasIncome) return 'MIZAN_MISSING'

  return null
}

/** 1xx-5xx (bilanço) kodları var mı? */
export function hasBalanceAccounts(accountCodes: string[]): boolean {
  return accountCodes.some(c => /^[1-5]/.test(c))
}

/** 6xx (gelir tablosu) kodları var mı? */
export function hasIncomeAccounts(accountCodes: string[]): boolean {
  return accountCodes.some(c => /^6/.test(c))
}
