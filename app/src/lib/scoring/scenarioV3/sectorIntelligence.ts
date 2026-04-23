/**
 * SECTOR INTELLIGENCE (V3-6) — TCMB BENCHMARK BAĞLANTILI NORMALIZATION LAYER
 *
 * VERİ KAYNAĞI: src/lib/scoring/benchmarks.ts
 *   - TCMB Sektör Bilançoları İstatistikleri 2025 Yayını
 *   - 2023-2024 verileri, 17 sektör + Genel fallback
 *   - 26 rasyo (14 güvenilir TCMB + 12 Finrate tahmin)
 *
 * BU KATMAN SCORING MOTORU DEĞİLDİR.
 * - Quality engine'i (V3-4) mutate ETMEZ
 * - Raw score'u değiştirmez
 * - Rating override yapmaz
 *
 * Sadece CONTEXT üretir:
 *   - SectorBenchmarkSnapshot — firma vs TCMB karşılaştırması
 *   - AnomalyReport — sektör-ayarlı dereceli sapma tespiti
 *   - NarrativePackage — V3-9 rating reasoning için hazır metin
 *   - RiskFlags — sektöre özgü risk işaretleri
 *   - SectorWeightInsight — TCMB ağırlıkları narrative bağlamı
 *   - ProductivityHook — V3-8 asset productivity için interface
 *
 * Hard rule SADECE semantik imkânsızlıklarda (A20 YYİ sadece inşaatta).
 */

import type { SectorCode } from './contracts'
import {
  getSectorBenchmark,
  getSectorWeights,
  type SectorBenchmark,
  type SectorWeights,
} from '../benchmarks'

// ─── SECTOR CODE → TCMB SECTOR NAME MAPPING ──────────────────────────────────

/**
 * V3 SectorCode → TCMB sektör adı eşleştirmesi.
 * getSectorBenchmark() Türkçe fuzzy eşleştirme yapıyor;
 * burada canonical eşleşmeyi deterministik veriyoruz.
 */
export const SECTOR_CODE_TO_TCMB_NAME: Record<SectorCode, string> = {
  CONSTRUCTION:  'İnşaat',
  MANUFACTURING: 'İmalat',
  TRADE:         'Toptan Ticaret',
  RETAIL:        'Perakende Ticaret',
  SERVICES:      'Hizmet',
  IT:            'Bilişim',
}

export function resolveTcmbBenchmark(sector: SectorCode): SectorBenchmark {
  return getSectorBenchmark(SECTOR_CODE_TO_TCMB_NAME[sector])
}

export function resolveTcmbWeights(sector: SectorCode): SectorWeights {
  return getSectorWeights(SECTOR_CODE_TO_TCMB_NAME[sector])
}

// ─── RELIABILITY HARİTASI ─────────────────────────────────────────────────────

export type DataReliability = 'TCMB_DIRECT' | 'FINRATE_ESTIMATE'

export const BENCHMARK_FIELD_RELIABILITY: Record<keyof SectorBenchmark, DataReliability> = {
  // TCMB doğrudan
  currentRatio:       'TCMB_DIRECT',
  quickRatio:         'TCMB_DIRECT',
  grossMargin:        'TCMB_DIRECT',
  netProfitMargin:    'TCMB_DIRECT',
  roa:                'TCMB_DIRECT',
  roe:                'TCMB_DIRECT',
  debtToEquity:       'TCMB_DIRECT',
  debtToAssets:       'TCMB_DIRECT',
  interestCoverage:   'TCMB_DIRECT',
  assetTurnover:      'TCMB_DIRECT',
  receivablesDays:    'TCMB_DIRECT',
  inventoryDays:      'TCMB_DIRECT',
  label:              'TCMB_DIRECT',

  // Finrate tahmin
  cashRatio:              'FINRATE_ESTIMATE',
  netWorkingCapitalRatio: 'FINRATE_ESTIMATE',
  cashConversionCycle:    'FINRATE_ESTIMATE',
  ebitdaMargin:           'FINRATE_ESTIMATE',
  ebitMargin:             'FINRATE_ESTIMATE',
  roic:                   'FINRATE_ESTIMATE',
  revenueGrowth:          'FINRATE_ESTIMATE',
  shortTermDebtRatio:     'FINRATE_ESTIMATE',
  debtToEbitda:           'FINRATE_ESTIMATE',
  payablesTurnoverDays:   'FINRATE_ESTIMATE',
  fixedAssetTurnover:     'FINRATE_ESTIMATE',
  operatingExpenseRatio:  'FINRATE_ESTIMATE',
}

// ─── METRIC KEY + POLARITY + BAZLI EŞİK ──────────────────────────────────────

export type SectorMetricKey =
  | 'currentRatio'
  | 'quickRatio'
  | 'cashRatio'
  | 'debtToEquity'
  | 'debtToAssets'
  | 'interestCoverage'
  | 'assetTurnover'
  | 'operatingMargin'

export type MetricDirectionality = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'RANGE_OPTIMAL'

