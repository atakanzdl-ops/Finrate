/**
 * SCENARIO ENGINE V3 — Layer 3.5: Quality Engine
 *
 * Ham skor delta'yı ekonomik gerçekliğe göre düzenler.
 * Bir aksiyonun "kaç puan getireceği" değil, "ne kadar gerçek" sorusunu yanıtlar.
 *
 * Formül:
 *   finalQuality = clamp(
 *     baseQuality × sustainabilityMultiplier × repeatMultiplier × sectorMultiplier
 *     + counterLegAdjustment
 *     + economicRealityAdjustment
 *     + contextAdjustment,
 *     0, 1
 *   )
 *
 *   adjustedScoreDelta = rawScoreDelta × finalQuality
 *
 * 7 Faktör:
 *   1. baseQuality              — semanticType × qualityCoefficient geometric mean
 *   2. sustainabilityMultiplier — RECURRING → ACCOUNTING_ONLY hiyerarşisi
 *   3. repeatMultiplier         — aynı aksiyon tekrar edilirse düşer
 *   4. sectorMultiplier         — primary=1.00 / applicable=0.90 / not_applicable=0.00
 *   5. counterLegAdjustment     — karşı bacak kalitesi (102 vs 331 vs reclass)
 *   6. economicRealityAdjustment— 4 boolean impact flag bonusu
 *   7. contextAdjustment        — satış trendi, dumping sinyali, aktif verimliliği
 */

import type {
  ActionTemplateV3,
  AccountingTransaction,
  SectorCode,
} from './contracts'

import {
  SEMANTIC_QUALITY_MAP,
  SUSTAINABILITY_MULTIPLIER,
} from './contracts'

// ─── Input / Output Types ─────────────────────────────────────────────────────

export interface QualityContext {
  /** Aksiyon template'i (ACTION_CATALOG_V3'ten) */
  template: ActionTemplateV3
  /** Aksiyonun ürettiği transaction'lar (buildTransactions çıktısı) */
  transactions: AccountingTransaction[]
  /** Firmanın sektörü */
  sector: SectorCode
  /** Bu aksiyonun bu scenario'da kaçıncı kez seçildiği (1-based) */
  repeatIndex: number
  /** Ham skor delta (ratio improvement'tan) */
  rawScoreDelta: number
  /** V3-8 AssetProductivity'den gelen isteğe bağlı sinyaller */
  contextSignals?: ContextSignals
}

export interface ContextSignals {
  /** Aksiyon sırasında satış da artıyor mu? */
  salesGrowthAlongside?: boolean
  /** Stok devir hızı sektör medyanının altında mı? */
  inventoryTurnoverBelowSector?: boolean
  /** Aktif verimliliği düşük mü (sales/assets sektör medyanı altı)? */
  assetProductivityLow?: boolean
  /** Stok eritiminde fiyat kırma (dumping) sinyali var mı? */
  inventoryDumpingSignal?: boolean
}

export interface QualityBreakdown {
  /** sqrt(semanticQuality × templateQuality) */
  baseQuality: number
  /** SUSTAINABILITY_MULTIPLIER'dan gelen değer */
  sustainabilityMultiplier: number
  /** Repeat decay çarpanı */
  repeatMultiplier: number
  /** Sektör uyumluluğu çarpanı */
  sectorMultiplier: number
  /** Karşı bacak analizi adjustment (−0.15 … +0.15) */
  counterLegAdjustment: number
  /** Economic reality boolean bonusu (0 … +0.15) */
  economicRealityAdjustment: number
  /** Context sinyalleri adjustment (−0.15 … +0.15) */
  contextAdjustment: number
  /** Çarpımsal kısım: baseQuality × sustainability × repeat × sector */
  multiplicativePart: number
  /** Toplam additive adjustment */
  totalAdditive: number
  /** rawFinal = multiplicativePart + totalAdditive (clamp öncesi) */
  rawFinal: number
  /** Clamp edilmiş final kalite [0, 1] */
  finalQuality: number
  /** Adım adım açıklama — audit trail */
  reasoning: string[]
}

export interface QualityResult {
  breakdown: QualityBreakdown
  rawScoreDelta: number
  /** rawScoreDelta × finalQuality */
  adjustedScoreDelta: number
}

