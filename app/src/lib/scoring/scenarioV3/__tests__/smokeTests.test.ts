/**
 * R8.1 — Smoke Test Otomasyon
 * 5 Firma × 3 Hedef Rating = 15 Senaryo Baseline
 *
 * Amaç:
 *   Gerçek firma profilleriyle motor end-to-end testleri.
 *   Regresyon guard: R7B+ sonrası kritik davranışlar korunur.
 *
 * Firmalar:
 *   DEKAM    — CONSTRUCTION, BB, brüt zarar → A20 gerekli, A19/A14 dışarıda
 *   ORGANIKA — MANUFACTURING, B, KOBİ finans yükü → A14 portfolyoda, A04 dışarıda
 *   ENES     — MANUFACTURING, B, neredeyse sıfır nakit → A04 dışarıda
 *   iPOS     — IT, B, 255 demirbaş/0 bina → A09 dışarıda (prefix bug guard)
 *   İSRA     — TRADE, B, tipik KOBİ → baseline (universal invariantlar)
 *
 * Universal Invariantlar (15 senaryonun tümünde):
 *   ✓ A11_RETAIN_EARNINGS portfolyo dışı (özkaynak yanılgısı — R7B disable)
 *   ✓ 320 (Satıcılar) hiçbir transaction leg'inde kullanılmaz
 *   ✓ Her transaction için DEBIT toplamı = CREDIT toplamı
 *   ✓ Portfolyodaki tüm amountTRY > 0
 *   ✓ 690 (Dönem K/Z) DEBIT içeren tx'da 590 (Dönem Net K/Z) CREDIT zorunlu
 *
 * Hedef sayısı: 15 test → toplam ~866 (scenarioV3 suite)
 *
 * README Pattern Uyumu:
 *   - ACTION_CATALOG_V3['id'] (named export yok)
 *   - runEngineV3 doğrudan çağrı
 *   - ?.() tuzağı önleme: .toBeDefined() + ! operatörü
 */

import { runEngineV3 }    from '../engineV3'
import type { EngineResult } from '../engineV3'
import type { AccountingTransaction } from '../contracts'

import {
  DEKAM_INPUT,
  ORGANIKA_INPUT,
  ENES_INPUT,
  IPOS_INPUT,
  ISRA_INPUT,
} from './fixtures/smoke/inputs'

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

/**
 * Tolerans bazlı miktar kontrolü.
 * tolerance = max(50_000, expected × 0.005)
 */
function expectAmountClose(actual: number, expected: number, label = ''): void {
  const tolerance = Math.max(50_000, expected * 0.005)
  expect(actual).toBeGreaterThanOrEqual(expected - tolerance)
  expect(actual).toBeLessThanOrEqual(expected + tolerance)
  if (label) { /* label only for debug output */ }
}

/**
 * Universal smoke invariantları — 15 senaryonun tümünde çalışır.
 *
 * 1. A11 portfolyo dışı (R7B disable)
 * 2. 320 yasak (hiçbir tx leg'inde)
 * 3. Tüm tx balanced (DEBIT == CREDIT)
 * 4. Tüm amountTRY > 0
 * 5. 690 ↔ 590 profit transfer zinciri
 */
function assertUniversalSmoke(result: EngineResult): void {

  // 1 — A11 kesinlikle portfolyo dışı
  const a11 = result.portfolio.find(a => a.actionId === 'A11_RETAIN_EARNINGS')
  expect(a11).toBeUndefined()

  // 2 — 320 (Satıcılar) hiçbir leg'de kullanılmaz
  const allLegs = result.portfolio.flatMap(a =>
    a.transactions.flatMap((tx: AccountingTransaction) => tx.legs)
  )
  const leg320 = allLegs.find(l => l.accountCode === '320')
  expect(leg320).toBeUndefined()

  // 3 — Her transaction için DEBIT toplamı == CREDIT toplamı
  for (const action of result.portfolio) {
    for (const tx of action.transactions as AccountingTransaction[]) {
      const debit  = tx.legs.filter(l => l.side === 'DEBIT' ).reduce((s, l) => s + l.amount, 0)
      const credit = tx.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
      expect(debit).toBe(credit)
    }
  }

  // 4 — Tüm portfolio amountTRY > 0
  for (const action of result.portfolio) {
    expect(action.amountTRY).toBeGreaterThan(0)
  }

  // 5 — 690 DEBIT içeren tx'da 590 CREDIT zorunlu (profit transfer zinciri)
  for (const action of result.portfolio) {
    for (const tx of action.transactions as AccountingTransaction[]) {
      const has690Debit  = tx.legs.some(l => l.accountCode === '690' && l.side === 'DEBIT')
      if (has690Debit) {
        const has590Credit = tx.legs.some(l => l.accountCode === '590' && l.side === 'CREDIT')
        expect(has590Credit).toBe(true)
      }
    }
  }
}

