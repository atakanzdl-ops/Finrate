/**
 * Finrate — Konsolide Bilanço Aggregation
 *
 * Sahiplik kuralları:
 *   ownershipPct >= 50    → Tam konsolidasyon  (tüm kalemler %100 dahil)
 *   ownershipPct 20–<50  → Özkaynak yöntemi    (sadece net kâr/zarar payı)
 *   ownershipPct < 20     → Dahil edilmez
 *
 * Azınlık payı:
 *   Tam konsolidasyonda ownershipPct < 100 ise
 *   (1 - ownershipPct/100) × netProfit azınlık payı olarak ayrı tutulur.
 */

import type { RatioResult } from './ratios'
import { calculateRatios } from './ratios'
import { calculateScore, scoreToRating } from './score'

// ─── GİRİŞ TİPİ ──────────────────────────────────────────────────────────────

/** Konsolidasyona giren finansal veri — nullable alanlar DB'den gelebilir */
export interface FinancialData {
  // Dönen Varlıklar
  cash?:                         number | null
  shortTermInvestments?:         number | null
  tradeReceivables?:             number | null
  otherReceivables?:             number | null
  inventory?:                    number | null
  constructionCosts?:            number | null
  prepaidExpenses?:              number | null
  prepaidSuppliers?:             number | null
  otherCurrentAssets?:           number | null
  totalCurrentAssets?:           number | null
  // Duran Varlıklar
  longTermTradeReceivables?:     number | null
  longTermOtherReceivables?:     number | null
  longTermInvestments?:          number | null
  tangibleAssets?:               number | null
  intangibleAssets?:             number | null
  depletableAssets?:             number | null
  longTermPrepaidExpenses?:      number | null
  otherNonCurrentAssets?:        number | null
  totalNonCurrentAssets?:        number | null
  totalAssets?:                  number | null
  // Kısa Vadeli Borçlar
  shortTermFinancialDebt?:       number | null
  tradePayables?:                number | null
  otherShortTermPayables?:       number | null
  advancesReceived?:             number | null
  constructionProgress?:         number | null
  taxPayables?:                  number | null
  shortTermProvisions?:          number | null
  deferredRevenue?:              number | null
  otherCurrentLiabilities?:     number | null
  totalCurrentLiabilities?:     number | null
  // Uzun Vadeli Borçlar
  longTermFinancialDebt?:        number | null
  longTermTradePayables?:        number | null
  longTermOtherPayables?:        number | null
  longTermAdvancesReceived?:     number | null
  longTermProvisions?:           number | null
  otherNonCurrentLiabilities?:  number | null
  totalNonCurrentLiabilities?:  number | null
  // Öz Kaynaklar
  paidInCapital?:                number | null
  capitalReserves?:              number | null
  profitReserves?:               number | null
  retainedEarnings?:             number | null
  retainedLosses?:               number | null
  netProfitCurrentYear?:         number | null
  totalEquity?:                  number | null
  totalLiabilitiesAndEquity?:   number | null
  // Gelir Tablosu
  grossSales?:                   number | null
  salesDiscounts?:               number | null
  revenue?:                      number | null
  cogs?:                         number | null
  grossProfit?:                  number | null
  operatingExpenses?:            number | null
  ebit?:                         number | null
  otherIncome?:                  number | null
  otherExpense?:                 number | null
  interestExpense?:              number | null
  ebt?:                          number | null
  extraordinaryIncome?:          number | null
  extraordinaryExpense?:         number | null
  taxExpense?:                   number | null
  netProfit?:                    number | null
  depreciation?:                 number | null
  ebitda?:                       number | null
  purchases?:                    number | null
}

// ─── ÇIKIŞ TİPİ ──────────────────────────────────────────────────────────────

export interface AggregatedFinancials {
  // Bilanço — toplamlar
  totalAssets:              number
  totalCurrentAssets:       number
  totalNonCurrentAssets:    number
  totalCurrentLiabilities:  number
  totalNonCurrentLiabilities: number
  totalDebt:                number   // KV + UV borç toplamı
  shortTermFinancialDebt:   number
  longTermFinancialDebt:    number
  totalEquity:              number
  totalLiabilitiesAndEquity: number

