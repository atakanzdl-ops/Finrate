/**
 * Faz 7.4.1-B-1 — Unit testler
 *
 * applyEliminationsAtAccountLevel  (T1–T6)
 * entriesToAggregateEliminations   (T7–T8)
 * adaptAggregateForScoring         (T9)
 */

import {
  applyEliminationsAtAccountLevel,
  entriesToAggregateEliminations,
} from '../consolidationAccountLevel'
import { adaptAggregateForScoring } from '../accountMapper'
import type { GroupEliminationEntry } from '@prisma/client'

// ─── TEST FIXTURE ────────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<GroupEliminationEntry> = {},
): GroupEliminationEntry {
  return {
    id:              'test-' + Math.random().toString(36).slice(2),
    groupId:         'g1',
    year:            2025,
    period:          'Q4',
    fromEntityId:    'A',
    fromAccountCode: '131',
    toEntityId:      'B',
    toAccountCode:   '331',
    amount:          5_000_000 as unknown as import('@prisma/client').Prisma.Decimal,
    description:     null,
    createdAt:       new Date('2025-01-01'),
    updatedAt:       new Date('2025-01-01'),
    ...overrides,
  } as GroupEliminationEntry
}

// ─── applyEliminationsAtAccountLevel ─────────────────────────────────────────

describe('applyEliminationsAtAccountLevel', () => {

  it('T1: boş entries — balances değişmez', () => {
    const balances = new Map([
      ['A', new Map([['131', 10_000_000]])],
    ])
    const result = applyEliminationsAtAccountLevel(balances, [], 2025, 'Q4')
    expect(result.get('A')?.get('131')).toBe(10_000_000)
  })

  it('T2: tek entry 131↔331 5M — her iki taraf düşer', () => {
    const balances = new Map([
      ['A', new Map([['131', 10_000_000]])],
      ['B', new Map([['331',  8_000_000]])],
    ])
    const result = applyEliminationsAtAccountLevel(
      balances,
      [makeEntry({ amount: 5_000_000 as unknown as import('@prisma/client').Prisma.Decimal })],
      2025,
      'Q4',
    )
    expect(result.get('A')?.get('131')).toBe(5_000_000)
    expect(result.get('B')?.get('331')).toBe(3_000_000)
  })

  it('T3: birden fazla entry aynı dönem — tümü uygulanır', () => {
    const balances = new Map([
      ['A', new Map([['131', 20_000_000], ['132', 5_000_000]])],
      ['B', new Map([['331', 15_000_000]])],
      ['C', new Map([['332',  5_000_000]])],
    ])
    const entries = [
      makeEntry({
        fromAccountCode: '131', toEntityId: 'B', toAccountCode: '331',
        amount: 5_000_000 as unknown as import('@prisma/client').Prisma.Decimal,
      }),
      makeEntry({
        fromAccountCode: '132', toEntityId: 'C', toAccountCode: '332',
        amount: 3_000_000 as unknown as import('@prisma/client').Prisma.Decimal,
      }),
    ]
    const result = applyEliminationsAtAccountLevel(balances, entries, 2025, 'Q4')
    expect(result.get('A')?.get('131')).toBe(15_000_000)
    expect(result.get('A')?.get('132')).toBe( 2_000_000)
    expect(result.get('B')?.get('331')).toBe(10_000_000)
    expect(result.get('C')?.get('332')).toBe( 2_000_000)
  })

  it('T4: farklı yıl/dönem filtrelenir — sadece 2025/Q4 uygulanır', () => {
    const balances = new Map([
      ['A', new Map([['131', 10_000_000]])],
      ['B', new Map([['331', 10_000_000]])],
    ])
    const entries = [
      makeEntry({ year: 2024, amount: 3_000_000 as unknown as import('@prisma/client').Prisma.Decimal }),        // farklı yıl
      makeEntry({ year: 2025, period: 'Q3', amount: 2_000_000 as unknown as import('@prisma/client').Prisma.Decimal }), // farklı dönem
      makeEntry({ year: 2025, period: 'Q4', amount: 5_000_000 as unknown as import('@prisma/client').Prisma.Decimal }), // eşleşen
    ]
    const result = applyEliminationsAtAccountLevel(balances, entries, 2025, 'Q4')
    expect(result.get('A')?.get('131')).toBe(5_000_000)
    expect(result.get('B')?.get('331')).toBe(5_000_000)
  })

  it('T5: bilinmeyen entity — hata fırlatmaz, yeni Map oluşur', () => {
    const balances = new Map<string, Map<string, number>>()
    expect(() => {
      applyEliminationsAtAccountLevel(
        balances,
        [makeEntry({ amount: 1_000_000 as unknown as import('@prisma/client').Prisma.Decimal })],
        2025,
        'Q4',
      )
    }).not.toThrow()
    const result = applyEliminationsAtAccountLevel(
      balances,
      [makeEntry({ amount: 1_000_000 as unknown as import('@prisma/client').Prisma.Decimal })],
      2025,
      'Q4',
    )
    expect(result.get('A')?.get('131')).toBe(-1_000_000) // sıfırdan başlayıp negatife düştü
    expect(result.get('B')?.get('331')).toBe(-1_000_000)
  })

  it('T6: input mutation engellenir — orijinal Map değişmez', () => {
    const balances = new Map([
      ['A', new Map([['131', 10_000_000]])],
    ])
    const originalValue = balances.get('A')!.get('131')
    applyEliminationsAtAccountLevel(
      balances,
      [makeEntry({ amount: 5_000_000 as unknown as import('@prisma/client').Prisma.Decimal })],
      2025,
      'Q4',
    )
    expect(balances.get('A')!.get('131')).toBe(originalValue) // orijinal değişmedi
  })

})