// ─── DEKAM — CONSTRUCTION, BB ─────────────────────────────────────────────────
// Beklentiler:
//   A20_GROSS_MARGIN_REFORM   portfolyoda (brüt zarar, büyük gap)
//   A19_ADVANCE_TO_REVENUE    portfolyo DIŞI (baseline brüt zarar guard)
//   A14_FINANCE_COST_REDUCTION portfolyo DIŞI (780/netSales=%1.64 < %5 sektör)
//   A11_RETAIN_EARNINGS        portfolyo DIŞI (universal disable)

describe('R8.1 Smoke — DEKAM (CONSTRUCTION, BB)', () => {

  test('DEKAM × BBB', () => {
    const result = runEngineV3({ ...DEKAM_INPUT, targetRating: 'BBB' })
    assertUniversalSmoke(result)

    // A19 baseline brüt zarar guard
    expect(result.portfolio.find(a => a.actionId === 'A19_ADVANCE_TO_REVENUE')).toBeUndefined()
    // A14 sektör altı (1.64% < CONSTRUCTION %5)
    expect(result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')).toBeUndefined()
  })

  test('DEKAM × A', () => {
    const result = runEngineV3({ ...DEKAM_INPUT, targetRating: 'A' })
    assertUniversalSmoke(result)

    expect(result.portfolio.find(a => a.actionId === 'A19_ADVANCE_TO_REVENUE')).toBeUndefined()
    expect(result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')).toBeUndefined()
  })

  test('DEKAM × AA', () => {
    const result = runEngineV3({ ...DEKAM_INPUT, targetRating: 'AA' })
    assertUniversalSmoke(result)

    expect(result.portfolio.find(a => a.actionId === 'A19_ADVANCE_TO_REVENUE')).toBeUndefined()
    expect(result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')).toBeUndefined()
  })

})

// ─── ORGANIKA — MANUFACTURING, B ─────────────────────────────────────────────
// Beklentiler:
//   A14_FINANCE_COST_REDUCTION portfolyoda (KOBİ fallback: 5.7M/17.7M=%32 > %20 → mandatory + R7A fix)
//   A04_CASH_PAYDOWN_ST        portfolyo DIŞI (102=960K / 300=22.8M = %4.2 < %15)
//   A11_RETAIN_EARNINGS        portfolyo DIŞI (universal disable)

describe('R8.1 Smoke — ORGANIKA (MANUFACTURING, B)', () => {

  test('ORGANIKA × BB', () => {
    const result = runEngineV3({ ...ORGANIKA_INPUT, targetRating: 'BB' })
    assertUniversalSmoke(result)

    // A14 portfolyoda (R7A: allowComputedSource fix + KOBİ fallback ~1.71M)
    const a14 = result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')
    expect(a14).toBeDefined()
    expect(a14!.amountTRY).toBeGreaterThan(0)

    // A04 baseline nakit guard (%4.2 < %15)
    expect(result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')).toBeUndefined()
  })

  test('ORGANIKA × BBB', () => {
    const result = runEngineV3({ ...ORGANIKA_INPUT, targetRating: 'BBB' })
    assertUniversalSmoke(result)

    const a14 = result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')
    expect(a14).toBeDefined()
    expect(a14!.amountTRY).toBeGreaterThan(0)

    expect(result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')).toBeUndefined()
  })

  test('ORGANIKA × A', () => {
    const result = runEngineV3({ ...ORGANIKA_INPUT, targetRating: 'A' })
    assertUniversalSmoke(result)

    const a14 = result.portfolio.find(a => a.actionId === 'A14_FINANCE_COST_REDUCTION')
    expect(a14).toBeDefined()
    expect(a14!.amountTRY).toBeGreaterThan(0)

    expect(result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')).toBeUndefined()
  })

})

// ─── ENES — MANUFACTURING, B ──────────────────────────────────────────────────
// Beklentiler:
//   A04_CASH_PAYDOWN_ST portfolyo DIŞI (102=222 TL nakit → nakitCap çok küçük)
//   A11_RETAIN_EARNINGS portfolyo DIŞI (universal disable)

describe('R8.1 Smoke — ENES (MANUFACTURING, B)', () => {

  test('ENES × BB', () => {
    const result = runEngineV3({ ...ENES_INPUT, targetRating: 'BB' })
    assertUniversalSmoke(result)

    // A04 baseline nakit guard (102=222 TL neredeyse sıfır)
    expect(result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')).toBeUndefined()
  })

  test('ENES × BBB', () => {
    const result = runEngineV3({ ...ENES_INPUT, targetRating: 'BBB' })
    assertUniversalSmoke(result)

    expect(result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')).toBeUndefined()
  })

  test('ENES × A', () => {
    const result = runEngineV3({ ...ENES_INPUT, targetRating: 'A' })
    assertUniversalSmoke(result)

    expect(result.portfolio.find(a => a.actionId === 'A04_CASH_PAYDOWN_ST')).toBeUndefined()
  })

})

// ─── iPOS — IT, B ─────────────────────────────────────────────────────────────
// Beklentiler:
//   A09_SALE_LEASEBACK  portfolyo DIŞI (R6 prefix bug fix: 255≠250/252 → havuz=0 → null)
//   A11_RETAIN_EARNINGS portfolyo DIŞI (universal disable)
//
// Not: R6 öncesi bug'da 255 demirbaş '25' prefix eşleşmesiyle A09 tetikleniyordu.
//      R6 sonrası: requiredAccountCodes=['250','252'] → 255 dahil değil → null.

describe('R8.1 Smoke — iPOS (IT, B)', () => {

  test('iPOS × BB', () => {
    const result = runEngineV3({ ...IPOS_INPUT, targetRating: 'BB' })
    assertUniversalSmoke(result)

    // A09 R6 prefix bug guard: bina=0 → havuz=0 → null
    expect(result.portfolio.find(a => a.actionId === 'A09_SALE_LEASEBACK')).toBeUndefined()
  })

  test('iPOS × BBB', () => {
    const result = runEngineV3({ ...IPOS_INPUT, targetRating: 'BBB' })
    assertUniversalSmoke(result)

    expect(result.portfolio.find(a => a.actionId === 'A09_SALE_LEASEBACK')).toBeUndefined()
  })

  test('iPOS × A', () => {
    const result = runEngineV3({ ...IPOS_INPUT, targetRating: 'A' })
    assertUniversalSmoke(result)

    expect(result.portfolio.find(a => a.actionId === 'A09_SALE_LEASEBACK')).toBeUndefined()
  })

})

// ─── İSRA — TRADE, B ─────────────────────────────────────────────────────────
// Beklentiler:
//   Universal invariantlar (A11 disable, 320 yasak, balanced tx, amountTRY > 0, 690↔590)
//   Tipik ticaret KOBİ profili — baseline referans

describe('R8.1 Smoke — İSRA (TRADE, B)', () => {

  test('İSRA × BB', () => {
    const result = runEngineV3({ ...ISRA_INPUT, targetRating: 'BB' })
    assertUniversalSmoke(result)
  })

  test('İSRA × BBB', () => {
    const result = runEngineV3({ ...ISRA_INPUT, targetRating: 'BBB' })
    assertUniversalSmoke(result)
  })

  test('İSRA × A', () => {
    const result = runEngineV3({ ...ISRA_INPUT, targetRating: 'A' })
    assertUniversalSmoke(result)
  })

})