// ─── Factor 1: Base Quality ───────────────────────────────────────────────────

/**
 * Template'in iki kalite kaynağını geometric mean ile birleştirir:
 *   - SEMANTIC_QUALITY_MAP[semanticType]  (genel tipin beklenen kalitesi)
 *   - template.qualityCoefficient         (katalog yazarının override'ı)
 *
 * Geometric mean: sapma olduğunda aşırı uç değerleri yumuşatır.
 */
export function calculateBaseQuality(template: ActionTemplateV3): number {
  const semanticBase = SEMANTIC_QUALITY_MAP[template.semanticType] ?? 0.50
  const templateBase = template.qualityCoefficient
  return Math.sqrt(semanticBase * templateBase)
}

// ─── Factor 2: Sustainability (tabloda) ──────────────────────────────────────
// SUSTAINABILITY_MULTIPLIER doğrudan contracts.ts'ten alındığı için
// ayrı fonksiyon gerekmez. calculateQuality içinde tek satırla erişilir.

// ─── Factor 3: Repeat Decay ──────────────────────────────────────────────────

/**
 * Aynı aksiyon kaç kez seçildiyse kalite düşer.
 * repeatIndex 1-based: ilk seçim=1, ikinci=2, üçüncü=3.
 * maxRepeats aşılmışsa 0 döner (motor zaten seçmemeli ama güvenlik katmanı).
 */
export function calculateRepeatMultiplier(
  template: ActionTemplateV3,
  repeatIndex: number
): number {
  const decay = template.repeatDecay
  if (repeatIndex <= 1) return decay.first
  if (repeatIndex === 2) return decay.second
  if (repeatIndex === 3) return decay.third
  // maxRepeats aşıldı
  return 0
}

// ─── Factor 4: Sector Multiplier ─────────────────────────────────────────────

interface SectorMultiplierResult {
  multiplier: number
  note: string
}

/**
 * Aksiyon bu sektörde ne kadar uygulanabilir?
 *   primary        → 1.00 (en yüksek verim)
 *   applicable     → 0.90 (genel kullanım)
 *   not_applicable → 0.00 (motor normalde buraya gelmemeli)
 */
export function calculateSectorMultiplier(
  template: ActionTemplateV3,
  sector: SectorCode
): SectorMultiplierResult {
  const compatibility = template.sectorCompatibility[sector]
  if (compatibility === 'primary') {
    return { multiplier: 1.00, note: `${sector} için birincil aksiyon` }
  }
  if (compatibility === 'applicable') {
    return { multiplier: 0.90, note: `${sector} için uygulanabilir` }
  }
  // not_applicable
  return { multiplier: 0.00, note: `${sector} için geçerli değil` }
}

// ─── Factor 5: Counter-Leg Adjustment ────────────────────────────────────────

interface CounterLegResult {
  adjustment: number
  notes: string[]
}

/**
 * Karşı bacak analizi — hangi hesaplara karşı kayıt yapıldığı kaliteyi etkiler.
 *
 * Pozitif (kalite artar):
 *   • Nakit (10x) + özkaynak (500/540/570/590) birlikte  → +0.10
 *   • Sadece nakit karşı bacağı                           → +0.05
 *
 * Negatif (kalite düşer):
 *   • Ortak cari (331/131) → özkaynak (500)              → −0.05
 *   • Saf reclass (aynı ana grup içi transfer)            → −0.08
 *
 * Nihai değer: [−0.15, +0.15] ile sınırlanır.
 */