// ─── entriesToAggregateEliminations ──────────────────────────────────────────

describe('entriesToAggregateEliminations', () => {

  it('T7: 131↔331 — receivables + payables artar, diğerleri sıfır', () => {
    const entries = [
      makeEntry({
        fromAccountCode: '131',
        toAccountCode:   '331',
        amount: 5_000_000 as unknown as import('@prisma/client').Prisma.Decimal,
      }),
    ]
    const result = entriesToAggregateEliminations(entries, 2025, 'Q4')
    expect(result.intercompanyReceivables).toBe(5_000_000)
    expect(result.intercompanyPayables   ).toBe(5_000_000)
    expect(result.intercompanySales      ).toBe(0)
    expect(result.intercompanyPurchases  ).toBe(0)
    expect(result.intercompanyAdvancesGiven    ).toBe(0)
    expect(result.intercompanyAdvancesReceived ).toBe(0)
    expect(result.intercompanyProfit           ).toBe(0)
  })

  it('T8: 600↔621 — sales + purchases artar, diğerleri sıfır', () => {
    const entries = [
      makeEntry({
        fromAccountCode: '600',
        toAccountCode:   '621',
        amount: 8_000_000 as unknown as import('@prisma/client').Prisma.Decimal,
      }),
    ]
    const result = entriesToAggregateEliminations(entries, 2025, 'Q4')
    expect(result.intercompanySales    ).toBe(8_000_000)
    expect(result.intercompanyPurchases).toBe(8_000_000)
    expect(result.intercompanyReceivables).toBe(0)
    expect(result.intercompanyPayables  ).toBe(0)
  })

})

// ─── adaptAggregateForScoring ─────────────────────────────────────────────────

describe('adaptAggregateForScoring', () => {

  it('T9: ebit + grossProfit fallback hesaplanır', () => {
    const agg = {
      revenue:           100,
      cogs:               60,
      operatingExpenses:  20,
    }
    const result = adaptAggregateForScoring(agg)
    expect(result.grossProfit).toBe(40)   // 100 - 60
    expect(result.ebit       ).toBe(20)   // 100 - 60 - 20
  })

  it('T9b: mevcut grossProfit korunur (override yapmaz)', () => {
    const agg = {
      revenue:    100,
      cogs:        60,
      grossProfit: 99, // kasıtlı yanlış değer — korunmalı
      operatingExpenses: 20,
    }
    const result = adaptAggregateForScoring(agg)
    expect(result.grossProfit).toBe(99) // override yok
  })

  it('T9c: sıfır revenue/cogs durumunda güvenli', () => {
    const result = adaptAggregateForScoring({})
    expect(result.grossProfit).toBe(0)
    expect(result.ebit       ).toBe(0)
  })

})
