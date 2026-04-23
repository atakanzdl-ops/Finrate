/**
 * SCENARIO ENGINE V3 — Layer 5: Sector Intelligence
 *
 * "Aynı rasyo farklı sektörlerde farklı anlam taşır."
 *
 * Görevler:
 *   1. SectorCode → TCMB benchmark köprüsü
 *   2. Rasyo pozisyonu hesaplama (benchmark'a göre 0–100)
 *   3. SectorProfile oluşturma (contracts.ts interface'i)
 *   4. Aksiyon–sektör uyumluluk çarpanı
 *   5. Sektör anomali tespiti
 *   6. Tam sektör zekası raporu (orchestrator çıktısı)
 */

import type { SectorCode, SectorProfile, RatioSnapshot } from './contracts'
import {
  getSectorBenchmark,
  getSectorWeights,
  type SectorBenchmark,
  type SectorWeights,
} from '../benchmarks'

// ─── SectorCode → Benchmark Key ───────────────────────────────────────────────

/**
 * V3 SectorCode (6 değer) ile TCMB sektör ismi (17 + Genel) eşleşmesi.
 * benchmarks.ts SECTOR_BENCHMARKS key'leriyle uyumlu.
 *
 * Dar sektör eşleştirme: TRADE → Toptan Ticaret (en geniş ticaret proxy'si)
 */
export const SECTOR_CODE_TO_BENCHMARK_KEY: Record<SectorCode, string> = {
  CONSTRUCTION:  'İnşaat',
  MANUFACTURING: 'İmalat',
  TRADE:         'Toptan Ticaret',
  RETAIL:        'Perakende Ticaret',
  SERVICES:      'Hizmet',
  IT:            'Bilişim',
}

/** V3 SectorCode'dan TCMB SectorBenchmark al */
export function getBenchmarkForSectorCode(sectorCode: SectorCode): SectorBenchmark {
  const key = SECTOR_CODE_TO_BENCHMARK_KEY[sectorCode]
  return getSectorBenchmark(key)
}

/** V3 SectorCode'dan sektör ağırlık profili al */
export function getSectorWeightsForCode(sectorCode: SectorCode): SectorWeights {
  const key = SECTOR_CODE_TO_BENCHMARK_KEY[sectorCode]
  return getSectorWeights(key)
}

// ─── Ratio Scoring ─────────────────────────────────────────────────────────────

/**
 * Bir rasyo için "yüksek mi iyi, düşük mü iyi?" yönü.
 * 'higher_better' → yukarı gittikçe puan artar
 * 'lower_better'  → aşağı gittikçe puan artar
 */
export type RatioDirection = 'higher_better' | 'lower_better'

/**
 * Bir rasyonun sektör benchmark'ına göre pozisyonu.
 * score: 0–100 (50 = tam benchmark; 100 = sektörün en iyisi)
 */
export interface RatioPosition {
  value:     number
  benchmark: number
  /** value / benchmark */
  ratio:     number
  /** 0–100 */
  score:     number
  grade:     'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'BELOW' | 'WEAK'
  direction: RatioDirection
  /** (value − benchmark) / |benchmark| × 100 */
  deviation: number
}

/**
 * Bir rasyonun 0–100 skorunu log₂ ölçeğiyle hesapla.
 *
 * Kural: benchmark'ta tam 50 puan.
 * higher_better: ratio × 2  → +25 puan (yani 2x benchmark = 75)
 * lower_better:  ratio / 2  → +25 puan (yani 0.5x benchmark = 75)
 * Sınır: [0, 100]
 */
export function scoreRatioAgainstBenchmark(
  value:     number,
  benchmark: number,
  direction: RatioDirection,
): RatioPosition {
  if (benchmark === 0) {
    return { value, benchmark, ratio: 0, score: 50, grade: 'AVERAGE', direction, deviation: 0 }
  }

  const ratio     = value / benchmark
  const deviation = (value - benchmark) / Math.abs(benchmark) * 100

  const rawScore  = direction === 'higher_better'
    ?  50 + Math.log2(Math.max(ratio, 0.001)) * 25
    :  50 - Math.log2(Math.max(ratio, 0.001)) * 25

  const score = Math.max(0, Math.min(100, rawScore))

  const grade: RatioPosition['grade'] =
    score >= 80 ? 'EXCELLENT' :
    score >= 60 ? 'GOOD'      :
    score >= 40 ? 'AVERAGE'   :
    score >= 20 ? 'BELOW'     : 'WEAK'

  return { value, benchmark, ratio, score, grade, direction, deviation }
}

// ─── Sector Characteristics ────────────────────────────────────────────────────

/**
 * Bir sektörün yapısal finansal özellikleri.
 * "Bu sektörde bu bilanço kalemi normaldir" bilgisi.
 */