/**
 * Her metrik için kendi normal/warning sapma bantları.
 * Tek standart yerine metrik-bazlı eşikler — ChatGPT review sonrası iyileştirme.
 *
 * Örnek: Interest Coverage'da %50 sapma kritik; current ratio'da tolere edilebilir.
 */
export const METRIC_METADATA: Record<SectorMetricKey, {
  displayName: string
  directionality: MetricDirectionality
  benchmarkField: keyof SectorBenchmark
  normalBand: number     // Medyandan ±% kaç normal sayılır
  warningBand: number    // Bu bantın ötesi critical
  amplificationNote?: string
}> = {
  currentRatio: {
    displayName: 'Cari Oran',
    directionality: 'RANGE_OPTIMAL',
    benchmarkField: 'currentRatio',
    normalBand: 0.30,
    warningBand: 0.55,
  },
  quickRatio: {
    displayName: 'Asit Test',
    directionality: 'RANGE_OPTIMAL',
    benchmarkField: 'quickRatio',
    normalBand: 0.30,
    warningBand: 0.55,
  },
  cashRatio: {
    displayName: 'Nakit Oranı',
    directionality: 'HIGHER_IS_BETTER',
    benchmarkField: 'cashRatio',
    normalBand: 0.40,
    warningBand: 0.60,
  },
  debtToEquity: {
    displayName: 'Borç/Özkaynak',
    directionality: 'LOWER_IS_BETTER',
    benchmarkField: 'debtToEquity',
    normalBand: 0.25,
    warningBand: 0.45,
  },
  debtToAssets: {
    displayName: 'Borç/Aktif',
    directionality: 'LOWER_IS_BETTER',
    benchmarkField: 'debtToAssets',
    normalBand: 0.20,
    warningBand: 0.40,
  },
  interestCoverage: {
    displayName: 'Faiz Karşılama',
    directionality: 'HIGHER_IS_BETTER',
    benchmarkField: 'interestCoverage',
    normalBand: 0.25,
    warningBand: 0.40,
    amplificationNote: 'Faiz karşılama oranında sapma borç servis kapasitesini doğrudan etkiler',
  },
  assetTurnover: {
    displayName: 'Aktif Devir',
    directionality: 'HIGHER_IS_BETTER',
    benchmarkField: 'assetTurnover',
    normalBand: 0.30,
    warningBand: 0.50,
  },
  operatingMargin: {
    displayName: 'Operasyonel Marj',
    directionality: 'HIGHER_IS_BETTER',
    benchmarkField: 'ebitMargin',
    normalBand: 0.30,
    warningBand: 0.55,
  },
}

// ─── SEKTÖR BAĞLAMI + DERECELİ TOLERANS ──────────────────────────────────────

/**
 * Bir metriğin sektörde toleranslı olup olmadığı + ne derecede.
 * Binary değil, severity-weighted — ChatGPT review sonrası.
 * 0.0 = tolere edilmez, 1.0 = tam tolere edilir
 */
export type ToleranceLevel = 0 | 0.25 | 0.50 | 0.80 | 1.0

export interface SectorContextProfile {
  sectorCode: SectorCode
  sectorName: string

  normalCharacteristics: {
    highAdvancesReceived: boolean
    longWorkInProgress: boolean
    highInventoryIntensity: boolean
    lowPhysicalAssets: boolean
    highPersonnelCost: boolean
    longReceivableCycle: boolean
    projectBasedRevenue: boolean
  }

  /**
   * Metrik bazlı tolerans seviyeleri.
   * İnşaatta düşük aktif devir %80 tolere edilir (proje doğası).
   * Ama aşırı düşük olunca yine kritiktir — severity-weighted.
   */
  metricTolerance: Partial<Record<SectorMetricKey, {
    direction: 'LOW_SIDE' | 'HIGH_SIDE'
    moderate: ToleranceLevel  // warning seviyesinde tolerans
    extreme: ToleranceLevel   // critical seviyesinde tolerans
    reason: string
  }>>

  criticalMetrics: SectorMetricKey[]

  narrativeTemplates: {
    strengthenedBy: string[]
    weakenedBy: string[]
    neutralContext: string
  }
}

