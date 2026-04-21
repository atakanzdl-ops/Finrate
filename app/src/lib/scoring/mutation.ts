/**
 * Finrate — Bilanço Mutasyon Motoru
 *
 * applyMutation():
 *   Verilen BalanceSheet üzerine bir Partial<BalanceSheet> değişikliği uygular,
 *   öncesi/sonrası rasyo ve skorları hesaplar, farkı döner.
 *
 * Kullanım alanları:
 *   - WhatIfSimulator: "Borç %20 azalırsa skor ne olur?"
 *   - Senaryo analizi: peşin ödeme, sermaye artırımı, varlık satışı vb.
 *   - API endpoint'i: /api/groups/[id]/mutate
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
 *
 * Türetilen toplamlar:
 *   totalCurrentAssets    = dönen varlık bileşenleri toplamı
 *   totalNonCurrentAssets = duran varlık bileşenleri toplamı
 *   totalAssets           = dönen + duran
 *   totalCurrentLiabilities  = KV borç bileşenleri
 *   totalNonCurrentLiabilities = UV borç bileşenleri
 *   totalEquity           = totalAssets − totalCurrentLiabilities − totalNonCurrentLiabilities
 *
 * Gelir tablosu türetmeleri:
 *   grossProfit = revenue − costOfSales
 *   ebit        = grossProfit − operatingExpenses
 *   (ebitda = null — depreciation bilinmiyorsa hesaplanamaz)
 */
function sheetToInput(s: BalanceSheet, sector: string) {
  // ── Bilanço toplamları ────────────────────────────────────────────────────
  const totalCurrentAssets = nn(s.cash) + nn(s.tradeReceivables) + nn(s.otherReceivables)
    + nn(s.inventory) + nn(s.advancesPaid) + nn(s.otherCurrentAssets)

  const totalNonCurrentAssets = nn(s.tangibleAssets) + nn(s.intangibleAssets)
    + nn(s.otherNonCurrentAssets)

  const totalAssets = totalCurrentAssets + totalNonCurrentAssets

  const totalCurrentLiabilities = nn(s.shortTermFinancialDebt) + nn(s.tradePayables)
    + nn(s.otherShortTermLiabilities) + nn(s.advancesReceived) + nn(s.taxPayables)

  const totalNonCurrentLiabilities = nn(s.longTermFinancialDebt) + nn(s.otherLongTermLiabilities)

  // Özkaynak: bilanço denklemi (aktif − borçlar)
  const totalEquity = totalAssets - totalCurrentLiabilities - totalNonCurrentLiabilities

  // ── Gelir tablosu türetmeleri ─────────────────────────────────────────────
  const cogs        = nn(s.costOfSales)
  const grossProfit = nn(s.revenue) - cogs
  const ebit        = grossProfit - nn(s.operatingExpenses)

  return {
    // Meta
    sector,

    // Dönen varlıklar
    cash:               s.cash,
    tradeReceivables:   s.tradeReceivables,
    inventory:          s.inventory,
    prepaidSuppliers:   s.advancesPaid,
    // otherReceivables + otherCurrentAssets birleştirildi (FinancialInput tek field)
    otherCurrentAssets: sumOrNull(s.otherReceivables, s.otherCurrentAssets),
    totalCurrentAssets: totalCurrentAssets || null,

    // Duran varlıklar
    tangibleAssets:        s.tangibleAssets,
    intangibleAssets:      s.intangibleAssets,
    otherNonCurrentAssets: s.otherNonCurrentAssets,
    totalNonCurrentAssets: totalNonCurrentAssets || null,
    totalAssets:           totalAssets || null,

    // KV borçlar
    shortTermFinancialDebt: s.shortTermFinancialDebt,
    tradePayables:          s.tradePayables,
    advancesReceived:       s.advancesReceived,
    // otherShortTermLiabilities + taxPayables birleştirildi
    otherCurrentLiabilities: sumOrNull(s.otherShortTermLiabilities, s.taxPayables),
    totalCurrentLiabilities: totalCurrentLiabilities || null,

    // UV borçlar
    longTermFinancialDebt:      s.longTermFinancialDebt,
    otherNonCurrentLiabilities: s.otherLongTermLiabilities,
    totalNonCurrentLiabilities: totalNonCurrentLiabilities || null,

    // Özkaynak
    paidInCapital:             s.paidInCapital,
    retainedEarnings:          s.retainedEarnings,
    netProfitCurrentYear:      s.netProfit,
    totalEquity:               totalEquity !== 0 ? totalEquity : null,
    totalLiabilitiesAndEquity: totalAssets || null,

    // Gelir tablosu
    revenue:           s.revenue,
    cogs:              s.costOfSales,
    grossProfit:       grossProfit !== 0 ? grossProfit : null,
    operatingExpenses: s.operatingExpenses,
    ebit:              ebit !== 0 ? ebit : null,
    // ebitda: null — depreciation bilinmeden hesaplanamaz
    ebitda:            null as null,
    interestExpense:   s.interestExpense,
    netProfit:         s.netProfit,
  }
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

export function applyMutation(
  sheet:    BalanceSheet,
  mutation: Partial<BalanceSheet>,
  sector:   string,
): MutationResult {
  // 1. Mutasyon uygulandıktan sonraki bilanço
  const after: BalanceSheet = { ...sheet, ...mutation }

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
  //    balanceCheck = totalAssets − (KV borçlar + UV borçlar + özkaynak kalemleri toplamı)
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
