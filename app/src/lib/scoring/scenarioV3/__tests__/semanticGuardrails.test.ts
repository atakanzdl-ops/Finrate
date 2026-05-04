/**
 * semanticGuardrails — Saf fonksiyon testleri (Faz 7.3.30)
 *
 * testEnvironment: 'node' → jsdom/rendering yok.
 * Negatif özkaynak Math.abs + guard fix doğrulaması.
 *
 * T_SG1:  PORTFOLIO_EQUITY_INFLATION — pozitif özkaynak, büyük artış → SOFT_BLOCK
 * T_SG2:  PORTFOLIO_EQUITY_INFLATION — pozitif özkaynak, küçük artış → kural tetiklenmez
 * T_SG3:  PORTFOLIO_EQUITY_INFLATION — negatif özkaynak, küçük artış → pass (Faz 7.3.30 fix)
 * T_SG4:  PORTFOLIO_EQUITY_INFLATION — sıfır özkaynak → pass (guard)
 * T_SG5:  checkTemporalRealism short A10 — pozitif özkaynak, büyük tutar → SOFT_BLOCK
 * T_SG6:  checkTemporalRealism short A10 — negatif özkaynak → pass (Faz 7.3.30 fix)
 * T_SG7:  checkTemporalRealism medium A10 — pozitif özkaynak, çok büyük tutar → WARNING
 * T_SG8:  checkTemporalRealism medium A10 — negatif özkaynak → pass (Faz 7.3.30 fix)
 * T_SG9:  checkLegalRegulatorySanity A10 — pozitif özkaynak, anlamlı tutar → INFO
 * T_SG10: checkLegalRegulatorySanity A10 — negatif özkaynak → pass (Faz 7.3.30 fix)
 */

import {
  checkTemporalRealism,
  checkLegalRegulatorySanity,
  checkPortfolioAggregateRules,
  type GuardrailCheckInput,
  type PortfolioGuardrailInput,
} from '../semanticGuardrails'
import type { ActionTemplateV3 } from '../contracts'

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeA10Action(): ActionTemplateV3 {
  return {
    id:   'A10_CASH_EQUITY_INJECTION',
    name: 'Nakit Sermaye Artışı',
  } as unknown as ActionTemplateV3
}

function makeCheckInput(
  proposedAmountTRY: number,
  totalEquity: number,
  horizon: 'short' | 'medium' | 'long' = 'short',
): GuardrailCheckInput {
  return {
    action: makeA10Action(),
    transactions: [],
    proposedAmountTRY,
    accountBalances: {},
    firmContext: {
      totalAssets:  500_000_000,
      totalEquity,
      totalRevenue: 200_000_000,
      netIncome:    10_000_000,
      sector:       'İMALAT' as unknown as never,
    },
    horizon,
    previouslySelectedActionIds: [],
  }
}

function makePortfolioInput(
  equityAmountTRY: number,
  totalEquity: number,
): PortfolioGuardrailInput {
  return {
    portfolio: [{ actionId: 'A10_CASH_EQUITY_INJECTION', amountTRY: equityAmountTRY }],
    firmContext: {
      totalAssets:  500_000_000,
      totalEquity,
      totalRevenue: 200_000_000,
      netIncome:    10_000_000,
    },
  }
}

// ─── T_SG1: PORTFOLIO_EQUITY_INFLATION — pozitif, büyük artış ────────────────

describe('T_SG1 — PORTFOLIO_EQUITY_INFLATION: pozitif özkaynak, büyük artış', () => {
  test('250M artış > özkaynak(100M) × 2 = 200M → SOFT_BLOCK', () => {
    const input = makePortfolioInput(250_000_000, 100_000_000)
    const results = checkPortfolioAggregateRules(input)
    const r = results.find(r => r.ruleCode === 'PORTFOLIO_EQUITY_INFLATION')
    expect(r).toBeDefined()
    expect(r!.pass).toBe(false)
    expect(r!.severity).toBe('SOFT_BLOCK')
    expect(r!.portfolioLevel).toBe(true)
  })
})

// ─── T_SG2: PORTFOLIO_EQUITY_INFLATION — pozitif, küçük artış ────────────────