export const SECTOR_CONTEXT_PROFILES: Record<SectorCode, SectorContextProfile> = {
  CONSTRUCTION: {
    sectorCode: 'CONSTRUCTION',
    sectorName: 'İnşaat',
    normalCharacteristics: {
      highAdvancesReceived: true,
      longWorkInProgress: true,
      highInventoryIntensity: true,
      lowPhysicalAssets: false,
      highPersonnelCost: false,
      longReceivableCycle: true,
      projectBasedRevenue: true,
    },
    metricTolerance: {
      assetTurnover: {
        direction: 'LOW_SIDE',
        moderate: 0.80,
        extreme: 0.25,
        reason: 'Proje bazlı hasılat uzun dönüş süreleri üretir',
      },
      cashRatio: {
        direction: 'LOW_SIDE',
        moderate: 0.50,
        extreme: 0.25,
        reason: 'Proje ödemeleri arası nakit dalgalanır',
      },
      currentRatio: {
        direction: 'LOW_SIDE',
        moderate: 0.50,
        extreme: 0.25,
        reason: 'Proje stoğu ve alacakları yapıyı etkiler',
      },
    },
    criticalMetrics: ['assetTurnover', 'cashRatio', 'operatingMargin', 'interestCoverage'],
    narrativeTemplates: {
      strengthenedBy: [
        'Proje teslimatlarının hızlanması',
        'Avansların hasılata dönüşmesi',
        'YYİ hesaplarının nakde dönmesi',
      ],
      weakenedBy: [
        'Proje uzaması / hakediş gecikmesi',
        'Sürekli avans birikimi (teslim yok)',
      ],
      neutralContext: 'İnşaat sektörü doğası gereği yüksek alınan avans ve uzun proje döngüleri barındırır.',
    },
  },

  MANUFACTURING: {
    sectorCode: 'MANUFACTURING',
    sectorName: 'İmalat',
    normalCharacteristics: {
      highAdvancesReceived: false,
      longWorkInProgress: false,
      highInventoryIntensity: true,
      lowPhysicalAssets: false,
      highPersonnelCost: false,
      longReceivableCycle: false,
      projectBasedRevenue: false,
    },
    metricTolerance: {},
    criticalMetrics: ['assetTurnover', 'operatingMargin', 'interestCoverage'],
    narrativeTemplates: {
      strengthenedBy: ['Stok devir hızı artışı', 'Net satış büyümesi', 'Brüt marj iyileşmesi'],
      weakenedBy: ['Stok birikimi + satış düşüşü', 'Hammadde maliyeti baskısı', 'Atıl kapasite'],
      neutralContext: 'İmalat firmalarında stok ve fiziksel aktif yüksek olmak doğaldır.',
    },
  },

  TRADE: {
    sectorCode: 'TRADE',
    sectorName: 'Toptan Ticaret',
    normalCharacteristics: {
      highAdvancesReceived: false,
      longWorkInProgress: false,
      highInventoryIntensity: true,
      lowPhysicalAssets: true,
      highPersonnelCost: false,
      longReceivableCycle: false,
      projectBasedRevenue: false,
    },
    metricTolerance: {
      operatingMargin: {
        direction: 'LOW_SIDE',
        moderate: 0.50,
        extreme: 0.25,
        reason: 'Düşük marj + yüksek hacim modeli sektör doğasıdır',
      },
    },
    criticalMetrics: ['assetTurnover', 'cashRatio', 'operatingMargin'],
    narrativeTemplates: {
      strengthenedBy: ['Alacak devir hızı artışı', 'Stok çözülmesi', 'Ciro büyümesi'],
      weakenedBy: ['Uzayan tahsilat', 'Stok birikimi', 'Marj daralması'],
      neutralContext: 'Ticaret firmalarında düşük marj yüksek ciro ile dengelenir.',
    },
  },

  RETAIL: {
    sectorCode: 'RETAIL',
    sectorName: 'Perakende Ticaret',
    normalCharacteristics: {
      highAdvancesReceived: false,
      longWorkInProgress: false,
      highInventoryIntensity: true,
      lowPhysicalAssets: false,
      highPersonnelCost: true,
      longReceivableCycle: false,
      projectBasedRevenue: false,
    },
    metricTolerance: {
      currentRatio: {
        direction: 'LOW_SIDE',
        moderate: 0.50,
        extreme: 0.25,
        reason: 'Perakende işletme modelinde düşük cari oran yaygındır',
      },
      debtToEquity: {
        direction: 'HIGH_SIDE',
        moderate: 0.50,
        extreme: 0.25,
        reason: 'İşletme kaldıracı yüksektir',
      },
    },
    criticalMetrics: ['assetTurnover', 'operatingMargin', 'cashRatio'],
    narrativeTemplates: {
      strengthenedBy: ['Stok devir hızı', 'Mağaza bazlı satış büyümesi', 'Operasyonel marj iyileşmesi'],
      weakenedBy: ['Stok birikimi', 'Talep düşüşü', 'Kira/personel baskısı'],
      neutralContext: 'Perakendede yüksek stok ve düşük equity ratio işletme modelinin doğal sonucudur.',
    },
  },

  SERVICES: {
    sectorCode: 'SERVICES',
    sectorName: 'Hizmet',
    normalCharacteristics: {
      highAdvancesReceived: false,
      longWorkInProgress: false,
      highInventoryIntensity: false,
      lowPhysicalAssets: true,
      highPersonnelCost: true,
      longReceivableCycle: false,
      projectBasedRevenue: true,
    },
    metricTolerance: {
      assetTurnover: {
        direction: 'LOW_SIDE',
        moderate: 0.50,
        extreme: 0.25,
        reason: 'Hizmet firmalarında fiziksel aktif düşüktür',
      },
    },
    criticalMetrics: ['operatingMargin', 'cashRatio', 'assetTurnover'],
    narrativeTemplates: {
      strengthenedBy: ['Müşteri çeşitliliği', 'Operasyonel marj', 'Tahsilat hızı'],
      weakenedBy: ['Müşteri kaybı', 'Personel maliyet baskısı', 'Uzayan alacak'],
      neutralContext: 'Hizmet firmalarında düşük stok ve yüksek personel maliyeti doğaldır.',
    },
  },

  IT: {
    sectorCode: 'IT',
    sectorName: 'Bilişim',
    normalCharacteristics: {
      highAdvancesReceived: false,
      longWorkInProgress: false,
      highInventoryIntensity: false,
      lowPhysicalAssets: true,
      highPersonnelCost: true,
      longReceivableCycle: false,
      projectBasedRevenue: false,
    },
    metricTolerance: {},
    criticalMetrics: ['operatingMargin', 'cashRatio'],
    narrativeTemplates: {
      strengthenedBy: ['Recurring revenue büyümesi', 'Yüksek marj', 'Ürün çeşitliliği'],
      weakenedBy: ['Müşteri kaybı', 'AR-GE başarısızlığı', 'Tek müşteri bağımlılığı'],
      neutralContext: 'Bilişim firmalarında düşük fiziksel aktif ve yüksek AR-GE doğaldır.',
    },
  },
}

