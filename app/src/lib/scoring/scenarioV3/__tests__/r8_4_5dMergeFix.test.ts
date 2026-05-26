/**
 * R8.4.5d — Merge Spread Null Propagation Fix Testleri
 *
 * Kapsam:
 *   T_R8_4_5d_1   Mizan upload null değer beyanname değerini ezmemeli (DEKAM senaryosu)
 *   T_R8_4_5d_2   Mizan upload yeni bilanço değeri existing'i overwrite etmeli
 *   T_R8_4_5d_3   Hiçbir kaynak yoksa null dönmeli
 *   T_R8_4_5d_4   Önceki bug regression — null overwrite engellendi (DEKAM interestExpense)
 *
 * Kök Neden (R8.4.5d):
 *   R8.4.5c'de '780':'interestExpense' MIZAN_MAP'e eklendi.
 *   Parser row.fields.interestExpense = 5.4M set etti.
 *   MIZAN cleanup (interestExpense ∉ BALANCE_SHEET_FIELDS) → null yaptı.
 *   Merge: { ...existing(interestExpense=1.4M), ...row.fields(interestExpense=null) }
 *   → null son geldi → existing değeri EZILDI.
 *   IC penalty (leverage max 45) kalktı → DEKAM B → BB (şişirilmiş).
 *
 * Düzeltme (route.ts ~line 533):
 *   ÖNCE: return [k, newVal != null ? newVal : v]
 *   SONRA: const existingVal = existing[k]; return [k, newVal != null ? newVal : (existingVal ?? null)]
 *
 * Bu dosya merge mantığını izole test eder; upload route'u doğrudan çağırmaz.
 */

import { describe, expect, test } from '@jest/globals'

// ─── Merge Helper (route.ts merge mantığını izole eder) ───────────────────────

/**
 * R8.4.5c öncesi HATALI merge — v spread'den gelir (null olabilir)
 */
function mergeOld(
  existing: Record<string, unknown>,
  rowFields: Record<string, unknown>,
  parserProvidedKeys: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...existing, ...rowFields }).map(([k, v]) => {
      const newVal = parserProvidedKeys.has(k) ? (rowFields as Record<string, unknown>)[k] : null
      return [k, newVal != null ? newVal : v]  // BUG: v = null (spread'den) → existing kaybolur
    }),
  )
}

/**
 * R8.4.5d DOĞRU merge — existingVal, existing'den bağımsız alınır
 */
function mergeNew(
  existing: Record<string, unknown>,
  rowFields: Record<string, unknown>,
  parserProvidedKeys: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...existing, ...rowFields }).map(([k, v]) => {
      void v  // spread değeri artık kullanılmıyor (R8.4.5d)
      const newVal = parserProvidedKeys.has(k) ? (rowFields as Record<string, unknown>)[k] : null
      // R8.4.5d: Parser key oluşturdu ama cleanup null yaptıysa, existing'den geri al
      const existingVal = existing[k]
      return [k, newVal != null ? newVal : (existingVal ?? null)]
    }),
  )
}

// ─── Testler ──────────────────────────────────────────────────────────────────

describe('R8.4.5d — Merge Spread Null Propagation Fix', () => {

  test('T_R8_4_5d_1: Mizan upload null değer beyanname değerini ezmemeli (DEKAM senaryosu)', () => {
    // DEKAM: beyanname interestExpense=1.4M, mizan 780→interestExpense → cleanup null etti
    const existing: Record<string, unknown> = {
      interestExpense: 1_400_000,   // beyanname 660/661'den
      revenue:         24_000_000,  // beyanname gelir tablosundan
      netProfit:        9_700_000,  // beyanname net kar
    }
    const rowFields: Record<string, unknown> = {
      interestExpense: null,          // mizan cleanup null yaptı (780 → parse → null)
      totalAssets:     361_000_000,   // mizan bilanço (parser sağladı)
    }
    // MIZAN için parserProvidedKeys: sadece BALANCE_SHEET_FIELDS
    const parserProvidedKeys = new Set(['totalAssets'])

    const merged = mergeNew(existing, rowFields, parserProvidedKeys)

    // Beyanname değerleri korunmalı
    expect(merged['interestExpense']).toBe(1_400_000)   // ← TEMEL ASSERT
    expect(merged['revenue']).toBe(24_000_000)
    expect(merged['netProfit']).toBe(9_700_000)
    // Mizan bilanço değeri kullanılmalı
    expect(merged['totalAssets']).toBe(361_000_000)
  })

  test('T_R8_4_5d_2: Mizan upload yeni bilanço değeri existing değerini overwrite etmeli', () => {
    // Bilanço alanı (parserProvidedKeys'te): mizan her zaman kazanır
    const existing: Record<string, unknown> = {
      totalAssets:          200_000_000,
      totalCurrentAssets:    80_000_000,
    }
    const rowFields: Record<string, unknown> = {
      totalAssets:          361_000_000,  // yeni mizan
      totalCurrentAssets:    95_000_000,  // yeni mizan
    }
    const parserProvidedKeys = new Set(['totalAssets', 'totalCurrentAssets'])

    const merged = mergeNew(existing, rowFields, parserProvidedKeys)

    expect(merged['totalAssets']).toBe(361_000_000)       // mizan kazandı
    expect(merged['totalCurrentAssets']).toBe(95_000_000) // mizan kazandı
  })

  test('T_R8_4_5d_3: Hiçbir kaynak yoksa null dönmeli', () => {
    // Ne existing'de ne de row.fields'da değer yok
    const existing: Record<string, unknown>   = {}
    const rowFields: Record<string, unknown>  = { interestExpense: null }
    const parserProvidedKeys = new Set<string>()

    const merged = mergeNew(existing, rowFields, parserProvidedKeys)

    expect(merged['interestExpense']).toBeNull()
  })

  test('T_R8_4_5d_4: Önceki bug regression — null overwrite engellendi (DEKAM interestExpense)', () => {
    // Eski hatalı davranış: v = spread'deki null → existing kaybolur
    // Yeni doğru davranış: existingVal'den al → existing korunur
    const existing: Record<string, unknown>  = { interestExpense: 5_369_133 }  // DEKAM beyanname
    const rowFields: Record<string, unknown> = { interestExpense: null }        // cleanup sonrası

    const parserProvidedKeys = new Set<string>()

    // ESKİ HATALI davranış — bu tes gösterir ki eski kod yanlış
    const oldMerged = mergeOld(existing, rowFields, parserProvidedKeys)
    expect(oldMerged['interestExpense']).toBeNull()   // BUG: beyanname değeri kayboldu

    // YENİ DOĞRU davranış
    const newMerged = mergeNew(existing, rowFields, parserProvidedKeys)
    expect(newMerged['interestExpense']).toBe(5_369_133)  // DÜZELTME: existing korundu ✓
  })

})