describe('T_SG2 — PORTFOLIO_EQUITY_INFLATION: pozitif özkaynak, küçük artış', () => {
  test('100M artış < özkaynak(100M) × 2 = 200M → kural tetiklenmez', () => {
    const input = makePortfolioInput(100_000_000, 100_000_000)
    const results = checkPortfolioAggregateRules(input)
    const r = results.find(r => r.ruleCode === 'PORTFOLIO_EQUITY_INFLATION')
    expect(r).toBeUndefined()
  })
})

// ─── T_SG3: PORTFOLIO_EQUITY_INFLATION — negatif özkaynak (Faz 7.3.30 fix) ──

describe('T_SG3 — PORTFOLIO_EQUITY_INFLATION: negatif özkaynak → pass (Faz 7.3.30 fix)', () => {
  test('özkaynak = -100M, artış = 50M → SOFT_BLOCK tetiklenmemeli', () => {
    // Eski formül: 50M > (-100M × 2) = 50M > -200M → TRUE → yanlış SOFT_BLOCK
    // Yeni formül: abs(-100M) = 100M, 50M > 100M × 2 = 200M → FALSE → pass
    const input = makePortfolioInput(50_000_000, -100_000_000)
    const results = checkPortfolioAggregateRules(input)
    const r = results.find(r => r.ruleCode === 'PORTFOLIO_EQUITY_INFLATION')
    expect(r).toBeUndefined()
  })

  test('özkaynak = -200M, artış = 100M → SOFT_BLOCK tetiklenmemeli', () => {
    // abs(-200M) = 200M, 100M > 200M × 2 = 400M → FALSE
    const input = makePortfolioInput(100_000_000, -200_000_000)
    const results = checkPortfolioAggregateRules(input)
    const r = results.find(r => r.ruleCode === 'PORTFOLIO_EQUITY_INFLATION')
    expect(r).toBeUndefined()
  })
})

// ─── T_SG4: PORTFOLIO_EQUITY_INFLATION — sıfır özkaynak ─────────────────────

describe('T_SG4 — PORTFOLIO_EQUITY_INFLATION: sıfır özkaynak → pass (guard)', () => {
  test('özkaynak = 0 → guard (absEquity > 0 false) → kural atlanır', () => {
    // abs(0) = 0, absEquity > 0 = false → if bloğuna girilmez → pass
    const input = makePortfolioInput(50_000_000, 0)
    const results = checkPortfolioAggregateRules(input)
    const r = results.find(r => r.ruleCode === 'PORTFOLIO_EQUITY_INFLATION')
    expect(r).toBeUndefined()
  })
})

// ─── T_SG5: checkTemporalRealism — short A10, pozitif özkaynak ───────────────