// ─── ASSET PRODUCTIVITY HOOK (V3-8 İÇİN) ─────────────────────────────────────

/**
 * Asset productivity placeholder — V3-8 bu interface'i dolduracak.
 * Şu an null döner ama hook burada hazır.
 */
export interface AssetProductivityHook {
  /** aktif / satış — ne kadar aktif üretkendir */
  revenueEfficiency: number | null
  /** çalışan başına gelir (veri varsa) */
  revenuePerEmployee: number | null
  /** sermaye yoğunluğu (yatırımlı sektör göstergesi) */
  capitalIntensity: number | null
  /** nakit üretim etkinliği */
  cashGenerationYield: number | null
  /** V3-8'de doldurulacağına dair not */
  pendingImplementation: boolean
}

export function buildProductivityHookPlaceholder(): AssetProductivityHook {
  return {
    revenueEfficiency:    null,
    revenuePerEmployee:   null,
    capitalIntensity:     null,
    cashGenerationYield:  null,
    pendingImplementation: true,
  }
}

// ─── SECTOR WEIGHTS INSIGHT ───────────────────────────────────────────────────

/**
 * TCMB sektör ağırlıkları narrative'e dahil edilir.
 * Hangi metrik kategorisi bu sektörde daha önemli?
 */
export interface SectorWeightInsight {
  weights: SectorWeights
  dominantCategory: 'liquidity' | 'profitability' | 'leverage' | 'activity'
  weakestCategory:  'liquidity' | 'profitability' | 'leverage' | 'activity'
  narrativeExplanation: string
}

export function buildSectorWeightInsight(sector: SectorCode): SectorWeightInsight {
  const weights = resolveTcmbWeights(sector)

  const entries: Array<[keyof SectorWeights, number]> = [
    ['liquidity',     weights.liquidity],
    ['profitability', weights.profitability],
    ['leverage',      weights.leverage],
    ['activity',      weights.activity],
  ]

  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  const dominantCategory = sorted[0][0] as SectorWeightInsight['dominantCategory']
  const weakestCategory  = sorted[sorted.length - 1][0] as SectorWeightInsight['weakestCategory']

  const catName: Record<string, string> = {
    liquidity:     'likidite',
    profitability: 'kârlılık',
    leverage:      'kaldıraç',
    activity:      'faaliyet',
  }

  const narrativeExplanation =
    `${SECTOR_CODE_TO_TCMB_NAME[sector]} sektöründe rating değerlendirmesinde ${catName[dominantCategory]} ` +
    `(%${(sorted[0][1] * 100).toFixed(0)}) en ağırlıklı kategori, ${catName[weakestCategory]} ` +
    `(%${(sorted[sorted.length - 1][1] * 100).toFixed(0)}) en düşük ağırlıklı.`

  return { weights, dominantCategory, weakestCategory, narrativeExplanation }
}

// ─── GİRDİ / ÇIKTI TİPLERİ ───────────────────────────────────────────────────

export interface SectorAnalysisInput {
  sector:  SectorCode
  metrics: Record<SectorMetricKey, number>
}

export interface MetricAssessment {
  metricKey:      SectorMetricKey
  displayName:    string
  value:          number
  tcmbMedian:     number
  reliability:    DataReliability
  directionality: MetricDirectionality
  status:         'NORMAL' | 'WARNING' | 'CRITICAL' | 'STRONG'
  deviation:      number
  interpretation: string
  /** Metrik-bazlı bant kullanıldı (ChatGPT fix #1) */
  thresholdsApplied: { normalBand: number; warningBand: number }
}

export interface AnomalyItem {
  metricKey:   SectorMetricKey
  severity:    'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  /** Dereceli tolerans — binary değil */
  toleranceLevel:  ToleranceLevel
  toleranceReason?: string
  sectorAdjustedInterpretation: string
}

export interface SectorAnomalyReport {
  anomalies:      AnomalyItem[]
  totalCount:     number
  criticalCount:  number
  toleratedCount: number
}