export function calculateCounterLegAdjustment(
  transactions: AccountingTransaction[]
): CounterLegResult {
  const notes: string[] = []
  let adjustment = 0

  for (const tx of transactions) {
    const debitCodes  = tx.legs.filter(l => l.side === 'DEBIT').map(l => l.accountCode)
    const creditCodes = tx.legs.filter(l => l.side === 'CREDIT').map(l => l.accountCode)
    const allCodes    = [...debitCodes, ...creditCodes]

    const hasCash             = allCodes.some(c => c.startsWith('10'))
    const hasEquity           = allCodes.some(c =>
      c === '500' || c === '540' || c === '570' || c === '590'
    )
    const hasShareholderDebt  = allCodes.some(c => c === '131' || c === '331')
    const isPureReclass       = detectPureReclass(debitCodes, creditCodes)

    if (hasCash && hasEquity) {
      adjustment += 0.10
      notes.push('Nakit + özkaynak karşı bacağı: en kaliteli yapı (+0.10)')
    } else if (hasCash) {
      adjustment += 0.05
      notes.push('Nakit karşı bacağı: gerçek ekonomik hareket (+0.05)')
    }

    if (hasShareholderDebt && hasEquity) {
      // 331 → 500 gibi: ortak borcu sermayeye çevirme
      adjustment -= 0.05
      notes.push('Ortak cari → özkaynak: muhasebesel düzeltme (−0.05)')
    }

    if (isPureReclass) {
      adjustment -= 0.08
      notes.push('Saf reclass: ekonomik değer sınırlı (−0.08)')
    }
  }

  // ±0.15 sınırı
  adjustment = Math.max(-0.15, Math.min(0.15, adjustment))
  return { adjustment, notes }
}

/**
 * Tek leg'li debit ve credit aynı ana grupta mı?
 * (İlk hane eşitse aynı bilanço grubu = saf reclass)
 * 300/400 gibi KV→UV çifti: ikisi de pasif olduğu için ayrıca kontrol.
 */
function detectPureReclass(debitCodes: string[], creditCodes: string[]): boolean {
  if (debitCodes.length !== 1 || creditCodes.length !== 1) return false
  const d = debitCodes[0]
  const c = creditCodes[0]

  // Aynı ilk hane → aynı bilanço grubu
  if (d.charAt(0) === c.charAt(0)) return true

  // 300-399 (KV borç) ↔ 400-499 (UV borç): pasif içi reclass
  const dNum = parseInt(d, 10)
  const cNum = parseInt(c, 10)
  const dIsSTL = dNum >= 300 && dNum <= 399
  const cIsLTL = cNum >= 400 && cNum <= 499
  const dIsLTL = dNum >= 400 && dNum <= 499
  const cIsSTL = cNum >= 300 && cNum <= 399

  return (dIsSTL && cIsLTL) || (dIsLTL && cIsSTL)
}

// ─── Factor 6: Economic Reality Adjustment ───────────────────────────────────

interface EconomicRealityResult {
  adjustment: number
  notes: string[]
}

/**
 * Template'in expectedEconomicImpact boolean'larından bonus.
 * Her "true" flag kaliteye katkı sağlar.
 * Maksimum +0.15 ile sınırlanır.
 *
 * Katkılar:
 *   createsRealCash:        +0.08
 *   strengthensOperations:  +0.08  (ama toplamda cap var)
 *   realBalanceSheetGrowth: +0.05
 *   reducesRisk:            +0.04
 */
export function calculateEconomicRealityAdjustment(
  template: ActionTemplateV3
): EconomicRealityResult {
  const impact = template.expectedEconomicImpact
  const notes: string[] = []
  let adjustment = 0

  if (impact.createsRealCash) {
    adjustment += 0.08
    notes.push('Gerçek nakit yaratıyor (+0.08)')
  }
  if (impact.strengthensOperations) {
    adjustment += 0.08
    notes.push('Operasyonları güçlendiriyor (+0.08)')
  }
  if (impact.realBalanceSheetGrowth) {
    adjustment += 0.05
    notes.push('Gerçek bilanço büyümesi (+0.05)')
  }
  if (impact.reducesRisk) {
    adjustment += 0.04
    notes.push('Riski azaltıyor (+0.04)')
  }

  // Maksimum +0.15
  adjustment = Math.min(0.15, adjustment)
  return { adjustment, notes }
}

// ─── Factor 7: Context Adjustment ────────────────────────────────────────────

interface ContextAdjResult {
  adjustment: number
  notes: string[]
}

/**
 * V3-8 AssetProductivity motoruna köprü — mevcut sinyallere göre bonus/malus.
 * Sinyaller opsiyonel; yoksa sıfır döner.
 *
 * Kurallar:
 *   INVENTORY_MONETIZATION + salesGrowthAlongside    → +0.05
 *   INVENTORY_MONETIZATION + inventoryDumpingSignal  → −0.10
 *   OPERATIONAL_REVENUE    + assetProductivityLow    → +0.05
 *   Reclass semantics      + assetProductivityLow    → −0.05
 *
 * Nihai değer: [−0.15, +0.15] ile sınırlanır.
 */
