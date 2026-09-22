/**
 * R6 — A09_SALE_LEASEBACK computeAmount Guard Testleri
 *
 * R6 değişiklikleri:
 *   - requiredAccountCodes: ['250', '252'] (eski: ['252','253','254'] — prefix bug)
 *   - computeAmount: 3 guard (5M min, %30 reval, %10 gayrimenkul/aktif) + %40 cap
 *   - buildTransactions: bina(252) yoksa boş dizi (arsa için geri kira tutarsız)
 *   - customCheck: UV mali borç / (arsa+bina) > %40 → ipotek riski
 *
 * iPOS bug kökü: findBalanceInGroup '25' prefix → 250 arsa, 255 demirbaş, 256 vb.
 * eşleşiyordu → bina=0 ama diğer 25X var → A09 tetikleniyor, 13.4M sahte öneri.
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext } from '../contracts'

const a09 = ACTION_CATALOG_V3['A09_SALE_LEASEBACK']

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'CONSTRUCTION',
    accountBalances:   {},
    totalAssets:       200_000_000,
    totalEquity:        60_000_000,
    totalRevenue:      150_000_000,
    netIncome:           3_000_000,
    netSales:          150_000_000,
    operatingProfit:     8_000_000,
    grossProfit:        20_000_000,
    interestExpense:     5_000_000,
    operatingCashFlow:  null,
    ...overrides,
  }
}

// ─── computeAmount testleri ───────────────────────────────────────────────────

describe('R6 — A09_SALE_LEASEBACK computeAmount', () => {

  // T1: iPOS profili — bina=0 ama diğer 25X var → GUARD 1 (havuz < 5M) → null
  test('T1 — iPOS: bina=0, arsa=0, sadece 255=13.4M → null (havuz sıfır)', () => {
    // iPOS bug: eski ['252','253','254'] prefix '25' → 255 eşleşiyordu
    // R6: sadece 250+252 → arsa=0, bina=0 → realEstatePool=0 < 5M → null
    const result = a09.computeAmount!(makeCtx({
      accountBalances: { '255': 13_400_000, '256': 5_000_000 },
    }))
    expect(result).toBeNull()
  })

  // T2: DEKAM profili — bina/aktif %6.3 < %10 → GUARD 3 → null
  test('T2 — DEKAM: bina=20M, aktif=317M → oran=%6.3 < %10 → null', () => {
    const result = a09.computeAmount!(makeCtx({
      sector:          'CONSTRUCTION',
      accountBalances: { '252': 20_000_000 },
      totalAssets:     317_000_000,
    }))
    expect(result).toBeNull()
  })

  // T3: İSRA — 522 şişkin (reval/bina > %30) → GUARD 2 → null
  test('T3 — İSRA: 522=16M, bina=20M → reval=%80 > %30 → null', () => {
    const result = a09.computeAmount!(makeCtx({
      accountBalances: { '252': 20_000_000, '522': 16_000_000 },
      totalAssets:     100_000_000,
    }))
    expect(result).toBeNull()
  })

  // T4: Arsa only — bina=0, arsa=30M → Sonnet Düzeltme 7 → null
  test('T4 — Arsa-only: 250=30M, 252=0 → bina yok → null (geri kira tutarsız)', () => {
    const result = a09.computeAmount!(makeCtx({
      accountBalances: { '250': 30_000_000 },
      totalAssets:     100_000_000,
    }))
    expect(result).toBeNull()
  })

  // T5: Normal — bina+arsa yeterli, guardlar geçiyor → bina × %40 cap döner
  test('T5 — Normal: arsa=20M + bina=30M, aktif=200M → oneri=12M (bina×0.40)', () => {
    // totalAssets=200M; (20M+30M)/200M = %25 > %10 ✓
    // reval522=0 → bina%0 < %30 ✓
    // realEstatePool=50M > 5M ✓
    // bina=30M > 0 ✓
    // R6 hotfix: oneri = bina × 0.40 = 30M × 0.40 = 12M (NOT pool × 0.40 = 20M)
    const result = a09.computeAmount!(makeCtx({
      accountBalances: { '250': 20_000_000, '252': 30_000_000 },
      totalAssets:     200_000_000,
    }))
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(12_000_000, 0)
  })

  // T6: Min 1M eşiği — çok küçük havuz → null
  test('T6 — Havuz = 2M, bina var → oneri=0.8M < 1M min → null', () => {
    // realEstatePool=2M > 5M? HAYIR → GUARD 1 devreye girer zaten
    // (2M < 5M → null, GUARD 1)
    const result = a09.computeAmount!(makeCtx({
      accountBalances: { '252': 2_000_000 },
      totalAssets:     100_000_000,
    }))
    expect(result).toBeNull()
  })

})

// ─── buildTransactions testleri ──────────────────────────────────────────────

describe('R6 — A09_SALE_LEASEBACK buildTransactions', () => {

  // T7: bina=0 → boş dizi (engine guard tetiklenir)
  test('T7 — buildTransactions: bina(252)=0 → boş dizi', () => {
    const txs = a09.buildTransactions({
      amount:          10_000_000,
      sector:          'CONSTRUCTION',
      horizon:         'medium',
      analysis:        {},
      previousActions: [],
      accountBalances: { '250': 20_000_000 },  // arsa var ama bina yok
    })
    expect(txs).toHaveLength(0)
  })

  // T8: amount=0 → boş dizi
  test('T8 — amount=0 → boş dizi', () => {
    const txs = a09.buildTransactions({
      amount:          0,
      sector:          'CONSTRUCTION',
      horizon:         'medium',
      analysis:        {},
      previousActions: [],
      accountBalances: { '252': 30_000_000 },
    })
    expect(txs).toHaveLength(0)
  })

  // T9: bina var, amount > 0 → 1 tx, 102 DEBIT / 252 CREDIT
  test('T9 — bina=30M, amount=12M → 1 tx, 102 DEBIT/252 CREDIT, denklik', () => {
    const txs = a09.buildTransactions({
      amount:          12_000_000,
      sector:          'CONSTRUCTION',
      horizon:         'medium',
      analysis:        {},
      previousActions: [],
      accountBalances: { '252': 30_000_000 },
    })
    expect(txs).toHaveLength(1)
    const tx = txs[0]
    expect(tx.legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT'  })
    expect(tx.legs[1]).toMatchObject({ accountCode: '252', side: 'CREDIT' })
    const debit  = tx.legs.filter(l => l.side === 'DEBIT' ).reduce((s, l) => s + l.amount, 0)
    const credit = tx.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

})

// ─── R6 HOTFIX Codex K8 — cap SADECE bina bazlı ──────────────────────────────

describe('R6 Hotfix K8 — A09 cap bina bazlı (252 negatife düşmez)', () => {

  // T10: Codex K8 bug doğrulama — arsa büyük, bina küçük
  test('T10 — Arsa=90M, bina=10M → cap bina×%40=4M (pool×%40=40M HATA OLURDU)', () => {
    // Eski davranış: realEstatePool×0.40 = 100M×0.40 = 40M
    //   → buildTransactions: 252 credit 40M → 252=-30M (NEGATİF!)
    // R6 hotfix: bina×0.40 = 10M×0.40 = 4M → 252=10M-4M=6M (POZİTİF ✓)
    const result = a09.computeAmount!(makeCtx({
      accountBalances: {
        '250': 90_000_000,  // büyük arsa
        '252': 10_000_000,  // küçük bina
        '522': 0,
      },
      totalAssets: 200_000_000,  // pool/aktif=50% > 10% ✓
    }))
    expect(result).toBe(4_000_000)   // bina × 0.40, NOT pool × 0.40

    // Tutarlılık: buildTransactions 252 credit = result (negatife düşmez)
    const txs = a09.buildTransactions({
      amount:          result!,
      sector:          'CONSTRUCTION',
      horizon:         'medium',
      analysis:        {},
      previousActions: [],
      accountBalances: { '250': 90_000_000, '252': 10_000_000 },
    })
    expect(txs).toHaveLength(1)
    const creditLeg = txs[0].legs.find(l => l.accountCode === '252')
    expect(creditLeg?.amount).toBe(4_000_000)
    // 252 bakiyesi sonrası: 10M - 4M = 6M (POZİTİF)
    expect(10_000_000 - creditLeg!.amount).toBeGreaterThan(0)
  })

  // T11: Arsa dominant, bina küçük ama yeterli
  test('T11 — Arsa=250M, bina=5M → bina×%40=2M (min 1M PASS)', () => {
    const result = a09.computeAmount!(makeCtx({
      accountBalances: {
        '250': 250_000_000,
        '252':   5_000_000,
      },
      totalAssets: 300_000_000,  // pool/aktif=85% > 10% ✓
    }))
    expect(result).toBe(2_000_000)   // 5M × 0.40
  })

  // T12: Eşit arsa-bina — cap bina × %40
  test('T12 — Eşit pool (arsa=20M, bina=20M): bina×%40=8M', () => {
    const result = a09.computeAmount!(makeCtx({
      accountBalances: { '250': 20_000_000, '252': 20_000_000 },
      totalAssets: 100_000_000,  // pool/aktif=40% > 10% ✓
    }))
    expect(result).toBe(8_000_000)   // bina × 0.40
  })

})