export interface SectorBenchmarkSnapshot {
  sectorCode:         SectorCode
  sectorName:         string
  dataSource:         'TCMB_2024'
  tcmbBenchmark:      SectorBenchmark
  metricAssessments:  MetricAssessment[]
  overallSectorFit:   'STRONG' | 'TYPICAL' | 'WEAK' | 'ATYPICAL'
  reliabilityNote:    string
}

export interface SectorNormalizationFactors {
  normalizedMetrics: Record<SectorMetricKey, number>
}

export interface SectorNarrativePackage {
  sectorContext:                   string
  weightInsight:                   string  // TCMB ağırlık açıklaması (ChatGPT fix #5)
  strengthsInSectorContext:        string[]
  weaknessesInSectorContext:       string[]
  toleratedAnomaliesExplanation:   string[]
  criticalRiskFocus:               string[]
  bankerNote:                      string
}

export interface SectorRiskFlag {
  metricKey: SectorMetricKey
  flagType:  'SECTOR_CRITICAL' | 'SECTOR_TOLERATED' | 'SECTOR_AMPLIFIED'
  message:   string
}

export interface SectorIntelligenceResult {
  benchmarkSnapshot:    SectorBenchmarkSnapshot
  anomalyReport:        SectorAnomalyReport
  normalizationFactors: SectorNormalizationFactors
  narrativePackage:     SectorNarrativePackage
  riskFlags:            SectorRiskFlag[]
  contextProfile:       SectorContextProfile
  weightInsight:        SectorWeightInsight
  /** V3-8 için placeholder */
  productivityHook:     AssetProductivityHook
}

// ─── METRIC ASSESSMENT — METRİK BAZLI EŞİK ───────────────────────────────────

function assessMetric(
  metricKey: SectorMetricKey,
  value:     number,
  tcmbMedian: number,
): MetricAssessment {
  const meta        = METRIC_METADATA[metricKey]
  const reliability = BENCHMARK_FIELD_RELIABILITY[meta.benchmarkField]
  const deviation   = tcmbMedian !== 0 ? (value - tcmbMedian) / Math.abs(tcmbMedian) : 0
  const absDeviation = Math.abs(deviation)

  let status: MetricAssessment['status']
  let interpretation: string

  if (meta.directionality === 'HIGHER_IS_BETTER') {
    if (deviation >= meta.normalBand) {
      status = 'STRONG'
      interpretation = `${meta.displayName} sektör ortalamasının üstünde (${value.toFixed(2)} vs ${tcmbMedian.toFixed(2)}) — pozitif`
    } else if (absDeviation <= meta.normalBand) {
      status = 'NORMAL'
      interpretation = `${meta.displayName} sektör ortalamasında (${value.toFixed(2)})`
    } else if (absDeviation <= meta.warningBand) {
      status = 'WARNING'
      interpretation = `${meta.displayName} sektör ortalamasının altında (${value.toFixed(2)} vs ${tcmbMedian.toFixed(2)})`
    } else {
      status = 'CRITICAL'
      interpretation = `${meta.displayName} sektör ortalamasının kritik altında (${value.toFixed(2)} vs ${tcmbMedian.toFixed(2)})`
    }
  } else if (meta.directionality === 'LOWER_IS_BETTER') {
    if (deviation <= -meta.normalBand) {
      status = 'STRONG'
      interpretation = `${meta.displayName} sektör ortalamasının altında (${value.toFixed(2)} vs ${tcmbMedian.toFixed(2)}) — pozitif`
    } else if (absDeviation <= meta.normalBand) {
      status = 'NORMAL'
      interpretation = `${meta.displayName} sektör ortalamasında (${value.toFixed(2)})`
    } else if (absDeviation <= meta.warningBand) {
      status = 'WARNING'
      interpretation = `${meta.displayName} sektör ortalamasının üstünde (${value.toFixed(2)} vs ${tcmbMedian.toFixed(2)})`
    } else {
      status = 'CRITICAL'
      interpretation = `${meta.displayName} sektör ortalamasının kritik üstünde (${value.toFixed(2)} vs ${tcmbMedian.toFixed(2)})`
    }
  } else {
    // RANGE_OPTIMAL
    if (absDeviation <= meta.normalBand) {
      status = 'NORMAL'
      interpretation = `${meta.displayName} sektör normal aralığında (${value.toFixed(2)})`
    } else if (absDeviation <= meta.warningBand) {
      status = 'WARNING'
      const dir = deviation > 0 ? 'üstünde' : 'altında'
      interpretation = `${meta.displayName} sektör ortalamasının ${dir} (${value.toFixed(2)} vs ${tcmbMedian.toFixed(2)}) — uyarı`
    } else {
      status = 'CRITICAL'
      const dir = deviation > 0 ? 'kritik üstünde' : 'kritik altında'
      interpretation = `${meta.displayName} sektör ortalamasının ${dir} (${value.toFixed(2)} vs ${tcmbMedian.toFixed(2)})`
    }
  }

  return {
    metricKey,
    displayName: meta.displayName,
    value,
    tcmbMedian,
    reliability,
    directionality: meta.directionality,
    status,
    deviation,
    interpretation,
    thresholdsApplied: { normalBand: meta.normalBand, warningBand: meta.warningBand },
  }
}