export function calculateContextAdjustment(
  template: ActionTemplateV3,
  signals?: ContextSignals
): ContextAdjResult {
  if (!signals) return { adjustment: 0, notes: [] }

  const notes: string[] = []
  let adjustment = 0

  const RECLASS_SEMANTICS = new Set([
    'DEBT_RECLASSIFICATION',
    'DEBT_EXTENSION',
    'ACCOUNTING_RECLASS',
    'NON_CASH_EQUITY',
  ])

  // Stok monetizasyon sinyalleri
  if (template.semanticType === 'INVENTORY_MONETIZATION') {
    if (signals.salesGrowthAlongside) {
      adjustment += 0.05
      notes.push('Stok eritimi + satış artışı birlikte (+0.05)')
    }
    if (signals.inventoryDumpingSignal) {
      adjustment -= 0.10
      notes.push('Stok eritimi ama fiyat kırma (dumping) sinyali (−0.10)')
    }
  }

  // Satış artışı + düşük aktif verimliliği = en kritik sorunun çözümü
  if (template.semanticType === 'OPERATIONAL_REVENUE' && signals.assetProductivityLow) {
    adjustment += 0.05
    notes.push('Satış artışı + düşük aktif verimliliği: kritik sorun çözümü (+0.05)')
  }

  // Reclass aksiyonlar + düşük aktif verimliliği = yapısal sorun örtbas
  if (RECLASS_SEMANTICS.has(template.semanticType) && signals.assetProductivityLow) {
    adjustment -= 0.05
    notes.push('Reclass aksiyon + düşük aktif verimliliği: yapısal sorun reclass ile çözülmez (−0.05)')
  }

  // ±0.15 sınırı
  adjustment = Math.max(-0.15, Math.min(0.15, adjustment))
  return { adjustment, notes }
}

// ─── Ana Fonksiyon ────────────────────────────────────────────────────────────

/**
 * Aksiyonun 7 faktörlü kalite skorunu hesaplar.
 *
 * @param context — template, transactions, sector, repeatIndex, rawScoreDelta, contextSignals
 * @returns QualityResult — breakdown + rawScoreDelta + adjustedScoreDelta
 */
