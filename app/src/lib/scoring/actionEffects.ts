/**
 * Finrate — Aksiyon Etki Modeli (Faz 2)
 *
 * 5 pilot aksiyon için FinancialInput dönüşümü.
 * Her fonksiyon PURE: yan etki yok, girdiyi mutate etmez.
 *
 * A05 — Alacak tahsilat hızlandırma (DSO düşür)
 * A06 — Stok devir hızı (DIO düşür)
 * A10 — Kısa vadeli → uzun vadeli borç dönüşümü
 * A12 — Sermaye artırımı
 * A18 — Brüt marj iyileştirme
 *
 * Her fonksiyon: (input: FinancialInput, sector: string) => FinancialInput
 * Uygulanamıyorsa (kriter sağlanmıyorsa) girdiyi değiştirmeden döner.
 */

import type { FinancialInput } from './ratios'
import { getSectorBenchmark } from './benchmarks'
import { applyFeasibilityCap } from './scenarioV3/ratioHelpers'

export type SupportedActionId = 'A05' | 'A06' | 'A10' | 'A12' | 'A18'

/** Aksiyon uygulanabilirlik sonucu */
export interface ActionApplyResult {
  after:       FinancialInput
  applied:     boolean      // false: kriter sağlanmadı, input değişmedi
  reason?:     string       // applied=false ise açıklama
}

// ─── YARDIMCI ──────────────────────────────────────────────────────────────

function n(v: number | null | undefined): number {
  return v ?? 0
}

// ─── A05 — ALACAK TAHSİLAT HIZLANDIRMA ────────────────────────────────────

/**
 * Alacak tahsil süresini (DSO) TCMB sektör medyanına doğru kısar.
 * %25 cap: tek yılda mevcut bakiyenin maksimum %25'i tahsil edilebilir.
 *
 * Dönüşüm:
 *   tradeReceivables −= capped (tahsil edilen)
 *   cash             += capped (nakit girişi)
 *   totalCurrentAssets değişmez (AR→nakit yer değişimi)
 */
export function applyA05(input: FinancialInput, sector: string): ActionApplyResult {
  const ar  = n(input.tradeReceivables)
  const rev = n(input.revenue)

  if (ar <= 0 || rev <= 0) {
    return { after: input, applied: false, reason: 'AR veya gelir sıfır' }
  }

  const bm         = getSectorBenchmark(sector)
  const targetDays = bm?.receivablesDays ?? 90
  const currentDSO = (ar / rev) * 365

  // 1.1 tolerans — zaten hedefe yakınsa aksiyon önerilmez
  if (currentDSO <= targetDays * 1.1) {
    return { after: input, applied: false, reason: `DSO (${currentDSO.toFixed(0)} gün) hedef içinde` }
  }

  const targetAR = (rev * targetDays) / 365
  const capped   = applyFeasibilityCap(ar, targetAR, 0.25)

  if (capped <= 0) {
    return { after: input, applied: false, reason: 'Cap sıfır — iyileştirme imkânı yok' }
  }

  const newAR = ar - capped

  return {
    applied: true,
    after: {
      ...input,
      tradeReceivables: newAR,
      cash:             n(input.cash) + capped,
      // totalCurrentAssets: AR azaldı, nakit arttı — net sıfır
    },
  }
}

// ─── A06 — STOK DEVİR HIZI ────────────────────────────────────────────────

/**
 * Stok taşıma süresini (DIO) TCMB sektör medyanına doğru kısar.
 * %25 cap uygulanır.
 *
 * Dönüşüm:
 *   inventory −= capped (satılan/eriten stok)
 *   cash      += capped (stok nakit karşılığı)
 */
export function applyA06(input: FinancialInput, sector: string): ActionApplyResult {
  const inv  = n(input.inventory)
  const cogs = n(input.cogs) || n(input.revenue)   // COGS yoksa revenue fallback

  if (inv <= 0 || cogs <= 0) {
    return { after: input, applied: false, reason: 'Stok veya COGS sıfır' }
  }

  const bm         = getSectorBenchmark(sector)
  const targetDays = bm?.inventoryDays ?? 90
  const currentDIO = (inv / cogs) * 365

  if (currentDIO <= targetDays * 1.1) {
    return { after: input, applied: false, reason: `DIO (${currentDIO.toFixed(0)} gün) hedef içinde` }
  }

  const targetInv = (cogs * targetDays) / 365
  const capped    = applyFeasibilityCap(inv, targetInv, 0.25)

  if (capped <= 0) {
    return { after: input, applied: false, reason: 'Cap sıfır — iyileştirme imkânı yok' }
  }

  return {
    applied: true,
    after: {
      ...input,
      inventory: inv - capped,
      cash:      n(input.cash) + capped,
    },
  }
}

// ─── A10 — KISA VADELİ → UZUN VADELİ BORÇ DÖNÜŞÜMleri ─────────────────────

/**
 * Kısa vadeli finansal borcun %30'unu uzun vadeye taşır.
 *
 * Dönüşüm (bilanço yapısal değişikliği):
 *   shortTermFinancialDebt  −= convert
 *   longTermFinancialDebt   += convert
 *   totalCurrentLiabilities −= convert (kısa vade azaldı)
 *   totalNonCurrentLiabilities += convert (uzun vade arttı)
 *
 * Toplam borç değişmez — kaldıraç oranı (D/A, D/E) değişmez.
 * Etki: cari oran iyileşir (dönen borç azaldı), kısa vadeli borç oranı düşer.
 */