// ─── BENCHMARK SNAPSHOT ───────────────────────────────────────────────────────

export function buildBenchmarkSnapshot(
  input: SectorAnalysisInput,
): SectorBenchmarkSnapshot {
  const tcmbBenchmark = resolveTcmbBenchmark(input.sector)
  const context       = SECTOR_CONTEXT_PROFILES[input.sector]

  const metricKeys: SectorMetricKey[] = [
    'currentRatio', 'quickRatio', 'cashRatio',
    'debtToEquity', 'debtToAssets', 'interestCoverage',
    'assetTurnover', 'operatingMargin',
  ]

  const assessments = metricKeys.map(key => {
    const meta      = METRIC_METADATA[key]
    const tcmbValue = tcmbBenchmark[meta.benchmarkField] as number
    return assessMetric(key, input.metrics[key], tcmbValue)
  })

  const normalOrStrong = assessments.filter(a => a.status === 'NORMAL' || a.status === 'STRONG').length
  const critical       = assessments.filter(a => a.status === 'CRITICAL').length

  let overallSectorFit: SectorBenchmarkSnapshot['overallSectorFit']
  if (critical >= 3)        overallSectorFit = 'ATYPICAL'
  else if (normalOrStrong >= 6) overallSectorFit = 'STRONG'
  else if (normalOrStrong >= 4) overallSectorFit = 'TYPICAL'
  else                      overallSectorFit = 'WEAK'

  const estimatedCount = assessments.filter(a => a.reliability === 'FINRATE_ESTIMATE').length
  const reliabilityNote = estimatedCount > 0
    ? `${8 - estimatedCount} metrik TCMB doğrudan, ${estimatedCount} metrik Finrate tahmini`
    : 'Tüm metrikler TCMB doğrudan kaynaklı'

  return {
    sectorCode:        input.sector,
    sectorName:        context.sectorName,
    dataSource:        'TCMB_2024',
    tcmbBenchmark,
    metricAssessments: assessments,
    overallSectorFit,
    reliabilityNote,
  }
}

// ─── ANOMALY REPORT — DERECELİ TOLERANS ──────────────────────────────────────

export function buildAnomalyReport(
  snapshot: SectorBenchmarkSnapshot,
  context:  SectorContextProfile,
): SectorAnomalyReport {
  const anomalies: AnomalyItem[] = []

  for (const assessment of snapshot.metricAssessments) {
    if (assessment.status === 'NORMAL' || assessment.status === 'STRONG') continue

    // Dereceli tolerans hesabı (ChatGPT fix #4)
    const { toleranceLevel, toleranceReason } = computeToleranceLevel(assessment, context)

    let severity: AnomalyItem['severity'] =
      assessment.status === 'CRITICAL' ? 'HIGH' : 'MEDIUM'

    // Tolerance severity'yi dereceli düşürür
    if (toleranceLevel >= 0.80) {
      severity = 'LOW'
    } else if (toleranceLevel >= 0.50) {
      if (severity === 'HIGH')   severity = 'MEDIUM'
      else if (severity === 'MEDIUM') severity = 'LOW'
    }
    // 0.25 → narrative yumuşatılır ama severity korunur
    // 0   → tolerans yok, severity aynı kalır

    // Kritik metrik amplification
    const isCriticalForSector = context.criticalMetrics.includes(assessment.metricKey)
    if (isCriticalForSector) {
      if (severity === 'MEDIUM')   severity = 'HIGH'
      else if (severity === 'HIGH') severity = 'CRITICAL'
    }

    const interpretation = toleranceLevel > 0
      ? `${assessment.interpretation}. ${context.sectorName}'de kısmen tolere edilir${toleranceReason ? ` (${toleranceReason})` : ''}.`
      : `${assessment.interpretation}. ${context.sectorName} sektör normlarından anlamlı sapma.`

    anomalies.push({
      metricKey:                    assessment.metricKey,
      severity,
      toleranceLevel,
      toleranceReason,
      sectorAdjustedInterpretation: interpretation,
    })
  }

  return {
    anomalies,
    totalCount:     anomalies.length,
    criticalCount:  anomalies.filter(a => a.severity === 'CRITICAL').length,
    toleratedCount: anomalies.filter(a => a.toleranceLevel > 0).length,
  }
}

function computeToleranceLevel(
  assessment: MetricAssessment,
  context:    SectorContextProfile,
): { toleranceLevel: ToleranceLevel; toleranceReason?: string } {
  const toleranceSpec = context.metricTolerance[assessment.metricKey]
  if (!toleranceSpec) return { toleranceLevel: 0 }

  // Yön kontrolü — LOW_SIDE tolerance sadece düşük sapmada, HIGH_SIDE sadece yüksek sapmada
  const isLowSide  = assessment.deviation < 0
  const isHighSide = assessment.deviation > 0

  if (toleranceSpec.direction === 'LOW_SIDE'  && !isLowSide)  return { toleranceLevel: 0 }
  if (toleranceSpec.direction === 'HIGH_SIDE' && !isHighSide) return { toleranceLevel: 0 }

  // Status'a göre moderate vs extreme tolerans
  const level = assessment.status === 'WARNING'
    ? toleranceSpec.moderate
    : toleranceSpec.extreme

  return { toleranceLevel: level, toleranceReason: toleranceSpec.reason }
}

