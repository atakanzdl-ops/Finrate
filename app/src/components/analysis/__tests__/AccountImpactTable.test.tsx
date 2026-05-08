/**
 * AccountImpactTable — Utility function + render tests (Faz 7.3.48)
 *
 * testEnvironment: 'node'  → renderToStaticMarkup from react-dom/server
 *
 * Saf fonksiyon testleri (T1-T12):
 *   formatTRY, getAccountSide, getProposedBalance, computeDelta
 *
 * Render testleri (T13-T15):
 *   AccountImpactTable bileşeni — react-dom/server renderToStaticMarkup
 */

import { renderToStaticMarkup } from 'react-dom/server'
import {
  formatTRY,
  getAccountSide,
  getProposedBalance,
  computeDelta,
  AccountImpactTable,
} from '../AccountImpactTable'
import type { AccountingImpactRow } from '@/lib/scoring/scenarioV3/decisionLayer'

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

function makeLeg(overrides: Partial<AccountingImpactRow> = {}): AccountingImpactRow {
  return {
    accountCode:     '102',
    accountName:     'Bankalar',
    legSide:         'DEBIT',
    amountTRY:       100_000,
    amountFormatted: '₺100K',
    ...overrides,
  } as AccountingImpactRow
}

// ─── formatTRY ───────────────────────────────────────────────────────────────

describe('formatTRY', () => {
  test('T1 — milyon altı tam rakam', () => {
    expect(formatTRY(500)).toBe('₺500')
  })

  test('T2 — bin seviyesi K formatı', () => {
    expect(formatTRY(250_000)).toBe('₺250K')
  })

  test('T3 — milyon seviyesi M formatı', () => {
    expect(formatTRY(1_500_000)).toBe('₺1.5M')
  })

  test('T4 — milyar seviyesi Mr formatı', () => {
    expect(formatTRY(2_000_000_000)).toBe('₺2.0Mr')
  })

  test('T5 — negatif değer sign prefix', () => {
    expect(formatTRY(-300_000)).toBe('-₺300K')
  })

  test('T6 — sıfır', () => {
    expect(formatTRY(0)).toBe('₺0')
  })
})

// ─── getAccountSide ───────────────────────────────────────────────────────────

describe('getAccountSide', () => {
  test('T7 — 1xx → ASSET', () => {
    expect(getAccountSide('102')).toBe('ASSET')
  })

  test('T7b — 2xx → ASSET', () => {
    expect(getAccountSide('253')).toBe('ASSET')
  })

  test('T7c — 3xx → LIABILITY', () => {
    expect(getAccountSide('320')).toBe('LIABILITY')
  })

  test('T7d — 5xx → EQUITY', () => {
    expect(getAccountSide('500')).toBe('EQUITY')
  })

  test('T7e — 6xx → INCOME (fallback)', () => {
    expect(getAccountSide('600')).toBe('INCOME')
  })
})

// ─── getProposedBalance ───────────────────────────────────────────────────────

describe('getProposedBalance', () => {
  test('T8 — ASSET DEBIT → artar', () => {
    expect(getProposedBalance(100_000, 'DEBIT', 'ASSET', 50_000)).toBe(150_000)
  })

  test('T9 — ASSET CREDIT → azalır', () => {
    expect(getProposedBalance(100_000, 'CREDIT', 'ASSET', 50_000)).toBe(50_000)
  })

  test('T10 — LIABILITY CREDIT → artar', () => {
    expect(getProposedBalance(200_000, 'CREDIT', 'LIABILITY', 80_000)).toBe(280_000)
  })

  test('T11 — LIABILITY DEBIT → azalır', () => {
    expect(getProposedBalance(200_000, 'DEBIT', 'LIABILITY', 80_000)).toBe(120_000)
  })

  test('T11b — EQUITY CREDIT → artar', () => {
    expect(getProposedBalance(500_000, 'CREDIT', 'EQUITY', 100_000)).toBe(600_000)
  })
})

// ─── computeDelta ─────────────────────────────────────────────────────────────

describe('computeDelta', () => {
  test('T12 — actionAmountTRY varsa öncelikli kullanılır', () => {
    const legs = [
      makeLeg({ legSide: 'DEBIT',  amountTRY: 100_000 }),
      makeLeg({ legSide: 'CREDIT', amountTRY: 100_000 }),
    ]
    expect(computeDelta(legs, 75_000)).toBe(75_000)
  })

  test('T12b — actionAmountTRY yoksa max(sumDebit, sumCredit)', () => {
    const legs = [
      makeLeg({ legSide: 'DEBIT',  amountTRY: 120_000 }),
      makeLeg({ legSide: 'CREDIT', amountTRY: 80_000  }),
    ]
    expect(computeDelta(legs)).toBe(120_000)
  })

  test('T12c — çift taraflı fiş — ASLA sumDebit+sumCredit değil', () => {
    const legs = [
      makeLeg({ legSide: 'DEBIT',  amountTRY: 200_000 }),
      makeLeg({ legSide: 'CREDIT', amountTRY: 200_000 }),
    ]
    // max(200K, 200K) = 200K, ASLA 400K değil
    expect(computeDelta(legs)).toBe(200_000)
    expect(computeDelta(legs)).not.toBe(400_000)
  })
})

// ─── AccountImpactTable render ────────────────────────────────────────────────

describe('AccountImpactTable render', () => {
  test('T13 — legs boş → "Hesap detayı mevcut değil"', () => {
    const html = renderToStaticMarkup(
      AccountImpactTable({ legs: [], currentBalances: {}, actionAmountTRY: undefined })
    )
    expect(html).toContain('Hesap detayı mevcut değil')
  })

  test('T14 — bilanço leg (ASSET DEBIT) → Mevcut/Önerilen/Δ sütunları', () => {
    const legs: AccountingImpactRow[] = [
      makeLeg({ accountCode: '102', accountName: 'Bankalar', legSide: 'DEBIT', amountTRY: 50_000 }),
    ]
    const html = renderToStaticMarkup(
      AccountImpactTable({
        legs,
        currentBalances: { '102': 200_000 },
        actionAmountTRY: 50_000,
      })
    )
    // Başlık sütunları
    expect(html).toContain('Mevcut')
    expect(html).toContain('Önerilen')
    // Hesap kodu görünmeli
    expect(html).toContain('102')
    // Hesap adı görünmeli
    expect(html).toContain('Bankalar')
    // Mevcut değer: 200K, Önerilen: 250K
    expect(html).toContain('₺200K')
    expect(html).toContain('₺250K')
  })

  test('T15 — 690 kapanış hesabı → gizlenir, diğer hesap görünür', () => {
    const legs: AccountingImpactRow[] = [
      makeLeg({ accountCode: '690', accountName: 'Dönem Karı/Zararı', legSide: 'CREDIT', amountTRY: 10_000 }),
      makeLeg({ accountCode: '600', accountName: 'Yurtiçi Satışlar',  legSide: 'CREDIT', amountTRY: 10_000 }),
    ]
    const html = renderToStaticMarkup(
      AccountImpactTable({ legs, currentBalances: {}, actionAmountTRY: undefined })
    )
    // 690 gizli
    expect(html).not.toContain('Dönem Karı/Zararı')
    // 600 görünür
    expect(html).toContain('600')
    expect(html).toContain('Yurtiçi Satışlar')
  })
})