export interface SectorCharacteristics {
  /** İnşaat: hak ediş avansları normal */
  highAdvancesReceived:    boolean
  /** İnşaat: YYİ (350–358) uzun vadeli normal */
  longWorkInProgress:      boolean
  /** Perakende/Ticaret: stok devir hızı kritik */
  highInventoryTurnover:   boolean
  /** Bilişim/Hizmet: fiziksel sabit varlık az */
  lowPhysicalAssets:       boolean
  /** İnşaat/Enerji: yüksek sabit varlık yatırımı */
  capitalIntensive:        boolean
  /** Ticaret/Perakende: kaldıraç doğal olarak yüksek */
  naturallyHighLeverage:   boolean
  /** İnşaat/Tekstil: nakit dönüşüm döngüsü uzun */
  longCashConversionCycle: boolean
  /** Ticaret/Otomotiv: marj doğal olarak dar */
  inherentlyThinMargins:   boolean
}

/** Statik sektör karakteristik tablosu */
const SECTOR_CHARACTERISTICS: Record<SectorCode, SectorCharacteristics> = {
  CONSTRUCTION: {
    highAdvancesReceived:    true,
    longWorkInProgress:      true,
    highInventoryTurnover:   false,
    lowPhysicalAssets:       false,
    capitalIntensive:        true,
    naturallyHighLeverage:   true,
    longCashConversionCycle: true,
    inherentlyThinMargins:   false,
  },
  MANUFACTURING: {
    highAdvancesReceived:    false,
    longWorkInProgress:      false,
    highInventoryTurnover:   false,
    lowPhysicalAssets:       false,
    capitalIntensive:        true,
    naturallyHighLeverage:   false,
    longCashConversionCycle: true,
    inherentlyThinMargins:   false,
  },
  TRADE: {
    highAdvancesReceived:    false,
    longWorkInProgress:      false,
    highInventoryTurnover:   true,
    lowPhysicalAssets:       true,
    capitalIntensive:        false,
    naturallyHighLeverage:   true,
    longCashConversionCycle: false,
    inherentlyThinMargins:   true,
  },
  RETAIL: {
    highAdvancesReceived:    false,
    longWorkInProgress:      false,
    highInventoryTurnover:   true,
    lowPhysicalAssets:       false,
    capitalIntensive:        false,
    naturallyHighLeverage:   true,
    longCashConversionCycle: false,
    inherentlyThinMargins:   true,
  },
  SERVICES: {
    highAdvancesReceived:    false,
    longWorkInProgress:      false,
    highInventoryTurnover:   false,
    lowPhysicalAssets:       true,
    capitalIntensive:        false,
    naturallyHighLeverage:   false,
    longCashConversionCycle: false,
    inherentlyThinMargins:   false,
  },
  IT: {
    highAdvancesReceived:    false,
    longWorkInProgress:      false,
    highInventoryTurnover:   false,
    lowPhysicalAssets:       true,
    capitalIntensive:        false,
    naturallyHighLeverage:   false,
    longCashConversionCycle: false,
    inherentlyThinMargins:   false,
  },
}

// ─── Action–Sector Multipliers ─────────────────────────────────────────────────

/**
 * Belirli bir aksiyonun belirli bir sektörde ne kadar anlamlı olduğunu gösteren çarpan.
 *
 * 1.00 = nötr
 * >1.00 = sektörde daha güçlü etki (örn. A20_YYI inşaatta 1.50)
 * <1.00 = sektörde daha zayıf etki (örn. stok aksiyonu IT'de 0.60)
 *
 * Aralık: [0.10, 1.50]
 */
export interface SectorActionMultiplier {
  actionId:   string    // prefix: "A01", "A05", vs
  sectorCode: SectorCode
  multiplier: number
  rationale:  string
}

/**
 * Aksiyon–sektör uyumluluk çarpan tablosu.
 * Sadece 1.0'dan anlamlı sapan kombinasyonlar kaydedilmiştir.
 * Kayıt yoksa getActionSectorMultiplier() 1.0 döner.
 */