export function calculateQuality(context: QualityContext): QualityResult {
  const { template, transactions, sector, repeatIndex, rawScoreDelta, contextSignals } = context
  const reasoning: string[] = []

  // ── 1. Base Quality ────────────────────────────────────────────────────────
  const baseQuality = calculateBaseQuality(template)
  const semanticBase = SEMANTIC_QUALITY_MAP[template.semanticType] ?? 0.50
  reasoning.push(
    `1. Base quality: sqrt(semantic=${semanticBase.toFixed(3)} × template=${template.qualityCoefficient.toFixed(3)}) = ${baseQuality.toFixed(3)}`
  )

  // ── 2. Sustainability ──────────────────────────────────────────────────────
  const sustainabilityMultiplier = SUSTAINABILITY_MULTIPLIER[template.sustainability]
  reasoning.push(
    `2. Sustainability (${template.sustainability}): ×${sustainabilityMultiplier.toFixed(2)}`
  )

  // ── 3. Repeat Decay ────────────────────────────────────────────────────────
  const repeatMultiplier = calculateRepeatMultiplier(template, repeatIndex)
  reasoning.push(
    `3. Repeat #${repeatIndex}: ×${repeatMultiplier.toFixed(2)} (max=${template.repeatDecay.maxRepeats})`
  )

  // ── 4. Sector ──────────────────────────────────────────────────────────────
  const sectorResult = calculateSectorMultiplier(template, sector)
  reasoning.push(
    `4. Sector (${sector}): ×${sectorResult.multiplier.toFixed(2)} — ${sectorResult.note}`
  )

  // ── Çarpımsal kısım ────────────────────────────────────────────────────────
  const multiplicativePart =
    baseQuality * sustainabilityMultiplier * repeatMultiplier * sectorResult.multiplier
  reasoning.push(
    `   Multiplicative: ${baseQuality.toFixed(3)} × ${sustainabilityMultiplier} × ${repeatMultiplier} × ${sectorResult.multiplier} = ${multiplicativePart.toFixed(3)}`
  )

  // ── 5. Counter-Leg Adjustment ──────────────────────────────────────────────
  const counterLeg = calculateCounterLegAdjustment(transactions)
  if (counterLeg.notes.length > 0) {
    reasoning.push(
      `5. Counter-leg: ${counterLeg.adjustment >= 0 ? '+' : ''}${counterLeg.adjustment.toFixed(3)}`
    )
    counterLeg.notes.forEach(n => reasoning.push(`   • ${n}`))
  } else {
    reasoning.push(`5. Counter-leg: 0 (nötr)`)
  }

  // ── 6. Economic Reality Bonus ──────────────────────────────────────────────
  const ecoReality = calculateEconomicRealityAdjustment(template)
  if (ecoReality.adjustment > 0) {
    reasoning.push(
      `6. Economic reality: +${ecoReality.adjustment.toFixed(3)}`
    )
    ecoReality.notes.forEach(n => reasoning.push(`   • ${n}`))
  } else {
    reasoning.push(`6. Economic reality: 0`)
  }

  // ── 7. Context Adjustment ─────────────────────────────────────────────────
  const contextAdj = calculateContextAdjustment(template, contextSignals)
  if (contextAdj.adjustment !== 0) {
    reasoning.push(
      `7. Context: ${contextAdj.adjustment >= 0 ? '+' : ''}${contextAdj.adjustment.toFixed(3)}`
    )
    contextAdj.notes.forEach(n => reasoning.push(`   • ${n}`))
  } else {
    reasoning.push(`7. Context: 0 (sinyal yok)`)
  }

  // ── Formül ─────────────────────────────────────────────────────────────────
  const totalAdditive =
    counterLeg.adjustment + ecoReality.adjustment + contextAdj.adjustment
  const rawFinal       = multiplicativePart + totalAdditive
  const finalQuality   = Math.max(0, Math.min(1, rawFinal))

  reasoning.push(
    `Toplam: ${multiplicativePart.toFixed(3)} + ${totalAdditive.toFixed(3)} = ${rawFinal.toFixed(3)}`
  )
  reasoning.push(`Final (clamp [0,1]): ${finalQuality.toFixed(3)}`)
  reasoning.push(
    `adjustedScoreDelta: ${rawScoreDelta.toFixed(4)} × ${finalQuality.toFixed(3)} = ${(rawScoreDelta * finalQuality).toFixed(4)}`
  )

  const breakdown: QualityBreakdown = {
    baseQuality,
    sustainabilityMultiplier,
    repeatMultiplier,
    sectorMultiplier:            sectorResult.multiplier,
    counterLegAdjustment:        counterLeg.adjustment,
    economicRealityAdjustment:   ecoReality.adjustment,
    contextAdjustment:           contextAdj.adjustment,
    multiplicativePart,
    totalAdditive,
    rawFinal,
    finalQuality,
    reasoning,
  }

  return {
    breakdown,
    rawScoreDelta,
    adjustedScoreDelta: rawScoreDelta * finalQuality,
  }
}

// ─── Batch Utility ────────────────────────────────────────────────────────────

/**
 * Birden fazla aksiyon için kalite hesabı.
 * Portfolio-level özet için kullanışlı.
 */
export function calculateQualityBatch(
  contexts: QualityContext[]
): QualityResult[] {
  return contexts.map(ctx => calculateQuality(ctx))
}

/**
 * Bir aksiyon setinin ağırlıklı ortalama kalitesini döner.
 * Ağırlık: her aksiyonun |rawScoreDelta|.
 */
export function portfolioWeightedQuality(results: QualityResult[]): number {
  const totalWeight = results.reduce((sum, r) => sum + Math.abs(r.rawScoreDelta), 0)
  if (totalWeight === 0) return 0
  const weightedSum = results.reduce(
    (sum, r) => sum + r.breakdown.finalQuality * Math.abs(r.rawScoreDelta),
    0
  )
  return weightedSum / totalWeight
}
