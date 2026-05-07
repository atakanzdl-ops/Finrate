/**
 * equityPoolCap.test.ts — EQUITY_POOL_CAP Portföy Guardrail (Faz 7.3.43F)
 *
 * Kural: Sermaye güçlendirme aksiyonları toplamı baseline aktif × %15 üst sınırını aşamaz.
 * Aksiyonlar: A10_CASH_EQUITY_INJECTION, A10B_PROMISSORY_NOTE_EQUITY_INJECTION, A15_DEBT_TO_EQUITY_SWAP
 * Severity: daima SOFT_BLOCK (HARD_REJECT veya WARNING OLMAZ)
 * effectiveCap = min(baseline × 0.15, OCF × 3)  — OCF > 0 ise
 * baselineTotalAssets yoksa totalAssets fallback olarak kullanılır
 *
 * T1:  Temel tetikleyici — eşiği aşan sermaye aksiyonları → SOFT_BLOCK
 * T2:  Eşik altı → pass (null)
 * T3:  Tam eşikte → pass (null)
 * T4:  OCF cap bağlayıcı (OCF×3 < assets×%15) → daha küçük effectiveCap
 * T5:  OCF cap bağlayıcı değil (OCF×3 > assets×%15) → asset tabanlı cap kullanılır
 * T6:  OCF undefined → sadece asset tabanlı cap
 * T7:  OCF = 0 → OCF bağlayıcı değil → asset tabanlı cap
 * T8:  Sadece A10 aksiyonu
 * T9:  Sadece A10B aksiyonu
 * T10: Sadece A15 aksiyonu
 * T11: A10 + A10B + A15 karışık → toplam kontrol edilir
 * T12: Öz sermaye olmayan aksiyonlar (A1, A2...) sayılmaz
 * T13: baselineTotalAssets verildi → totalAssets yerine kullanılır
 * T14: baselineTotalAssets verilmedi → totalAssets fallback
 * T15: NaN baseline → 0 kabul edilir → effectiveCap=0 → tüm öz sermaye bloklar
 * T16: Büyük firma (10 milyar TL) → cap doğru hesaplanır
 * T17: Küçük firma (50M TL) → cap = 7.5M
 * T18: Severity SOFT_BLOCK — HARD_REJECT veya WARNING üretilmez
 */

import { checkPortfolioAggregateRules } from '../semanticGuardrails'

// ─── Sabitler ────────────────────────────────────────────────────────────────

const EQUITY_IDS = {
  A10:  'A10_CASH_EQUITY_INJECTION',
  A10B: 'A10B_PROMISSORY_NOTE_EQUITY_INJECTION',
  A15:  'A15_DEBT_TO_EQUITY_SWAP',
}

const NON_EQUITY_IDS = ['A1_RECEIVABLES_FACTORING', 'A2_INVENTORY_MONETIZATION', 'A5_COST_OPTIMIZATION']

// Temel firmContext — 100M TL aktif → cap = 15M TL
function makeCtx(overrides: {
  totalAssets?:         number
  baselineTotalAssets?: number
  operatingCashFlow?:   number | null
} = {}) {
  return {
    totalAssets:          overrides.totalAssets         ?? 100_000_000,
    totalEquity:          20_000_000,
    totalRevenue:         80_000_000,
    netIncome:            5_000_000,
    operatingCashFlow:    overrides.operatingCashFlow,
    baselineTotalAssets:  overrides.baselineTotalAssets,
  }
}

// ─── T1: Temel tetikleyici ────────────────────────────────────────────────────

describe('T1 — Eşiği aşan sermaye aksiyonları → SOFT_BLOCK', () => {
  test('T1: 16M TL A10 (cap=15M) → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 16_000_000 }],
      firmContext: makeCtx(),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.pass).toBe(false)
    expect(block!.severity).toBe('SOFT_BLOCK')
  })
})

// ─── T2: Eşik altı → pass ────────────────────────────────────────────────────

describe('T2 — Eşik altında → pass (null döner)', () => {
  test('T2: 10M TL A10 (cap=15M) → pass', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 10_000_000 }],
      firmContext: makeCtx(),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeUndefined()
  })
})

// ─── T3: Tam eşikte → pass ───────────────────────────────────────────────────

describe('T3 — Tam eşikte (=15M) → pass', () => {
  test('T3: equitySum === effectiveCap → pass', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 15_000_000 }],
      firmContext: makeCtx(),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeUndefined()
  })
})

// ─── T4: OCF cap bağlayıcı ───────────────────────────────────────────────────