describe('T_SG5 — checkTemporalRealism short A10: pozitif özkaynak, büyük tutar', () => {
  test('özkaynak = 100M, tutar = 60M > 50M (% 50 eşik) → SOFT_BLOCK', () => {
    // 60M > 100M × 0.5 = 50M → TRUE → SOFT_BLOCK
    const input = makeCheckInput(60_000_000, 100_000_000, 'short')
    const result = checkTemporalRealism(input)
    expect(result.pass).toBe(false)
    expect(result.severity).toBe('SOFT_BLOCK')
    expect(result.ruleCode).toBe('HORIZON_TIMING_TOO_AGGRESSIVE')
  })

  test('özkaynak = 100M, tutar = 40M < 50M (% 50 eşik) → pass', () => {
    // 40M > 100M × 0.5 = 50M → FALSE → pass
    const input = makeCheckInput(40_000_000, 100_000_000, 'short')
    const result = checkTemporalRealism(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('PASS')
  })
})

// ─── T_SG6: checkTemporalRealism — short A10, negatif özkaynak (fix) ─────────

describe('T_SG6 — checkTemporalRealism short A10: negatif özkaynak → pass (Faz 7.3.30 fix)', () => {
  test('özkaynak = -100M, tutar = 30M → SOFT_BLOCK tetiklenmemeli', () => {
    // Eski: 30M > (-100M × 0.5) = 30M > -50M → TRUE → yanlış SOFT_BLOCK
    // Yeni: abs(-100M) = 100M, 30M > 100M × 0.5 = 50M → FALSE → pass
    const input = makeCheckInput(30_000_000, -100_000_000, 'short')
    const result = checkTemporalRealism(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('PASS')
  })

  test('özkaynak = 0, tutar = herhangi → pass (guard)', () => {
    // abs(0) = 0, absEq > 0 = false → isLarge = false → pass
    const input = makeCheckInput(50_000_000, 0, 'short')
    const result = checkTemporalRealism(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('PASS')
  })
})

// ─── T_SG7: checkTemporalRealism — medium A10, pozitif özkaynak ──────────────

describe('T_SG7 — checkTemporalRealism medium A10: pozitif özkaynak, çok büyük tutar', () => {
  test('özkaynak = 100M, tutar = 160M > 150M (1.5x eşik) → WARNING', () => {
    // 160M > 100M × 1.5 = 150M → TRUE → WARNING
    const input = makeCheckInput(160_000_000, 100_000_000, 'medium')
    const result = checkTemporalRealism(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('WARNING')
    expect(result.ruleCode).toBe('HORIZON_UNREALISTIC_AMOUNT')
  })

  test('özkaynak = 100M, tutar = 130M < 150M (1.5x eşik) → pass', () => {
    // 130M > 100M × 1.5 = 150M → FALSE → pass
    const input = makeCheckInput(130_000_000, 100_000_000, 'medium')
    const result = checkTemporalRealism(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('PASS')
  })
})

// ─── T_SG8: checkTemporalRealism — medium A10, negatif özkaynak (fix) ────────

describe('T_SG8 — checkTemporalRealism medium A10: negatif özkaynak → pass (Faz 7.3.30 fix)', () => {
  test('özkaynak = -100M, tutar = 100M → WARNING tetiklenmemeli', () => {
    // Eski: 100M > (-100M × 1.5) = 100M > -150M → TRUE → yanlış WARNING
    // Yeni: abs(-100M) = 100M, 100M > 100M × 1.5 = 150M → FALSE → pass
    const input = makeCheckInput(100_000_000, -100_000_000, 'medium')
    const result = checkTemporalRealism(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('PASS')
  })
})

// ─── T_SG9: checkLegalRegulatorySanity — A10, pozitif özkaynak ───────────────

describe('T_SG9 — checkLegalRegulatorySanity A10: pozitif özkaynak, anlamlı tutar', () => {
  test('özkaynak = 100M, tutar = 35M > %30 eşiği → INFO (genel kurul gerekli)', () => {
    // 35M > 100M × 0.3 = 30M → TRUE → INFO
    const input = makeCheckInput(35_000_000, 100_000_000, 'short')
    const result = checkLegalRegulatorySanity(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('INFO')
    expect(result.ruleCode).toBe('REQUIRES_SHAREHOLDER_APPROVAL')
  })

  test('özkaynak = 100M, tutar = 25M < %30 eşiği → pass', () => {
    // 25M > 100M × 0.3 = 30M → FALSE → pass
    const input = makeCheckInput(25_000_000, 100_000_000, 'short')
    const result = checkLegalRegulatorySanity(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('PASS')
  })
})

// ─── T_SG10: checkLegalRegulatorySanity — A10, negatif özkaynak (fix) ────────

describe('T_SG10 — checkLegalRegulatorySanity A10: negatif özkaynak → pass (Faz 7.3.30 fix)', () => {
  test('özkaynak = -100M, tutar = 10M → INFO tetiklenmemeli', () => {
    // Eski: 10M > (-100M × 0.3) = 10M > -30M → TRUE → yanlış INFO
    // Yeni: abs(-100M) = 100M, 10M > 100M × 0.3 = 30M → FALSE → pass
    const input = makeCheckInput(10_000_000, -100_000_000, 'short')
    const result = checkLegalRegulatorySanity(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('PASS')
  })

  test('özkaynak = 0, tutar = herhangi → pass (guard)', () => {
    // abs(0) = 0, absEq > 0 = false → isSignificant = false → pass
    const input = makeCheckInput(50_000_000, 0, 'short')
    const result = checkLegalRegulatorySanity(input)
    expect(result.pass).toBe(true)
    expect(result.severity).toBe('PASS')
  })
})
