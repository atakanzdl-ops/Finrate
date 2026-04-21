/**
 * Finrate — Bilanço Mutasyon Motoru
 *
 * applyMutation():
 *   Verilen BalanceSheet üzerine bir Partial<BalanceSheet> delta'sı uygular.
 *   mutation içindeki her alan DELTA'dır (artış pozitif, azalış negatif).
 *   after[key] = before[key] + delta[key]
 *
 * Kullanım alanları:
 *   - Senaryo analizi: peşin ödeme, sermaye artırımı, varlık satışı vb.
 *   - API endpoint'i: /api/scenarios
 */

import { calculateRatios, type RatioResult } from './ratios'
import { calculateScore, scoreToRating, type ScoringResult } from './score'

// ─── ARAYÜZLER ───────────────────────────────────────────────────────────────

export interface BalanceSheet {
  // Dönen Varlıklar
  cash:               number | null
  tradeReceivables:   number | null
  otherReceivables:   number | null
  inventory:          number | null
  advancesPaid:       number | null   // Verilen Sipariş Avansları (159)
  otherCurrentAssets: number | null
  // Duran Varlıklar
  tangibleAssets:          number | null
  intangibleAssets:        number | null
  otherNonCurrentAssets:   number | null
  // Kısa Vadeli Borçlar
  shortTermFinancialDebt:  number | null
  tradePayables:           number | null
  otherShortTermLiabilities: number | null
  advancesReceived:        number | null   // 340 Alınan Avanslar
  taxPayables:             number | null
  // Uzun Vadeli Borçlar
  longTermFinancialDebt:   number | null
  otherLongTermLiabilities: number | null
  // Özkaynak
  paidInCapital:    number | null
  retainedEarnings: number | null
  // Gelir Tablosu
  revenue:            number | null
  costOfSales:        number | null
  operatingExpenses:  number | null
  interestExpense:    number | null
  netProfit:          number | null
}

export interface MutationResult {
  before:       BalanceSheet
  after:        BalanceSheet
  /** totalAssets − (totalLiabilities + equityItems) — 0'a yakın olmalı */
  balanceCheck: number
  ratiosBefore: RatioResult
  ratiosAfter:  RatioResult
  scoreBefore:  ScoringResult
  scoreAfter:   ScoringResult
  scoreDelta:   number
  gradeBefore:  string
  gradeAfter:   string
}

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

/** null → 0 güvenli sayı dönüşümü */
function nn(v: number | null | undefined): number {
  return v ?? 0
}

/** İki sayının toplamını döner; her ikisi de 0 ise null döner */
function sumOrNull(...vals: (number | null)[]): number | null {
  const s = vals.reduce<number>((acc, v) => acc + nn(v), 0)
  return s !== 0 ? s : null
}

// ─── BİLANÇO → FinancialInput DÖNÜŞÜMÜ ──────────────────────────────────────

/**
 * BalanceSheet'ten FinancialInput üretir.
 */