const ACTION_SECTOR_MULTIPLIERS: SectorActionMultiplier[] = [

  // ── A01: KV borç → UV (yeniden sınıflandırma) ────────────────────────────────
  { actionId: 'A01', sectorCode: 'CONSTRUCTION',  multiplier: 1.20, rationale: 'İnşaatta borç yapısı en kritik kalem — KV→UV anlamlı' },
  { actionId: 'A01', sectorCode: 'MANUFACTURING', multiplier: 1.10, rationale: 'İmalatta uzun vadeli borç normaldir' },
  { actionId: 'A01', sectorCode: 'TRADE',         multiplier: 0.85, rationale: 'Ticarette KV borç yapısaldır, reclass banka gözünde zayıf' },
  { actionId: 'A01', sectorCode: 'RETAIL',        multiplier: 0.80, rationale: 'Perakende KV borcu yapısal — reclass az etki' },
  { actionId: 'A01', sectorCode: 'IT',            multiplier: 0.90, rationale: 'IT zaten az borçlu' },

  // ── A02: Vade uzatma ──────────────────────────────────────────────────────────
  { actionId: 'A02', sectorCode: 'CONSTRUCTION',  multiplier: 1.15, rationale: 'İnşaat proje döngüsü uzundur — vade uzatma tutarlı' },
  { actionId: 'A02', sectorCode: 'MANUFACTURING', multiplier: 1.05, rationale: 'Hafif olumlu' },
  { actionId: 'A02', sectorCode: 'TRADE',         multiplier: 0.90, rationale: 'Ticaret döngüsü kısadır' },
  { actionId: 'A02', sectorCode: 'RETAIL',        multiplier: 0.85, rationale: 'Kısa döngü — düşük etki' },
  { actionId: 'A02', sectorCode: 'IT',            multiplier: 0.85, rationale: 'IT borcu zaten az' },

  // ── A05: Stok satışı / envanter monetizasyon ──────────────────────────────────
  { actionId: 'A05', sectorCode: 'CONSTRUCTION',  multiplier: 1.10, rationale: 'İnşaatta yarı-mamul stok önemli' },
  { actionId: 'A05', sectorCode: 'MANUFACTURING', multiplier: 1.30, rationale: 'İmalat için birincil nakit üretme kanalı' },
  { actionId: 'A05', sectorCode: 'TRADE',         multiplier: 1.20, rationale: 'Stok nakde dönüş ticarette ana iş' },
  { actionId: 'A05', sectorCode: 'RETAIL',        multiplier: 1.25, rationale: 'Perakendenin kalbi stok devir hızı' },
  { actionId: 'A05', sectorCode: 'SERVICES',      multiplier: 0.70, rationale: 'Hizmette stok minimaldır' },
  { actionId: 'A05', sectorCode: 'IT',            multiplier: 0.60, rationale: 'IT şirketinde stok yok veya ihmal edilebilir' },

  // ── A06: Alacak tahsili ───────────────────────────────────────────────────────
  { actionId: 'A06', sectorCode: 'CONSTRUCTION',  multiplier: 1.20, rationale: 'Hak ediş gecikmeleri inşaatın en büyük riski' },
  { actionId: 'A06', sectorCode: 'MANUFACTURING', multiplier: 1.15, rationale: 'DSO 53 gün — tahsilat kritik' },
  { actionId: 'A06', sectorCode: 'TRADE',         multiplier: 1.10, rationale: 'Ticari alacak yönetimi kritik' },
  { actionId: 'A06', sectorCode: 'RETAIL',        multiplier: 0.80, rationale: 'Perakende genellikle nakit/POS' },
  { actionId: 'A06', sectorCode: 'SERVICES',      multiplier: 1.10, rationale: 'Hizmet alacakları uzayabilir' },
  { actionId: 'A06', sectorCode: 'IT',            multiplier: 1.25, rationale: 'IT DSO sektörde en yüksek (65 gün) — tahsilat kritik' },

  // ── A10: Nakit sermaye artırımı ───────────────────────────────────────────────
  { actionId: 'A10', sectorCode: 'CONSTRUCTION',  multiplier: 1.20, rationale: 'D/E 1.90 — nakit sermaye etkisi çok büyük' },
  { actionId: 'A10', sectorCode: 'MANUFACTURING', multiplier: 1.10, rationale: 'D/E 0.93 — orta-yüksek etki' },
  { actionId: 'A10', sectorCode: 'TRADE',         multiplier: 1.05, rationale: 'Yüksek kaldıraç bağlamında olumlu' },
  { actionId: 'A10', sectorCode: 'RETAIL',        multiplier: 1.05, rationale: 'Hafif olumlu' },
  { actionId: 'A10', sectorCode: 'IT',            multiplier: 0.95, rationale: 'IT zaten az kaldıraçlı — marjinal etki' },

  // ── A15: Ortak borcu özkaynak swap ───────────────────────────────────────────
  { actionId: 'A15', sectorCode: 'CONSTRUCTION',  multiplier: 1.10, rationale: 'Yüksek kaldıraç yapısında swap çok etkili' },
  { actionId: 'A15', sectorCode: 'TRADE',         multiplier: 0.95, rationale: 'Hafif zayıf' },
  { actionId: 'A15', sectorCode: 'RETAIL',        multiplier: 0.90, rationale: 'Az etkili' },
  { actionId: 'A15', sectorCode: 'IT',            multiplier: 0.90, rationale: 'IT borcu zaten düşük' },

  // ── A18: Net satış büyümesi ───────────────────────────────────────────────────
  { actionId: 'A18', sectorCode: 'CONSTRUCTION',  multiplier: 1.10, rationale: 'İnşaat büyümesi YYİ hakedişiyle örtüşür' },
  { actionId: 'A18', sectorCode: 'MANUFACTURING', multiplier: 1.20, rationale: 'İmalat gelir büyümesi güçlü sinyal' },
  { actionId: 'A18', sectorCode: 'TRADE',         multiplier: 1.15, rationale: 'Ticaret hacim büyümesi sektörün özü' },
  { actionId: 'A18', sectorCode: 'RETAIL',        multiplier: 1.20, rationale: 'Perakende büyümesi stok + nakit dengesini değiştirir' },
  { actionId: 'A18', sectorCode: 'SERVICES',      multiplier: 1.10, rationale: 'Hizmet büyümesi marj odaklı' },
  { actionId: 'A18', sectorCode: 'IT',            multiplier: 1.30, rationale: 'IT büyümesi düşük CAPEX ile yüksek etki' },

  // ── A19: Alınan avansı hasılata tanıma ───────────────────────────────────────
  { actionId: 'A19', sectorCode: 'CONSTRUCTION',  multiplier: 1.25, rationale: 'Avans hakediş teslimi inşaatın çekirdeği' },
  { actionId: 'A19', sectorCode: 'MANUFACTURING', multiplier: 1.10, rationale: 'Peşin siparişlerde uygulanabilir' },
  { actionId: 'A19', sectorCode: 'TRADE',         multiplier: 0.95, rationale: 'Az yaygın' },
  { actionId: 'A19', sectorCode: 'IT',            multiplier: 1.10, rationale: 'Yazılım proje tesliminde geçerli' },

  // ── A20: YYİ monetizasyon — inşaat birincil ───────────────────────────────────
  { actionId: 'A20', sectorCode: 'CONSTRUCTION',  multiplier: 1.50, rationale: 'YYİ inşaatın can damarı — tahsilat=nakit=hayat' },
  { actionId: 'A20', sectorCode: 'MANUFACTURING', multiplier: 0.20, rationale: 'YYİ imalatta nadir' },
  { actionId: 'A20', sectorCode: 'TRADE',         multiplier: 0.10, rationale: 'YYİ ticarette yok' },
  { actionId: 'A20', sectorCode: 'RETAIL',        multiplier: 0.10, rationale: 'Geçersiz' },
  { actionId: 'A20', sectorCode: 'SERVICES',      multiplier: 0.30, rationale: 'Uzun vadeli hizmet sözleşmesi varsa kısmi uyum' },
  { actionId: 'A20', sectorCode: 'IT',            multiplier: 0.40, rationale: 'Yazılım projeleri için kısmi uyum' },
]