// ─── NORMALIZATION FACTORS ────────────────────────────────────────────────────

export function calculateNormalizationFactors(
  snapshot: SectorBenchmarkSnapshot,
): SectorNormalizationFactors {
  const normalized = {} as Record<SectorMetricKey, number>

  for (const assessment of snapshot.metricAssessments) {
    normalized[assessment.metricKey] = assessment.tcmbMedian !== 0
      ? assessment.value / assessment.tcmbMedian
      : 0
  }

  return { normalizedMetrics: normalized }
}

// ─── NARRATIVE PACKAGE ────────────────────────────────────────────────────────

export function buildNarrativePackage(
  snapshot:     SectorBenchmarkSnapshot,
  anomalyReport: SectorAnomalyReport,
  context:      SectorContextProfile,
  weightInsight: SectorWeightInsight,
): SectorNarrativePackage {
  const strengths:            string[] = []
  const weaknesses:           string[] = []
  const toleratedExplanations: string[] = []
  const criticalFocus:        string[] = []

  for (const a of snapshot.metricAssessments) {
    if (
      (a.status === 'NORMAL' || a.status === 'STRONG') &&
      context.criticalMetrics.includes(a.metricKey)
    ) {
      strengths.push(
        `${a.displayName} sektör kritik metriğinde ${a.status === 'STRONG' ? 'güçlü' : 'normal'} seviyede`
      )
    }
  }

  for (const anomaly of anomalyReport.anomalies) {
    if (anomaly.severity === 'CRITICAL' || anomaly.severity === 'HIGH') {
      weaknesses.push(anomaly.sectorAdjustedInterpretation)
    }
    if (anomaly.toleranceLevel > 0) {
      const displayName = METRIC_METADATA[anomaly.metricKey].displayName
      const levelText   = anomaly.toleranceLevel >= 0.80 ? 'büyük ölçüde'
        : anomaly.toleranceLevel >= 0.50 ? 'orta derecede'
        : 'kısmen'
      toleratedExplanations.push(
        `${displayName}: ${context.sectorName} sektöründe ${levelText} tolere edilen düzey`
      )
    }
    if (context.criticalMetrics.includes(anomaly.metricKey)) {
      const displayName = METRIC_METADATA[anomaly.metricKey].displayName
      criticalFocus.push(
        `${displayName} — ${context.sectorName} için kritik metrik, ${anomaly.severity} seviyede sapma`
      )
    }
  }

  const bankerNote = buildBankerNote(snapshot, anomalyReport, context, weightInsight)

  return {
    sectorContext:                 context.narrativeTemplates.neutralContext,
    weightInsight:                 weightInsight.narrativeExplanation,
    strengthsInSectorContext:      strengths,
    weaknessesInSectorContext:     weaknesses,
    toleratedAnomaliesExplanation: toleratedExplanations,
    criticalRiskFocus:             criticalFocus,
    bankerNote,
  }
}

function buildBankerNote(
  snapshot:     SectorBenchmarkSnapshot,
  anomaly:      SectorAnomalyReport,
  context:      SectorContextProfile,
  weightInsight: SectorWeightInsight,
): string {
  const parts: string[] = []

  if (snapshot.overallSectorFit === 'STRONG') {
    parts.push(`${context.sectorName} sektörü için güçlü bir bilanço profili.`)
  } else if (snapshot.overallSectorFit === 'TYPICAL') {
    parts.push(`${context.sectorName} sektörü için tipik bilanço yapısı.`)
  } else if (snapshot.overallSectorFit === 'WEAK') {
    parts.push(`${context.sectorName} sektör normlarında zayıflık var.`)
  } else {
    parts.push(`${context.sectorName} sektörü için atipik bilanço yapısı.`)
  }

  if (anomaly.criticalCount > 0) {
    parts.push(`${anomaly.criticalCount} kritik sapma tespit edildi.`)
  }
  if (anomaly.toleratedCount > 0) {
    parts.push(`${anomaly.toleratedCount} sapma sektör doğasıyla uyumlu.`)
  }

  parts.push(weightInsight.narrativeExplanation)
  parts.push('Sektör bağlamı mazeret üretmez — operasyonel nakit üretimi her zaman önceliklidir.')
  parts.push('Karşılaştırma kaynağı: TCMB 2024 sektör verileri.')

  return parts.join(' ')
}

// ─── RISK FLAGS ───────────────────────────────────────────────────────────────