  // Gelir tablosu — toplamlar
  revenue:          number
  cogs:             number
  grossProfit:      number
  operatingExpenses: number
  ebit:             number
  ebitda:           number
  interestExpense:  number
  ebt:              number
  netProfit:        number
  depreciation:     number

  // Azınlık payı (tam konsolidasyon + kısmi sahiplik)
  minorityInterest: number   // azınlık payına düşen net kâr/zarar toplamı

  // Meta
  fullyConsolidatedCount:  number   // ownershipPct >= 50
  equityMethodCount:       number   // 20 <= ownershipPct < 50
  excludedCount:           number   // ownershipPct < 20
}

// ─── YARDIMCI ─────────────────────────────────────────────────────────────────

function num(v: number | null | undefined): number {
  return v ?? 0
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

export function aggregateFinancials(
  entities: Array<{
    ratios:       RatioResult
    financials:   FinancialData
    ownershipPct: number   // 0–100 arası
    totalAssets:  number
  }>
): AggregatedFinancials {

  // Bilanço toplamları (sadece tam konsolidasyon)
  let totalAssets              = 0
  let totalCurrentAssets       = 0
  let totalNonCurrentAssets    = 0
  let totalCurrentLiabilities  = 0
  let totalNonCurrentLiabilities = 0
  let shortTermFinancialDebt   = 0
  let longTermFinancialDebt    = 0
  let totalEquity              = 0
  let totalLiabilitiesAndEquity = 0

  // Gelir tablosu toplamları (tam konsolidasyon)
  let revenue           = 0
  let cogs              = 0
  let grossProfit       = 0
  let operatingExpenses = 0
  let ebit              = 0
  let ebitda            = 0
  let interestExpense   = 0
  let ebt               = 0
  let netProfit         = 0
  let depreciation      = 0

  // Azınlık payı ve sayaçlar
  let minorityInterest       = 0
  let fullyConsolidatedCount = 0
  let equityMethodCount      = 0
  let excludedCount          = 0

  for (const entity of entities) {
    const { financials: f, ownershipPct } = entity

    if (ownershipPct >= 50) {
      // ── Tam konsolidasyon ─────────────────────────────────────────────────
      fullyConsolidatedCount++

      // Bilanço kalemleri — %100 dahil
      totalAssets               += num(f.totalAssets)
      totalCurrentAssets        += num(f.totalCurrentAssets)
      totalNonCurrentAssets     += num(f.totalNonCurrentAssets)
      totalCurrentLiabilities   += num(f.totalCurrentLiabilities)
      totalNonCurrentLiabilities += num(f.totalNonCurrentLiabilities)
      shortTermFinancialDebt    += num(f.shortTermFinancialDebt)
      longTermFinancialDebt     += num(f.longTermFinancialDebt)
      totalEquity               += num(f.totalEquity)
      totalLiabilitiesAndEquity += num(f.totalLiabilitiesAndEquity)

      // Gelir tablosu kalemleri — %100 dahil
      revenue           += num(f.revenue)
      cogs              += num(f.cogs)
      grossProfit       += num(f.grossProfit)
      operatingExpenses += num(f.operatingExpenses)
      ebit              += num(f.ebit)
      ebitda            += num(f.ebitda)
      interestExpense   += num(f.interestExpense)
      ebt               += num(f.ebt)
      netProfit         += num(f.netProfit)
      depreciation      += num(f.depreciation)

      // Azınlık payı: gruba ait olmayan kısım
      if (ownershipPct < 100) {
        const minorityShare = (1 - ownershipPct / 100) * num(f.netProfit)
        minorityInterest += minorityShare
      }

    } else if (ownershipPct >= 20) {
      // ── Özkaynak yöntemi ──────────────────────────────────────────────────
      // Bilanço dahil edilmez; sadece net kâr/zarar payı konsolide net kâra eklenir
      equityMethodCount++
      const equityShare = (ownershipPct / 100) * num(f.netProfit)
      netProfit += equityShare

    } else {
      // ── Dahil edilmez ─────────────────────────────────────────────────────
      excludedCount++
    }
  }

  return {
    // Bilanço
    totalAssets,
    totalCurrentAssets,
    totalNonCurrentAssets,
    totalCurrentLiabilities,
    totalNonCurrentLiabilities,
    totalDebt: totalCurrentLiabilities + totalNonCurrentLiabilities,
    shortTermFinancialDebt,
    longTermFinancialDebt,
    totalEquity,
    totalLiabilitiesAndEquity,

    // Gelir tablosu
    revenue,
    cogs,
    grossProfit,
    operatingExpenses,
    ebit,
    ebitda,
    interestExpense,
    ebt,
    netProfit,
    depreciation,

    // Azınlık payı
    minorityInterest,

    // Meta
    fullyConsolidatedCount,
    equityMethodCount,
    excludedCount,
  }
}

// ─── GRUP İÇİ ELİMİNASYONLAR ─────────────────────────────────────────────────

export interface InterCompanyEliminations {
  intercompanySales:             number  // grup içi satışlar   → gelir tablosundan düşülür
  intercompanyPurchases:         number  // grup içi alışlar    → maliyetten düşülür
  intercompanyReceivables:       number  // grup içi alacaklar  → aktiften düşülür
  intercompanyPayables:          number  // grup içi borçlar    → pasiften düşülür
  intercompanyAdvancesGiven:     number  // verilen avanslar    → aktiften düşülür
  intercompanyAdvancesReceived:  number  // alınan avanslar     → pasiften düşülür
  intercompanyProfit:            number  // grup içi kâr        → stok/sabit kıymetten ve özkaynaktan düşülür
}

/**
 * Konsolide finansallara grup içi eliminasyonları uygular.
 *
 * Eliminasyon kuralları:
 *   revenue           -= intercompanySales
 *   cogs              -= intercompanyPurchases
 *   totalAssets       -= intercompanyReceivables + intercompanyAdvancesGiven + intercompanyProfit
 *   totalCurrentLiab  -= intercompanyPayables + intercompanyAdvancesReceived  (ve totalNonCurrent'a da yansıtılır)
 *   totalEquity       -= intercompanyProfit
 *   totalDebt, totalLiabilitiesAndEquity tutarlılık için güncellenir
 *
 * Güvenlik kontrolleri:
 *   - Hiçbir kalem negatife düşemez → 0'da kesilir, konsola uyarı yazılır
 *   - Aktif ≠ Pasif+Özkaynak farkı > 1 TL ise konsola uyarı yazılır
 */
export function applyEliminations(
  aggregated: AggregatedFinancials,
  eliminations: InterCompanyEliminations,
): AggregatedFinancials {
  const e = eliminations

  // Negatife düşme koruması — 0'ın altına inerse keser ve uyarır
  function safeElim(fieldName: string, base: number, reduction: number): number {
    const result = base - reduction
    if (result < 0) {
      console.warn(
        `[consolidation] Eliminasyon uyarısı: "${fieldName}" negatife düştü ` +
        `(${base.toFixed(2)} − ${reduction.toFixed(2)} = ${result.toFixed(2)}) → 0'da kesildi.`
      )
      return 0
    }
    return result
  }

  // ── Gelir tablosu eliminasyonları ────────────────────────────────────────
  const revenue    = safeElim('revenue', aggregated.revenue, e.intercompanySales)
  const cogs       = safeElim('cogs',    aggregated.cogs,    e.intercompanyPurchases)

  // grossProfit = revenue − cogs (türetilmiş, yeniden hesapla)
  const grossProfit = Math.max(0, revenue - cogs)

  // ── Aktif eliminasyonları ─────────────────────────────────────────────────
  const assetReduction = e.intercompanyReceivables + e.intercompanyAdvancesGiven + e.intercompanyProfit
  const totalAssets    = safeElim('totalAssets', aggregated.totalAssets, assetReduction)

  // Alt-toplamları orantılı düşür — dönen varlıklar alacak/avans bölümünden
  const currentAssetReduction    = e.intercompanyReceivables + e.intercompanyAdvancesGiven
  const nonCurrentAssetReduction = e.intercompanyProfit
  const totalCurrentAssets    = safeElim('totalCurrentAssets',    aggregated.totalCurrentAssets,    currentAssetReduction)
  const totalNonCurrentAssets = safeElim('totalNonCurrentAssets', aggregated.totalNonCurrentAssets, nonCurrentAssetReduction)

  // ── Pasif eliminasyonları ─────────────────────────────────────────────────
  // Grup içi borçlar öncelikle KV borçlardan düşülür
  const liabilityReduction     = e.intercompanyPayables + e.intercompanyAdvancesReceived
  const totalCurrentLiabilities = safeElim('totalCurrentLiabilities', aggregated.totalCurrentLiabilities, liabilityReduction)
  // UV borçlar değişmez
  const totalNonCurrentLiabilities = aggregated.totalNonCurrentLiabilities

  // ── Özkaynak eliminasyonu (grup içi kâr) ─────────────────────────────────
  const totalEquity = safeElim('totalEquity', aggregated.totalEquity, e.intercompanyProfit)

  // ── Türetilmiş toplamları güncelle ────────────────────────────────────────
  const totalDebt                = totalCurrentLiabilities + totalNonCurrentLiabilities
  const totalLiabilitiesAndEquity = totalCurrentLiabilities + totalNonCurrentLiabilities + totalEquity

  // ── Aktif = Pasif+Özkaynak denge kontrolü ────────────────────────────────
  const balanceDiff = Math.abs(totalAssets - totalLiabilitiesAndEquity)
  if (balanceDiff > 1) {
    console.warn(
      `[consolidation] Denge uyarısı: Aktif (${totalAssets.toFixed(2)}) ≠ ` +
      `Pasif+Özkaynak (${totalLiabilitiesAndEquity.toFixed(2)}) — ` +
      `fark: ${balanceDiff.toFixed(2)} TL`
    )
  }

  return {
    // Bilanço
    totalAssets,
    totalCurrentAssets,
    totalNonCurrentAssets,
    totalCurrentLiabilities,
    totalNonCurrentLiabilities,
    totalDebt,
    shortTermFinancialDebt: aggregated.shortTermFinancialDebt,
    longTermFinancialDebt:  aggregated.longTermFinancialDebt,
    totalEquity,
    totalLiabilitiesAndEquity,

    // Gelir tablosu
    revenue,
    cogs,
    grossProfit,
    operatingExpenses: aggregated.operatingExpenses,
    ebit:              aggregated.ebit,
    ebitda:            aggregated.ebitda,
    interestExpense:   aggregated.interestExpense,
    ebt:               aggregated.ebt,
    netProfit:         aggregated.netProfit,
    depreciation:      aggregated.depreciation,

    // Azınlık payı ve meta — değişmez
    minorityInterest:       aggregated.minorityInterest,
    fullyConsolidatedCount: aggregated.fullyConsolidatedCount,
    equityMethodCount:      aggregated.equityMethodCount,
    excludedCount:          aggregated.excludedCount,
  }
}

// ─── KONSOLİDE SKORLAMA ───────────────────────────────────────────────────────

export interface ConsolidatedScoringResult {
  consolidatedScore:    number
  consolidatedGrade:    string
  weightedAverageScore: number
  weakestLinkApplied:   boolean
  eliminatedFinancials: AggregatedFinancials
  consolidatedRatios:   RatioResult
}

/**
 * Konsolide finansallardan nihai grup skoru üretir.
 *
 * Adımlar:
 *   1. Grup içi eliminasyonlar uygulanır.
 *   2. Eliminasyon sonrası finansallar FinancialData'ya map'lenir →
 *      mevcut calculateRatios() çağrılır.
 *   3. calculateScore() ile konsolide skor hesaplanır.
 *   4. Aktif-ağırlıklı ortalama ile ±15 puan sapma kontrolü.
 *   5. En zayıf halka guardrail: herhangi bir firma < 44 → skor ≤ 60.
 */
export function calculateConsolidatedScore(
  aggregated:       AggregatedFinancials,
  eliminations:     InterCompanyEliminations,
  sector:           string,
  individualScores: Array<{ finalScore: number; totalAssets: number }>,
): ConsolidatedScoringResult {

  // 1. Eliminasyonları uygula
  const eliminatedFinancials = applyEliminations(aggregated, eliminations)

  // 2. AggregatedFinancials → FinancialData map
  const fd = {
    sector,
    // Dönen / Duran Varlıklar
    totalCurrentAssets:        eliminatedFinancials.totalCurrentAssets,
    totalNonCurrentAssets:     eliminatedFinancials.totalNonCurrentAssets,
    totalAssets:               eliminatedFinancials.totalAssets,
    // Borçlar
    shortTermFinancialDebt:    eliminatedFinancials.shortTermFinancialDebt,
    longTermFinancialDebt:     eliminatedFinancials.longTermFinancialDebt,
    totalCurrentLiabilities:   eliminatedFinancials.totalCurrentLiabilities,
    totalNonCurrentLiabilities: eliminatedFinancials.totalNonCurrentLiabilities,
    // Özkaynak
    totalEquity:               eliminatedFinancials.totalEquity,
    totalLiabilitiesAndEquity: eliminatedFinancials.totalLiabilitiesAndEquity,
    // Gelir Tablosu
    revenue:            eliminatedFinancials.revenue,
    cogs:               eliminatedFinancials.cogs,
    grossProfit:        eliminatedFinancials.grossProfit,
    operatingExpenses:  eliminatedFinancials.operatingExpenses,
    ebit:               eliminatedFinancials.ebit,
    ebitda:             eliminatedFinancials.ebitda,
    interestExpense:    eliminatedFinancials.interestExpense,
    ebt:                eliminatedFinancials.ebt,
    netProfit:          eliminatedFinancials.netProfit,
    depreciation:       eliminatedFinancials.depreciation,
  }

  const consolidatedRatios = calculateRatios(fd)

  // 3. Konsolide skor
  const scoringResult = calculateScore(consolidatedRatios, sector)
  let consolidatedScore = scoringResult.finalScore

  // 4. Aktif-ağırlıklı ortalama kontrolü
  const totalAssetsSum = individualScores.reduce((sum, e) => sum + e.totalAssets, 0)
  const weightedAverageScore =
    totalAssetsSum > 0
      ? individualScores.reduce((sum, e) => sum + e.finalScore * e.totalAssets, 0) / totalAssetsSum
      : individualScores.reduce((sum, e) => sum + e.finalScore, 0) / (individualScores.length || 1)

  const scoreDiff = Math.abs(consolidatedScore - weightedAverageScore)
  if (scoreDiff > 15) {
    console.warn(
      `[consolidation] Skor sapma uyarısı: Konsolide skor (${consolidatedScore.toFixed(1)}) ile ` +
      `ağırlıklı ortalama (${weightedAverageScore.toFixed(1)}) arasındaki fark ` +
      `${scoreDiff.toFixed(1)} puan — eşik: 15 puan.`
    )
  }

  // 5. En zayıf halka guardrail (CCC altı < 44)
  const weakestLinkApplied = individualScores.some(e => e.finalScore < 44)
  if (weakestLinkApplied) {
    consolidatedScore = Math.min(consolidatedScore, 60)
  }

  return {
    consolidatedScore,
    consolidatedGrade:    scoreToRating(consolidatedScore),
    weightedAverageScore: Math.round(weightedAverageScore * 10) / 10,
    weakestLinkApplied,
    eliminatedFinancials,
    consolidatedRatios,
  }
}