/**
 * Aksiyon–sektör çarpanını getir.
 * actionId'i prefix'e indirir: "A01_ST_FIN_DEBT_TO_LT" → "A01"
 * Kayıt bulunamazsa multiplier=1.00 (nötr) döner.
 */
export function getActionSectorMultiplier(
  actionId:   string,
  sectorCode: SectorCode,
): SectorActionMultiplier {
  const prefix = actionId.split('_')[0]

  return (
    ACTION_SECTOR_MULTIPLIERS.find(
      m => m.actionId === prefix && m.sectorCode === sectorCode
    ) ?? {
      actionId:   prefix,
      sectorCode,
      multiplier: 1.00,
      rationale:  'Varsayılan sektör çarpanı (kayıt yok)',
    }
  )
}

// ─── Ratio Snapshot Scoring ────────────────────────────────────────────────────

/** scoreRatioSnapshot dönüş tipi */
export interface RatioSnapshotScoreResult {
  positions:           Partial<Record<string, RatioPosition>>
  liquidityScore:      number
  profitabilityScore:  number
  leverageScore:       number
  activityScore:       number
  overallScore:        number
  overallGrade:        RatioPosition['grade']
}

/**
 * RatioSnapshot içindeki rasyoları sektör benchmarkına göre skorla.
 * Kategori ağırlıkları SECTOR_WEIGHTS'ten gelir.
 */