describe('T4 — OCF cap bağlayıcı (OCF×3 < baseline×%15)', () => {
  test('T4: OCF=3M → OCF×3=9M < 15M → effectiveCap=9M; 10M giriş → SOFT_BLOCK', () => {
    // OCF = 3M → OCF×3 = 9M < assets×0.15 = 15M → effectiveCap = 9M
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 10_000_000 }],
      firmContext: makeCtx({ operatingCashFlow: 3_000_000 }),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.severity).toBe('SOFT_BLOCK')
    // Mesajda effectiveCap 9M olmalı
    expect(block!.message).toMatch(/9\.0M/)
  })
})

// ─── T5: OCF cap bağlayıcı değil ────────────────────────────────────────────

describe('T5 — OCF×3 > baseline×%15 → asset tabanlı cap kullanılır', () => {
  test('T5: OCF=10M → OCF×3=30M > 15M → effectiveCap=15M; 16M → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 16_000_000 }],
      firmContext: makeCtx({ operatingCashFlow: 10_000_000 }),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    // effectiveCap mesajda 15M gösterir
    expect(block!.message).toMatch(/15\.0M/)
  })
})

// ─── T6: OCF undefined ───────────────────────────────────────────────────────

describe('T6 — operatingCashFlow undefined → sadece asset tabanlı cap', () => {
  test('T6: OCF yok → cap=15M; 16M → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 16_000_000 }],
      firmContext: makeCtx({ operatingCashFlow: undefined }),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.severity).toBe('SOFT_BLOCK')
  })

  test('T6b: OCF yok → cap=15M; 14M → pass', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 14_000_000 }],
      firmContext: makeCtx({ operatingCashFlow: undefined }),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeUndefined()
  })
})

// ─── T7: OCF = 0 ─────────────────────────────────────────────────────────────

describe('T7 — OCF = 0 → OCF cap devreye girmez → asset tabanlı cap', () => {
  test('T7: OCF=0 → OCF pozitif değil → cap=15M; 16M → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 16_000_000 }],
      firmContext: makeCtx({ operatingCashFlow: 0 }),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.severity).toBe('SOFT_BLOCK')
  })
})

// ─── T8: Sadece A10 ──────────────────────────────────────────────────────────

describe('T8 — Sadece A10_CASH_EQUITY_INJECTION', () => {
  test('T8: 20M A10 → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 20_000_000 }],
      firmContext: makeCtx(),
    })
    expect(result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')).toBeDefined()
  })
})

// ─── T9: Sadece A10B ─────────────────────────────────────────────────────────

describe('T9 — Sadece A10B_PROMISSORY_NOTE_EQUITY_INJECTION', () => {
  test('T9: 20M A10B → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10B, amountTRY: 20_000_000 }],
      firmContext: makeCtx(),
    })
    expect(result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')).toBeDefined()
  })
})

// ─── T10: Sadece A15 ─────────────────────────────────────────────────────────

describe('T10 — Sadece A15_DEBT_TO_EQUITY_SWAP', () => {
  test('T10: 20M A15 → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A15, amountTRY: 20_000_000 }],
      firmContext: makeCtx(),
    })
    expect(result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')).toBeDefined()
  })
})

// ─── T11: Karışık A10 + A10B + A15 ──────────────────────────────────────────

describe('T11 — A10 + A10B + A15 toplamı kontrol edilir', () => {
  test('T11: 5M+5M+6M=16M > 15M → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [
        { actionId: EQUITY_IDS.A10,  amountTRY: 5_000_000 },
        { actionId: EQUITY_IDS.A10B, amountTRY: 5_000_000 },
        { actionId: EQUITY_IDS.A15,  amountTRY: 6_000_000 },
      ],
      firmContext: makeCtx(),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.severity).toBe('SOFT_BLOCK')
    // Mesajda 16M toplamı geçmeli
    expect(block!.message).toMatch(/16\.0M/)
  })

  test('T11b: 4M+4M+4M=12M < 15M → pass', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [
        { actionId: EQUITY_IDS.A10,  amountTRY: 4_000_000 },
        { actionId: EQUITY_IDS.A10B, amountTRY: 4_000_000 },
        { actionId: EQUITY_IDS.A15,  amountTRY: 4_000_000 },
      ],
      firmContext: makeCtx(),
    })
    expect(result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')).toBeUndefined()
  })
})

// ─── T12: Öz sermaye olmayan aksiyonlar sayılmaz ──────────────────────────────

describe('T12 — Öz sermaye olmayan aksiyonlar EQUITY_POOL_CAP kapsamı dışında', () => {
  test('T12: 50M A1+A2+A5 → EQUITY_POOL_CAP tetiklenmez', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: NON_EQUITY_IDS.map(id => ({ actionId: id, amountTRY: 50_000_000 })),
      firmContext: makeCtx(),
    })
    expect(result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')).toBeUndefined()
  })

  test('T12b: 50M non-equity + 5M A10 (toplam öz sermaye 5M < 15M) → pass', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [
        { actionId: 'A1_RECEIVABLES_FACTORING', amountTRY: 50_000_000 },
        { actionId: EQUITY_IDS.A10,             amountTRY:  5_000_000 },
      ],
      firmContext: makeCtx(),
    })
    expect(result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')).toBeUndefined()
  })
})

