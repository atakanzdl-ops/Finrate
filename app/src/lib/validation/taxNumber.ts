/**
 * taxNumber.ts — VKN / TCKN validation ve normalizasyon yardımcıları (Faz 7.3.50A.3.3)
 *
 * Sermaye şirketi → VKN 10 hane  (ör: 1234567890)
 * Şahıs şirketi   → TCKN 11 hane (ör: 12345678901)
 *
 * isValidTaxNumber         → null/boş kabul ETMEZ
 * isValidOptionalTaxNumber → null/boş kabul EDER (opsiyonel alan için)
 * normalizeTaxNumber       → boş/null → null, diğer → trim
 */

/**
 * Dolu bir VKN/TCKN'nin 10 veya 11 rakamdan oluştuğunu doğrular.
 * null, undefined veya boş string → false.
 */
export function isValidTaxNumber(value: unknown): boolean {
  if (value === null || value === undefined) return false
  const str = String(value).trim()
  if (str === '') return false
  return /^(?:\d{10}|\d{11})$/.test(str)
}

/**
 * Opsiyonel VKN/TCKN alanı için — boş/null geçerli sayılır.
 * Dolu ise 10 veya 11 rakam olmalıdır.
 */
export function isValidOptionalTaxNumber(value: unknown): boolean {
  if (value === null || value === undefined) return true
  const str = String(value).trim()
  if (str === '') return true
  return /^(?:\d{10}|\d{11})$/.test(str)
}

/**
 * Boş string / null / undefined → null döner.
 * Dolu değer → trim edilmiş string döner.
 */
export function normalizeTaxNumber(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str === '' ? null : str
}