export function scoreRatioSnapshot(
  ratios:     RatioSnapshot,
  sectorCode: SectorCode,
): RatioSnapshotScoreResult {
  const bm      = getBenchmarkForSectorCode(sectorCode)
  const weights = getSectorWeightsForCode(sectorCode)

  // Karşılaştırma çifti listesi
  const comparisons: Array<{
    key:      string
    value:    number
    bmValue:  number
    dir:      RatioDirection
    category: 'liquidity' | 'profitability' | 'leverage' | 'activity'
  }> = [
    { key: 'currentRatio',    value: ratios.currentRatio,    bmValue: bm.currentRatio,    dir: 'higher_better', category: 'liquidity'     },
    { key: 'quickRatio',      value: ratios.quickRatio,      bmValue: bm.quickRatio,      dir: 'higher_better', category: 'liquidity'     },
    { key: 'cashRatio',       value: ratios.cashRatio,       bmValue: bm.cashRatio,       dir: 'higher_better', category: 'liquidity'     },
    { key: 'debtToEquity',    value: ratios.debtToEquity,    bmValue: bm.debtToEquity,    dir: 'lower_better',  category: 'leverage'      },
    { key: 'interestCoverage',value: ratios.interestCoverage,bmValue: bm.interestCoverage,dir: 'higher_better', category: 'leverage'      },
    { key: 'assetTurnover',   value: ratios.assetTurnover,   bmValue: bm.assetTurnover,   dir: 'higher_better', category: 'activity'      },
    { key: 'operatingMargin', value: ratios.operatingMargin, bmValue: bm.ebitMargin,      dir: 'higher_better', category: 'profitability' },
    { key: 'roa',             value: ratios.roa,             bmValue: bm.roa,             dir: 'higher_better', category: 'profitability' },
  ]

  const positions: Partial<Record<string, RatioPosition>> = {}
  const catBuckets: Record<string, number[]> = {
    liquidity: [], profitability: [], leverage: [], activity: [],
  }

  for (const c of comparisons) {
    if (c.value === 0 && c.bmValue === 0) continue
    const pos = scoreRatioAgainstBenchmark(c.value, c.bmValue, c.dir)
    positions[c.key] = pos
    catBuckets[c.category].push(pos.score)
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 50

  const liquidityScore     = avg(catBuckets['liquidity'])
  const profitabilityScore = avg(catBuckets['profitability'])
  const leverageScore      = avg(catBuckets['leverage'])
  const activityScore      = avg(catBuckets['activity'])

  const overallScore =
    liquidityScore     * weights.liquidity     +
    profitabilityScore * weights.profitability +
    leverageScore      * weights.leverage      +
    activityScore      * weights.activity

  const overallGrade: RatioPosition['grade'] =
    overallScore >= 80 ? 'EXCELLENT' :
    overallScore >= 60 ? 'GOOD'      :
    overallScore >= 40 ? 'AVERAGE'   :
    overallScore >= 20 ? 'BELOW'     : 'WEAK'

  return {
    positions,
    liquidityScore,
    profitabilityScore,
    leverageScore,
    activityScore,
    overallScore,
    overallGrade,
  }
}

// ─── Sector Anomaly Detection ──────────────────────────────────────────────────

export interface SectorAnomaly {
  type:       'CRITICAL' | 'WARNING' | 'INFO'
  code:       string
  message:    string
  ratio?:     string
  value?:     number
  benchmark?: number
}

/**
 * Sektör normlarına göre anomali tespiti.
 * Çıktı: kalite motoruna ve rating reasoning'e girdi olarak kullanılır.
 */
export function detectSectorAnomalies(
  sectorCode: SectorCode,
  ratios:     RatioSnapshot,
): SectorAnomaly[] {
  const bm      = getBenchmarkForSectorCode(sectorCode)
  const chars   = SECTOR_CHARACTERISTICS[sectorCode]
  const result: SectorAnomaly[] = []

  // ── Evrensel: Likidite ─────────────────────────────────────────────────────
  if (ratios.currentRatio < bm.currentRatio * 0.50) {
    result.push({
      type: 'CRITICAL', code: 'LIQUIDITY_CRISIS',
      message: `Cari oran sektör ortalamasının yarısından düşük (${ratios.currentRatio.toFixed(2)} / ${bm.currentRatio.toFixed(2)})`,
      ratio: 'currentRatio', value: ratios.currentRatio, benchmark: bm.currentRatio,
    })
  } else if (ratios.currentRatio < bm.currentRatio * 0.75) {
    result.push({
      type: 'WARNING', code: 'LIQUIDITY_BELOW',
      message: `Cari oran sektör ortalamasının belirgin altında (${ratios.currentRatio.toFixed(2)} / ${bm.currentRatio.toFixed(2)})`,
      ratio: 'currentRatio', value: ratios.currentRatio, benchmark: bm.currentRatio,
    })
  }

  // ── Evrensel: Kaldıraç ─────────────────────────────────────────────────────
  if (!chars.naturallyHighLeverage) {
    if (ratios.debtToEquity > bm.debtToEquity * 2.0) {
      result.push({
        type: 'CRITICAL', code: 'OVERLEVERAGED',
        message: `Borç/özkaynak sektör normunun 2 katı (${ratios.debtToEquity.toFixed(2)} / ${bm.debtToEquity.toFixed(2)})`,
        ratio: 'debtToEquity', value: ratios.debtToEquity, benchmark: bm.debtToEquity,
      })
    } else if (ratios.debtToEquity > bm.debtToEquity * 1.5) {
      result.push({
        type: 'WARNING', code: 'HIGH_LEVERAGE',
        message: `Borç/özkaynak sektör normunun %50 üstünde`,
        ratio: 'debtToEquity', value: ratios.debtToEquity, benchmark: bm.debtToEquity,
      })
    }
  } else {
    // Yüksek kaldıraç sektöründe bile aşırı olabilir
    if (ratios.debtToEquity > bm.debtToEquity * 2.5) {
      result.push({
        type: 'WARNING', code: 'LEVERAGE_EXTREME',
        message: `Sektör yüksek kaldıraçlı olsa da ${ratios.debtToEquity.toFixed(2)} aşırı (norm ${bm.debtToEquity.toFixed(2)})`,
        ratio: 'debtToEquity', value: ratios.debtToEquity, benchmark: bm.debtToEquity,
      })
    }
  }

  // ── Evrensel: Faiz karşılama ───────────────────────────────────────────────
  if (ratios.interestCoverage > 0 && ratios.interestCoverage < bm.interestCoverage * 0.40) {
    result.push({
      type: 'CRITICAL', code: 'INTEREST_COVERAGE_CRITICAL',
      message: `Faiz karşılama kritik (${ratios.interestCoverage.toFixed(2)}x / sektör ${bm.interestCoverage.toFixed(2)}x)`,
      ratio: 'interestCoverage', value: ratios.interestCoverage, benchmark: bm.interestCoverage,
    })
  } else if (ratios.interestCoverage > 0 && ratios.interestCoverage < bm.interestCoverage * 0.65) {
    result.push({
      type: 'WARNING', code: 'INTEREST_COVERAGE_LOW',
      message: `Faiz karşılama sektör ortalamasının altında`,
      ratio: 'interestCoverage', value: ratios.interestCoverage, benchmark: bm.interestCoverage,
    })
  }

  // ── Sektöre özel: Aktif verimliliği ───────────────────────────────────────
  if (
    (sectorCode === 'MANUFACTURING' || sectorCode === 'TRADE' || sectorCode === 'RETAIL') &&
    ratios.assetTurnover < bm.assetTurnover * 0.40
  ) {
    result.push({
      type: 'CRITICAL', code: 'VERY_LOW_ASSET_PRODUCTIVITY',
      message: `Aktif devir hızı sektör ortalamasının %40 altında — varlıklar üretken değil (${ratios.assetTurnover.toFixed(2)} / ${bm.assetTurnover.toFixed(2)})`,
      ratio: 'assetTurnover', value: ratios.assetTurnover, benchmark: bm.assetTurnover,
    })
  } else if (
    (sectorCode === 'MANUFACTURING' || sectorCode === 'TRADE') &&
    ratios.assetTurnover < bm.assetTurnover * 0.65
  ) {
    result.push({
      type: 'WARNING', code: 'LOW_ASSET_PRODUCTIVITY',
      message: `Aktif devir hızı sektörün altında`,
      ratio: 'assetTurnover', value: ratios.assetTurnover, benchmark: bm.assetTurnover,
    })
  }

  // ── İmalat: Faaliyet marjı ─────────────────────────────────────────────────
  if (sectorCode === 'MANUFACTURING' && ratios.operatingMargin < bm.ebitMargin * 0.30) {
    result.push({
      type: 'WARNING', code: 'THIN_MARGINS_MANUFACTURING',
      message: 'Faaliyet marjı imalat ortalamasının çok altında — maliyet baskısı',
      ratio: 'operatingMargin', value: ratios.operatingMargin, benchmark: bm.ebitMargin,
    })
  }

  // ── IT: Margin benchmark ──────────────────────────────────────────────────
  if (sectorCode === 'IT' && ratios.operatingMargin < bm.ebitMargin * 0.50) {
    result.push({
      type: 'WARNING', code: 'IT_MARGIN_BELOW_BENCHMARK',
      message: 'IT sektöründe faaliyet marjı ortalamanın yarısından düşük',
      ratio: 'operatingMargin', value: ratios.operatingMargin, benchmark: bm.ebitMargin,
    })
  }

  // ── İnşaat: Minimum likidite ──────────────────────────────────────────────
  if (sectorCode === 'CONSTRUCTION' && ratios.currentRatio < 1.10) {
    result.push({
      type: 'WARNING', code: 'CONSTRUCTION_THIN_LIQUIDITY',
      message: 'İnşaatta cari oran 1.10 altı — proje nakit akışı riski yüksek',
      ratio: 'currentRatio', value: ratios.currentRatio,
    })
  }

  // ── Hizmet/IT: Equity ratio ────────────────────────────────────────────────
  if (
    (sectorCode === 'SERVICES' || sectorCode === 'IT') &&
    ratios.equityRatio < 0.25
  ) {
    result.push({
      type: 'WARNING', code: 'SERVICE_LOW_EQUITY',
      message: 'Hizmet/IT şirketinde özkaynak oranı düşük — banka için olumsuz',
      ratio: 'equityRatio', value: ratios.equityRatio,
    })
  }

  return result
}

// ─── Action Priorities ─────────────────────────────────────────────────────────

export interface ActionPriority {
  actionId: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  reason:   string
}

/**
 * Sektör bağlamı + mevcut rasyo pozisyonuna göre en yüksek öncelikli aksiyonları belirle.
 * RatingReasoning (Layer 6) için stratejik girdi sağlar.
 */
function deriveActionPriorities(
  sectorCode: SectorCode,
  ratios:     RatioSnapshot,
  bm:         SectorBenchmark,
): ActionPriority[] {
  const priorities: ActionPriority[] = []

  // Borç yapısı kritikse
  if (ratios.debtToEquity > bm.debtToEquity * 1.30) {
    priorities.push({
      actionId: 'A10',
      priority: 'HIGH',
      reason:   `D/E ${ratios.debtToEquity.toFixed(2)} > sektör ${bm.debtToEquity.toFixed(2)} — nakit sermaye kaldıraç baskısını en hızlı çözer`,
    })
    if (sectorCode === 'CONSTRUCTION') {
      priorities.push({
        actionId: 'A15',
        priority: 'MEDIUM',
        reason:   'Ortak borcu özkaynağa çevirme yüksek kaldıraçlı yapıda makul alternatif',
      })
    }
  }

  // Likidite kritikse
  if (ratios.currentRatio < bm.currentRatio * 0.80) {
    priorities.push({
      actionId: 'A06',
      priority: 'HIGH',
      reason:   `Cari oran ${ratios.currentRatio.toFixed(2)} — alacak tahsili likit kıymet yaratır`,
    })
    if (sectorCode !== 'IT' && sectorCode !== 'SERVICES') {
      priorities.push({
        actionId: 'A05',
        priority: 'HIGH',
        reason:   'Stok monetizasyonu likiditeyi anında kuvvetlendirir',
      })
    }
  }

  // Aktif verimlilik düşükse (imalat/ticaret/perakende)
  if (
    (sectorCode === 'MANUFACTURING' || sectorCode === 'TRADE' || sectorCode === 'RETAIL') &&
    ratios.assetTurnover < bm.assetTurnover * 0.60
  ) {
    priorities.push({
      actionId: 'A05',
      priority: 'HIGH',
      reason:   `Aktif devir hızı ${ratios.assetTurnover.toFixed(2)} / sektör ${bm.assetTurnover.toFixed(2)} — stok/alacak yönetimi acil`,
    })
    priorities.push({
      actionId: 'A06',
      priority: 'HIGH',
      reason:   'Alacak tahsili aktif verimliliğini doğrudan artırır',
    })
  }

  // İnşaat'a özel
  if (sectorCode === 'CONSTRUCTION') {
    priorities.push({
      actionId: 'A20',
      priority: 'HIGH',
      reason:   'YYİ hakediş tahsilatı inşaatın birincil nakit kaynağı',
    })
    priorities.push({
      actionId: 'A19',
      priority: 'MEDIUM',
      reason:   'Alınan avansları hasılata dönüştür — bilanço temizlenir',
    })
  }

  // IT'ye özel
  if (sectorCode === 'IT') {
    priorities.push({
      actionId: 'A06',
      priority: 'HIGH',
      reason:   `IT DSO yüksek (sektör ${bm.receivablesDays} gün) — tahsilat en kritik aksiyon`,
    })
    priorities.push({
      actionId: 'A18',
      priority: 'HIGH',
      reason:   'IT büyümesi düşük CAPEX ile büyük rasyo değişimi sağlar',
    })
  }

  // Ortak: satış büyümesi her sektörde değerli
  if (ratios.operatingMargin < bm.ebitMargin * 0.60) {
    priorities.push({
      actionId: 'A18',
      priority: 'MEDIUM',
      reason:   'Faaliyet marjı sektör ortalamasının altında — gelir kalitesini artır',
    })
  }

  // Faiz karşılama düşükse
  if (ratios.interestCoverage > 0 && ratios.interestCoverage < bm.interestCoverage * 0.65) {
    priorities.push({
      actionId: 'A03',
      priority: 'MEDIUM',
      reason:   'Düşük faiz karşılama — finansman maliyeti azaltma gerekli',
    })
  }

  return priorities
}

// ─── Sector Intelligence Report ───────────────────────────────────────────────

/**
 * Sektör zekası tam raporu.
 * engineV3.ts orchestrator tarafından her senaryo başında üretilir.
 */
export interface SectorIntelligenceReport {
  sectorCode:          SectorCode
  benchmarkLabel:      string

  // Kategori skorları (0–100)
  liquidityScore:      number
  profitabilityScore:  number
  leverageScore:       number
  activityScore:       number
  overallScore:        number
  overallGrade:        RatioPosition['grade']

  // Detay pozisyonları
  positions:           Partial<Record<string, RatioPosition>>

  // Sektör yapısal özellikleri
  characteristics:     SectorCharacteristics

  // Anomaliler
  anomalies:           SectorAnomaly[]

  // Strateji öncelikleri (Layer 6 için)
  actionPriorities:    ActionPriority[]

  // Sektörün benchmark özeti
  benchmarkSnapshot: {
    currentRatio:     number
    debtToEquity:     number
    assetTurnover:    number
    ebitMargin:       number
    interestCoverage: number
    receivablesDays:  number
  }
}

/**
 * Tam sektör zekası raporu üret.
 * V3 orkestratörünün Layer 5 giriş noktası.
 */
export function buildSectorIntelligenceReport(
  sectorCode: SectorCode,
  ratios:     RatioSnapshot,
): SectorIntelligenceReport {
  const bm      = getBenchmarkForSectorCode(sectorCode)
  const chars   = SECTOR_CHARACTERISTICS[sectorCode]
  const scored  = scoreRatioSnapshot(ratios, sectorCode)
  const anomalies        = detectSectorAnomalies(sectorCode, ratios)
  const actionPriorities = deriveActionPriorities(sectorCode, ratios, bm)

  return {
    sectorCode,
    benchmarkLabel:      bm.label,
    liquidityScore:      scored.liquidityScore,
    profitabilityScore:  scored.profitabilityScore,
    leverageScore:       scored.leverageScore,
    activityScore:       scored.activityScore,
    overallScore:        scored.overallScore,
    overallGrade:        scored.overallGrade,
    positions:           scored.positions,
    characteristics:     chars,
    anomalies,
    actionPriorities,
    benchmarkSnapshot: {
      currentRatio:     bm.currentRatio,
      debtToEquity:     bm.debtToEquity,
      assetTurnover:    bm.assetTurnover,
      ebitMargin:       bm.ebitMargin,
      interestCoverage: bm.interestCoverage,
      receivablesDays:  bm.receivablesDays,
    },
  }
}

// ─── SectorProfile Builder ─────────────────────────────────────────────────────

/**
 * contracts.ts SectorProfile interface'ini doldur.
 * EngineV3Output.sectorProfile için kullanılır.
 */
export function buildSectorProfile(sectorCode: SectorCode): SectorProfile {
  const bm    = getBenchmarkForSectorCode(sectorCode)
  const chars = SECTOR_CHARACTERISTICS[sectorCode]

  const actionApplicability: Record<string, 'primary' | 'applicable' | 'not_applicable'> = {
    A01: sectorCode === 'CONSTRUCTION' || sectorCode === 'MANUFACTURING'  ? 'primary' : 'applicable',
    A02: sectorCode === 'CONSTRUCTION'                                     ? 'primary' : 'applicable',
    A05: (sectorCode === 'MANUFACTURING' || sectorCode === 'TRADE' || sectorCode === 'RETAIL')
           ? 'primary'
           : sectorCode === 'IT' ? 'not_applicable' : 'applicable',
    A06: 'primary',
    A10: 'primary',
    A15: sectorCode === 'CONSTRUCTION'                                     ? 'primary' : 'applicable',
    A18: 'primary',
    A19: sectorCode === 'CONSTRUCTION'                                     ? 'primary' : 'applicable',
    A20: sectorCode === 'CONSTRUCTION'                                     ? 'primary' : 'not_applicable',
  }

  const equityRatioMedian = 1 - bm.debtToAssets

  return {
    sectorCode,
    typicalRatios: {
      currentRatio:    { min: bm.currentRatio  * 0.60, median: bm.currentRatio,   max: bm.currentRatio  * 1.50 },
      equityRatio:     { min: equityRatioMedian * 0.70, median: equityRatioMedian, max: equityRatioMedian * 1.30 },
      debtToEquity:    { min: bm.debtToEquity  * 0.30, median: bm.debtToEquity,   max: bm.debtToEquity  * 2.00 },
      assetTurnover:   { min: bm.assetTurnover * 0.40, median: bm.assetTurnover,  max: bm.assetTurnover * 1.80 },
      operatingMargin: { min: bm.ebitMargin    * 0.30, median: bm.ebitMargin,     max: bm.ebitMargin    * 2.00 },
    },
    normalCharacteristics: {
      highAdvancesReceived:  chars.highAdvancesReceived,
      longWorkInProgress:    chars.longWorkInProgress,
      highInventoryTurnover: chars.highInventoryTurnover,
      lowPhysicalAssets:     chars.lowPhysicalAssets,
    },
    actionApplicability,
  }
}

// ─── Quality Delta Converter ───────────────────────────────────────────────────

/**
 * Sektör zekası + aksiyon uyumu → kalite motoru ek düzeltmesi.
 *
 * qualityEngine.ts calculateSectorMultiplier() bu fonksiyonu kullanır.
 * Döner: [-0.10, +0.10] aralığında kalite delta'sı.
 *
 * İki bileşen:
 *  1. Sektör pozisyonu: şirket sektörde iyi/kötü konumdaysa aksiyon etkisi farklıdır
 *  2. Aksiyon-sektör çarpanı: bu aksiyonun bu sektörde ne kadar anlam ifade ettiği
 */
export function sectorScoreToQualityDelta(
  sectorScore: number,
  actionId:    string,
  sectorCode:  SectorCode,
): number {
  const multiplierRecord = getActionSectorMultiplier(actionId, sectorCode)
  const m = multiplierRecord.multiplier

  // sectorScore: 0–100 → -0.05 ile +0.05
  const positionDelta   = (sectorScore - 50) / 50 * 0.05

  // m: 0.10–1.50 → 1.0 nötr; sapma [-0.09, +0.05]
  const multiplierDelta = (m - 1.0) * 0.10

  return Math.max(-0.10, Math.min(0.10, positionDelta + multiplierDelta))
}