// ─── T13: baselineTotalAssets verildi ────────────────────────────────────────

describe('T13 — baselineTotalAssets verildi → totalAssets yerine kullanılır', () => {
  test('T13: baseline=200M, totalAssets=100M → cap=30M; 25M → pass', () => {
    // Greedy döngüsünde totalAssets büyüyebilir ama baseline sabit kalır.
    // Baseline 200M → cap = 30M. totalAssets=100M olsa bile 30M cap uygulanır.
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 25_000_000 }],
      firmContext: makeCtx({ totalAssets: 100_000_000, baselineTotalAssets: 200_000_000 }),
    })
    // 25M < 30M (baseline 200M × 0.15) → pass
    expect(result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')).toBeUndefined()
  })

  test('T13b: baseline=200M → cap=30M; 31M → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 31_000_000 }],
      firmContext: makeCtx({ totalAssets: 100_000_000, baselineTotalAssets: 200_000_000 }),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    // Mesajda 200M baseline geçmeli
    expect(block!.message).toMatch(/200M/)
  })
})

// ─── T14: baselineTotalAssets verilmedi → totalAssets fallback ───────────────

describe('T14 — baselineTotalAssets undefined → totalAssets fallback', () => {
  test('T14: baselineTotalAssets yok, totalAssets=100M → cap=15M; 16M → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 16_000_000 }],
      firmContext: {
        totalAssets:   100_000_000,
        totalEquity:    20_000_000,
        totalRevenue:   80_000_000,
        netIncome:       5_000_000,
        // baselineTotalAssets verilmedi
      },
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.severity).toBe('SOFT_BLOCK')
  })
})

// ─── T15: NaN baseline → effectiveCap=0 ──────────────────────────────────────

describe('T15 — NaN baseline → effectiveCap=0 → herhangi öz sermaye bloklar', () => {
  test('T15: baseline=NaN → cap=0; 1 TL A10 bile SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 1 }],
      firmContext: {
        totalAssets:         NaN,
        totalEquity:           0,
        totalRevenue:          0,
        netIncome:             0,
        baselineTotalAssets: NaN,
      },
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.severity).toBe('SOFT_BLOCK')
  })
})

// ─── T16: Büyük firma ────────────────────────────────────────────────────────

describe('T16 — Büyük firma (10 milyar TL aktif)', () => {
  test('T16: 10B aktif → cap=1.5B; 2B A10 → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 2_000_000_000 }],
      firmContext: makeCtx({ totalAssets: 10_000_000_000 }),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.severity).toBe('SOFT_BLOCK')
    // cap = 1.5B → mesajda "1500.0M" veya benzeri
    expect(block!.message).toMatch(/1500\.0M/)
  })

  test('T16b: 10B aktif → cap=1.5B; 1B A10 → pass', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 1_000_000_000 }],
      firmContext: makeCtx({ totalAssets: 10_000_000_000 }),
    })
    expect(result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')).toBeUndefined()
  })
})

// ─── T17: Küçük firma ────────────────────────────────────────────────────────

describe('T17 — Küçük firma (50M TL aktif)', () => {
  test('T17: 50M aktif → cap=7.5M; 8M A10 → SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 8_000_000 }],
      firmContext: makeCtx({ totalAssets: 50_000_000 }),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.message).toMatch(/7\.5M/)
  })

  test('T17b: 50M aktif → cap=7.5M; 7M A10 → pass', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 7_000_000 }],
      firmContext: makeCtx({ totalAssets: 50_000_000 }),
    })
    expect(result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')).toBeUndefined()
  })
})

// ─── T18: Severity SOFT_BLOCK — HARD_REJECT veya WARNING üretilmez ───────────

describe('T18 — Severity daima SOFT_BLOCK (HARD_REJECT veya WARNING yasak)', () => {
  test('T18a: ihlal → severity SOFT_BLOCK', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 99_000_000 }],
      firmContext: makeCtx(),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.severity).toBe('SOFT_BLOCK')
    expect(block!.severity).not.toBe('HARD_REJECT')
    expect(block!.severity).not.toBe('WARNING')
  })

  test('T18b: portfolioLevel flag doğru set', () => {
    const result = checkPortfolioAggregateRules({
      portfolio: [{ actionId: EQUITY_IDS.A10, amountTRY: 99_000_000 }],
      firmContext: makeCtx(),
    })
    const block = result.find(r => r.ruleCode === 'EQUITY_POOL_CAP')
    expect(block).toBeDefined()
    expect(block!.portfolioLevel).toBe(true)
  })
})