export function buildRiskFlags(
  anomalyReport: SectorAnomalyReport,
  context:       SectorContextProfile,
): SectorRiskFlag[] {
  const flags: SectorRiskFlag[] = []

  for (const anomaly of anomalyReport.anomalies) {
    const isCritical  = context.criticalMetrics.includes(anomaly.metricKey)
    const displayName = METRIC_METADATA[anomaly.metricKey].displayName

    if (anomaly.toleranceLevel >= 0.50 && anomaly.severity !== 'CRITICAL') {
      flags.push({
        metricKey: anomaly.metricKey,
        flagType:  'SECTOR_TOLERATED',
        message:   `${displayName}: ${context.sectorName} sektöründe tolere edilen sapma`,
      })
    } else if (isCritical) {
      flags.push({
        metricKey: anomaly.metricKey,
        flagType:  'SECTOR_AMPLIFIED',
        message:   `${displayName}: ${context.sectorName} için kritik metrik, etki amplifiye edildi`,
      })
    } else if (anomaly.severity === 'CRITICAL' || anomaly.severity === 'HIGH') {
      flags.push({
        metricKey: anomaly.metricKey,
        flagType:  'SECTOR_CRITICAL',
        message:   `${displayName}: ${context.sectorName} normlarından ciddi sapma`,
      })
    }
  }

  return flags
}

// ─── ANA API ──────────────────────────────────────────────────────────────────

export function analyzeSectorIntelligence(
  input: SectorAnalysisInput,
): SectorIntelligenceResult {
  const contextProfile     = SECTOR_CONTEXT_PROFILES[input.sector]
  const benchmarkSnapshot  = buildBenchmarkSnapshot(input)
  const anomalyReport      = buildAnomalyReport(benchmarkSnapshot, contextProfile)
  const normalizationFactors = calculateNormalizationFactors(benchmarkSnapshot)
  const weightInsight      = buildSectorWeightInsight(input.sector)
  const narrativePackage   = buildNarrativePackage(benchmarkSnapshot, anomalyReport, contextProfile, weightInsight)
  const riskFlags          = buildRiskFlags(anomalyReport, contextProfile)
  const productivityHook   = buildProductivityHookPlaceholder()

  return {
    benchmarkSnapshot,
    anomalyReport,
    normalizationFactors,
    narrativePackage,
    riskFlags,
    contextProfile,
    weightInsight,
    productivityHook,
  }
}

/**
 * Sektör ve aksiyon için semantik imkânsızlık kontrolü.
 * Hard rule — sadece gerçek anlamda sektörde bulunmayan varlıklar.
 */
export function isActionSemanticallyImpossibleForSector(
  actionId: string,
  sector:   SectorCode,
): { impossible: boolean; reason?: string } {
  if (actionId === 'A20_YYI_MONETIZATION' && sector !== 'CONSTRUCTION') {
    return {
      impossible: true,
      reason: 'YYİ (350-358) hesapları sadece inşaat sektöründe bulunur',
    }
  }

  if (actionId === 'A19_ADVANCE_TO_REVENUE' && sector !== 'CONSTRUCTION' && sector !== 'SERVICES') {
    return {
      impossible: true,
      reason: 'Alınan avans → hasılat dönüşümü proje bazlı sektörlerde anlamlıdır',
    }
  }

  return { impossible: false }
}

/**
 * GELECEKTEKİ İYİLEŞTİRMELER:
 *
 * 1. ECONOMIC QUALITY CEILING — Şu an medyan "referans" kabul ediliyor. Ama
 *    sektörün tamamı zayıfsa medyan "iyi" anlamına gelmez. V3-9'da rating
 *    reasoning katmanında mutlak ekonomik kalite eşiği uygulanacak.
 *
 * 2. CANONICAL RATIO DEFINITION — operatingMargin → ebitMargin mapping riskli
 *    (firma tarafı vs benchmark tarafı hesabı farklı olabilir). İleride tüm
 *    rasyoların canonical formülü tek yerde tanımlanacak.
 *
 * 3. DAĞILIM BİLGİSİ — Şu an tek medyan. TCMB mikro veri setinde p25/p75 var,
 *    dosyaya eklenirse z-score tabanlı assessment yapılır.
 *
 * 4. ALT-SEKTÖR — TCMB Toptan Ticaret tek kategori. İleride gıda toptan vs
 *    inşaat malzemesi toptan ayrımı.
 *
 * 5. FİRMA ÖLÇEĞİ — KOBİ vs büyük firma farklı normlar.
 *
 * 6. ENFLASYON NORMALIZE — Yüksek enflasyon dönemlerinde medyanlar kayar.
 *
 * 7. TEMPORAL REGIME — HIGH_INTEREST / CRISIS / EXPANSION dönemlerinde tolerans
 *    değişmeli.
 *
 * 8. HARD RULE GENİŞLEMESİ — A06 stok IT'de, A11 kâr tutma zararlı firmada, vb.
 *
 * 9. FINRATE TAHMİN RASYOLARI — 12 alan TCMB'de yok. İleride TCMB mikro veri
 *    setinden gerçek hesaplama.
 *
 * 10. PRODUCTIVITY HOOK IMPLEMENTATION — AssetProductivityHook şu an placeholder.
 *     V3-8 gerçek hesaplamayı dolduracak.
 */