export function applyA10(input: FinancialInput, _sector: string): ActionApplyResult {
  const stDebt = n(input.shortTermFinancialDebt)

  if (stDebt <= 0) {
    return { after: input, applied: false, reason: 'Kısa vadeli finansal borç sıfır' }
  }

  const convert = stDebt * 0.30

  return {
    applied: true,
    after: {
      ...input,
      shortTermFinancialDebt:    stDebt - convert,
      longTermFinancialDebt:     n(input.longTermFinancialDebt) + convert,
      totalCurrentLiabilities:
        input.totalCurrentLiabilities != null
          ? input.totalCurrentLiabilities - convert
          : undefined,
      totalNonCurrentLiabilities:
        input.totalNonCurrentLiabilities != null
          ? input.totalNonCurrentLiabilities + convert
          : undefined,
    },
  }
}

// ─── A12 — SERMAYE ARTIRIMI ───────────────────────────────────────────────

/**
 * Özkaynak %20 artırılır (nakit sermaye artırımı).
 *
 * Dönüşüm:
 *   paidInCapital += increase
 *   totalEquity   += increase
 *   cash          += increase (yeni sermaye nakde dönüşüyor)
 *   totalCurrentAssets += increase
 *   totalAssets        += increase
 */
export function applyA12(input: FinancialInput, _sector: string): ActionApplyResult {
  const equity = n(input.totalEquity)

  if (equity <= 0) {
    return { after: input, applied: false, reason: 'Özkaynak negatif veya sıfır' }
  }

  const increase = equity * 0.20

  return {
    applied: true,
    after: {
      ...input,
      paidInCapital:  n(input.paidInCapital) + increase,
      totalEquity:    equity + increase,
      cash:           n(input.cash) + increase,
      totalCurrentAssets:
        input.totalCurrentAssets != null
          ? input.totalCurrentAssets + increase
          : undefined,
      totalAssets:
        input.totalAssets != null
          ? input.totalAssets + increase
          : undefined,
      totalLiabilitiesAndEquity:
        input.totalLiabilitiesAndEquity != null
          ? input.totalLiabilitiesAndEquity + increase
          : undefined,
    },
  }
}

// ─── A18 — BRÜT MARJ İYİLEŞTİRME ──────────────────────────────────────────

/**
 * Brüt kâr marjını TCMB sektör medyanına doğru iyileştirir.
 * Cap: maksimum 5 yüzde puanı iyileştirme (tek yılda gerçekçi üst sınır).
 *
 * Dönüşüm (gelir tablosu değişikliği):
 *   grossProfit += artış
 *   cogs        −= artış (maliyet düşümü)
 *   ebit        += artış
 *   ebitda      += artış (amortisman değişmez)
 *   netProfit   += artış × (1 − vergi oranı)
 *
 * Bilanço etkisi (basitleştirilmiş — dönem içi nakit birikimi):
 *   retainedEarnings += vergi-sonrası artış
 *   totalEquity      += vergi-sonrası artış
 *   totalAssets      += vergi-sonrası artış (nakit birikimi)
 */
export function applyA18(input: FinancialInput, sector: string): ActionApplyResult {
  const rev = n(input.revenue)
  const gp  = n(input.grossProfit)

  if (rev <= 0) {
    return { after: input, applied: false, reason: 'Gelir sıfır' }
  }

  const currentMargin = gp / rev
  const bm            = getSectorBenchmark(sector)
  const targetMargin  = bm?.grossMargin ?? 0.20
  const CAP_POINTS    = 0.05  // maksimum 5 puan iyileştirme
  const TAX_RATE      = 0.25

  const achievableMargin = Math.min(targetMargin, currentMargin + CAP_POINTS)

  if (achievableMargin <= currentMargin + 0.0001) {
    return { after: input, applied: false, reason: 'Brüt marj zaten hedefte' }
  }

  const newGrossProfit    = rev * achievableMargin
  const gpIncrease        = newGrossProfit - gp
  const newCogs           = rev - newGrossProfit
  const newEbit           = n(input.ebit)   + gpIncrease
  const newEbitda         = n(input.ebitda) + gpIncrease
  const netProfitIncrease = gpIncrease * (1 - TAX_RATE)
  const newNetProfit      = n(input.netProfit) + netProfitIncrease

  return {
    applied: true,
    after: {
      ...input,
      grossProfit:      newGrossProfit,
      cogs:             newCogs,
      ebit:             newEbit,
      ebitda:           newEbitda,
      netProfit:        newNetProfit,
      retainedEarnings: n(input.retainedEarnings) + netProfitIncrease,
      totalEquity:
        input.totalEquity != null
          ? input.totalEquity + netProfitIncrease
          : undefined,
      totalAssets:
        input.totalAssets != null
          ? input.totalAssets + netProfitIncrease
          : undefined,
      totalLiabilitiesAndEquity:
        input.totalLiabilitiesAndEquity != null
          ? input.totalLiabilitiesAndEquity + netProfitIncrease
          : undefined,
    },
  }
}

// ─── DISPATCH ─────────────────────────────────────────────────────────────

/** Aksiyon ID'sine göre ilgili etki fonksiyonunu çağırır */
export function applyActionToFinancialInput(
  actionId: SupportedActionId,
  input:    FinancialInput,
  sector:   string,
): ActionApplyResult {
  switch (actionId) {
    case 'A05': return applyA05(input, sector)
    case 'A06': return applyA06(input, sector)
    case 'A10': return applyA10(input, sector)
    case 'A12': return applyA12(input, sector)
    case 'A18': return applyA18(input, sector)
  }
}