function sheetToInput(s: BalanceSheet, sector: string) {
  const totalCurrentAssets = nn(s.cash) + nn(s.tradeReceivables) + nn(s.otherReceivables)
    + nn(s.inventory) + nn(s.advancesPaid) + nn(s.otherCurrentAssets)

  const totalNonCurrentAssets = nn(s.tangibleAssets) + nn(s.intangibleAssets)
    + nn(s.otherNonCurrentAssets)

  const totalAssets = totalCurrentAssets + totalNonCurrentAssets

  const totalCurrentLiabilities = nn(s.shortTermFinancialDebt) + nn(s.tradePayables)
    + nn(s.otherShortTermLiabilities) + nn(s.advancesReceived) + nn(s.taxPayables)

  const totalNonCurrentLiabilities = nn(s.longTermFinancialDebt) + nn(s.otherLongTermLiabilities)

  const totalEquity = totalAssets - totalCurrentLiabilities - totalNonCurrentLiabilities

  const cogs        = nn(s.costOfSales)
  const grossProfit = nn(s.revenue) - cogs
  const ebit        = grossProfit - nn(s.operatingExpenses)

  return {
    sector,
    cash:               s.cash,
    tradeReceivables:   s.tradeReceivables,
    inventory:          s.inventory,
    prepaidSuppliers:   s.advancesPaid,
    otherCurrentAssets: sumOrNull(s.otherReceivables, s.otherCurrentAssets),
    totalCurrentAssets: totalCurrentAssets || null,
    tangibleAssets:        s.tangibleAssets,
    intangibleAssets:      s.intangibleAssets,
    otherNonCurrentAssets: s.otherNonCurrentAssets,
    totalNonCurrentAssets: totalNonCurrentAssets || null,
    totalAssets:           totalAssets || null,
    shortTermFinancialDebt: s.shortTermFinancialDebt,
    tradePayables:          s.tradePayables,
    advancesReceived:       s.advancesReceived,
    otherCurrentLiabilities: sumOrNull(s.otherShortTermLiabilities, s.taxPayables),
    totalCurrentLiabilities: totalCurrentLiabilities || null,
    longTermFinancialDebt:      s.longTermFinancialDebt,
    otherNonCurrentLiabilities: s.otherLongTermLiabilities,
    totalNonCurrentLiabilities: totalNonCurrentLiabilities || null,
    paidInCapital:             s.paidInCapital,
    retainedEarnings:          s.retainedEarnings,
    netProfitCurrentYear:      s.netProfit,
    totalEquity:               totalEquity !== 0 ? totalEquity : null,
    totalLiabilitiesAndEquity: totalAssets || null,
    revenue:           s.revenue,
    cogs:              s.costOfSales,
    grossProfit:       grossProfit !== 0 ? grossProfit : null,
    operatingExpenses: s.operatingExpenses,
    ebit:              ebit !== 0 ? ebit : null,
    ebitda:            null as null,
    interestExpense:   s.interestExpense,
    netProfit:         s.netProfit,
  }
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * mutation = DELTA değerleri (artış pozitif, azalış negatif).
 * after[key] = before[key] + mutation[key]
 */
export function applyMutation(
  sheet:    BalanceSheet,
  mutation: Partial<BalanceSheet>,
  sector:   string,
): MutationResult {
  // 1. Delta uygula: her alan için before + delta
  const after: BalanceSheet = { ...sheet }
  for (const key of Object.keys(mutation) as (keyof BalanceSheet)[]) {
    const delta = mutation[key]
    if (delta != null) {
      const base = (sheet[key] as number | null) ?? 0
      ;(after as unknown as Record<string, number | null>)[key] = base + (delta as number)
    }
  }

  // 2. Her ikisini FinancialInput'a dönüştür
  const inputBefore = sheetToInput(sheet, sector)
  const inputAfter  = sheetToInput(after,  sector)

  // 3. Rasyo hesabı
  const ratiosBefore = calculateRatios(inputBefore)
  const ratiosAfter  = calculateRatios(inputAfter)

  // 4. Skor hesabı
  const scoreBefore = calculateScore(ratiosBefore, sector)
  const scoreAfter  = calculateScore(ratiosAfter,  sector)

  // 5. Bilanço denge kontrolü (after bilanço üzerinden)
  const totalCurrentLiabilitiesAfter    = nn(after.shortTermFinancialDebt) + nn(after.tradePayables)
    + nn(after.otherShortTermLiabilities) + nn(after.advancesReceived) + nn(after.taxPayables)
  const totalNonCurrentLiabilitiesAfter = nn(after.longTermFinancialDebt) + nn(after.otherLongTermLiabilities)
  const equityItemsAfter = nn(after.paidInCapital) + nn(after.retainedEarnings) + nn(after.netProfit)
  const totalAssetsAfter = nn(after.cash) + nn(after.tradeReceivables) + nn(after.otherReceivables)
    + nn(after.inventory) + nn(after.advancesPaid) + nn(after.otherCurrentAssets)
    + nn(after.tangibleAssets) + nn(after.intangibleAssets) + nn(after.otherNonCurrentAssets)
  const balanceCheck = totalAssetsAfter
    - totalCurrentLiabilitiesAfter
    - totalNonCurrentLiabilitiesAfter
    - equityItemsAfter

  return {
    before:       sheet,
    after,
    balanceCheck: Math.round(balanceCheck * 100) / 100,
    ratiosBefore,
    ratiosAfter,
    scoreBefore,
    scoreAfter,
    scoreDelta:   Math.round((scoreAfter.finalScore - scoreBefore.finalScore) * 100) / 100,
    gradeBefore:  scoreToRating(scoreBefore.finalScore),
    gradeAfter:   scoreToRating(scoreAfter.finalScore),
  }
}
