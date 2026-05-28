/**
 * R12.1 — Rasyo Kategori Kaydı
 *
 * Her RatioResult alanını 4 skorlama kategorisine eşler:
 *   liquidity | profitability | leverage | activity
 *
 * findWeakestRatioPerCategory:
 *   Her kategori için benchmark'tan en çok sapan oranı döner.
 *   (findWeakRatiosByCategory wrapper'ı — geriye uyumluluk)
 *
 * findWeakRatiosByCategory (FIX 2):
 *   Her kategori için zayıf tüm oranları döner (worst-first sıralı).
 *   COVERAGE_EXCLUDED_RATIOS dışlandığı için coverage fallback güvenli.
 *
 * getCoverageActionIdsForRatio (FIX 1):
 *   Rasyo alanı → targetRatio.metric eşlemesiyle katalogdaki
 *   aksiyonları kalite katsayısına göre azalan sırayla döner.
 *
 * COVERAGE_EXCLUDED_RATIOS (FIX 5):
 *   payablesTurnoverDays — bell-curve optimal (R12.2'ye ertelendi)
 */

import type { RatioResult }      from '../ratios'
import type { SectorBenchmark }  from '../benchmarks'
import type { ActionTemplateV3 } from './contracts'

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type RatioCategory = 'liquidity' | 'profitability' | 'leverage' | 'activity'

export interface RatioGap {
  ratioField:     keyof RatioResult
  benchmarkField: keyof SectorBenchmark
  current:        number
  benchmark:      number
  /** log-ratio uzaklık — yüksek = daha zayıf */
  logGap:         number
  /** Yön: 'higher' = yüksek iyi, 'lower' = düşük iyi */
  direction:      'higher' | 'lower'
  isWeak:         boolean
}

/** Kategori → en zayıf oran bilgisi (oran mevcut + benchmark'tan düşükse) */
export type WeakCategoryMap = Partial<Record<RatioCategory, RatioGap>>

// ─── Oran → Kategori eşlemesi ─────────────────────────────────────────────────

export const RATIO_TO_CATEGORY: Partial<Record<keyof RatioResult, RatioCategory>> = {
  // Likidite (6)
  currentRatio:              'liquidity',
  quickRatio:                'liquidity',
  cashRatio:                 'liquidity',
  netWorkingCapital:         'liquidity',    // benchmark yok, atlanır
  netWorkingCapitalRatio:    'liquidity',
  cashConversionCycle:       'liquidity',

  // Kârlılık (9)
  grossMargin:               'profitability',
  ebitdaMargin:              'profitability',
  ebitMargin:                'profitability',
  netProfitMargin:           'profitability',
  roa:                       'profitability',
  roe:                       'profitability',
  roic:                      'profitability',
  revenueGrowth:             'profitability',
  realGrowth:                'profitability', // benchmark yok, atlanır

  // Kaldıraç (6)
  debtToEquity:              'leverage',
  debtToAssets:              'leverage',
  debtToEbitda:              'leverage',
  interestCoverage:          'leverage',
  equityRatio:               'leverage',     // benchmark yok doğrudan, atlanır
  shortTermDebtRatio:        'leverage',

  // Faaliyet (6)
  assetTurnover:             'activity',
  inventoryTurnoverDays:     'activity',
  receivablesTurnoverDays:   'activity',
  payablesTurnoverDays:      'activity',
  fixedAssetTurnover:        'activity',
  operatingExpenseRatio:     'activity',
}

// ─── Oran → Benchmark alan adı + Yön ─────────────────────────────────────────

interface RatioSpec {
  benchmarkField: keyof SectorBenchmark
  direction:      'higher' | 'lower'
}

/**
 * RatioResult alanı → { benchmarkField, direction }
 * Sadece SectorBenchmark'ta karşılığı olan oranlar dahil.
 * Direction: 'higher' = yüksek daha iyi; 'lower' = düşük daha iyi.
 */
export const RATIO_SPEC: Partial<Record<keyof RatioResult, RatioSpec>> = {
  // Likidite
  currentRatio:            { benchmarkField: 'currentRatio',           direction: 'higher' },
  quickRatio:              { benchmarkField: 'quickRatio',             direction: 'higher' },
  cashRatio:               { benchmarkField: 'cashRatio',              direction: 'higher' },
  netWorkingCapitalRatio:  { benchmarkField: 'netWorkingCapitalRatio', direction: 'higher' },
  cashConversionCycle:     { benchmarkField: 'cashConversionCycle',    direction: 'lower'  },

  // Kârlılık
  grossMargin:             { benchmarkField: 'grossMargin',            direction: 'higher' },
  ebitdaMargin:            { benchmarkField: 'ebitdaMargin',           direction: 'higher' },
  ebitMargin:              { benchmarkField: 'ebitMargin',             direction: 'higher' },
  netProfitMargin:         { benchmarkField: 'netProfitMargin',        direction: 'higher' },
  roa:                     { benchmarkField: 'roa',                    direction: 'higher' },
  roe:                     { benchmarkField: 'roe',                    direction: 'higher' },
  roic:                    { benchmarkField: 'roic',                   direction: 'higher' },
  revenueGrowth:           { benchmarkField: 'revenueGrowth',          direction: 'higher' },

  // Kaldıraç
  debtToEquity:            { benchmarkField: 'debtToEquity',           direction: 'lower'  },
  debtToAssets:            { benchmarkField: 'debtToAssets',           direction: 'lower'  },
  debtToEbitda:            { benchmarkField: 'debtToEbitda',           direction: 'lower'  },
  interestCoverage:        { benchmarkField: 'interestCoverage',       direction: 'higher' },
  shortTermDebtRatio:      { benchmarkField: 'shortTermDebtRatio',     direction: 'lower'  },

  // Faaliyet
  assetTurnover:           { benchmarkField: 'assetTurnover',          direction: 'higher' },
  inventoryTurnoverDays:   { benchmarkField: 'inventoryDays',          direction: 'lower'  },
  receivablesTurnoverDays: { benchmarkField: 'receivablesDays',        direction: 'lower'  },
  payablesTurnoverDays:    { benchmarkField: 'payablesTurnoverDays',   direction: 'higher' }, // Bell-curve — coverage dışı (FIX 5)
  fixedAssetTurnover:      { benchmarkField: 'fixedAssetTurnover',     direction: 'higher' },
  operatingExpenseRatio:   { benchmarkField: 'operatingExpenseRatio',  direction: 'lower'  },
}

// ─── FIX 1: Oran alanı → Coverage metrik adı eşlemesi ────────────────────────

/**
 * RatioResult alanı → actionCatalogV3'teki targetRatio.metric değeri.
 * getCoverageActionIdsForRatio bu tabloyu katalog araması için kullanır.
 * (10 geçerli metrik: R12.1 kapsamı)
 */
export const RATIO_FIELD_TO_METRIC: Record<string, string> = {
  receivablesTurnoverDays: 'DSO',
  inventoryTurnoverDays:   'DIO',
  grossMargin:             'GROSS_MARGIN',
  debtToEquity:            'DEBT_TO_EQUITY',
  debtToAssets:            'DEBT_TO_ASSETS',
  shortTermDebtRatio:      'SHORT_TERM_DEBT_RATIO',
  interestCoverage:        'INTEREST_COVERAGE',
  assetTurnover:           'ASSET_TURNOVER',
  fixedAssetTurnover:      'FIXED_ASSET_TURNOVER',
  operatingExpenseRatio:   'OPEX_RATIO',
  // equityRatio: coverage dışı (EQUITY_RATIO metric yok)
}

// ─── FIX 5: Coverage'dan çıkarılan oranlar ───────────────────────────────────

/**
 * Coverage mekanizmasından dışlanan oranlar.
 * payablesTurnoverDays: Bell-curve optimal — çok düşük veya çok yüksek
 *   her ikisi de kötüdür; basit direction mantığı geçersiz.
 *   Optimal aralık tespiti R12.2'ye ertelendi.
 */
export const COVERAGE_EXCLUDED_RATIOS = new Set<string>(['payablesTurnoverDays'])

// ─── FIX 1: getCoverageActionIdsForRatio ──────────────────────────────────────

/**
 * Zayıf rasyo alanı için katalogdan kalite sıralı aksiyon ID'leri döner.
 *
 * Algoritma:
 *   1. ratioField → metric (RATIO_FIELD_TO_METRIC üzerinden)
 *   2. catalog'da targetRatio.metric === metric olan aksiyonları filtrele
 *   3. qualityCoefficient azalan sırayla sırala
 *   4. ID listesi döndür
 *
 * @param ratioField  RatioResult alan adı (ör. 'debtToEquity')
 * @param catalog     Tüm aksiyon şablonları dizisi
 * @returns Kalite katsayısına göre azalan sıralı aksiyon ID'leri
 */
export function getCoverageActionIdsForRatio(
  ratioField: string,
  catalog:    ActionTemplateV3[],
): string[] {
  const metric = RATIO_FIELD_TO_METRIC[ratioField]
  if (!metric) return []
  return catalog
    .filter(a => a.targetRatio?.metric === metric)
    .sort((a, b) => (b.qualityCoefficient ?? 0) - (a.qualityCoefficient ?? 0))
    .map(a => a.id)
}

// ─── FIX 2: findWeakRatiosByCategory ──────────────────────────────────────────

/**
 * Her kategori için benchmark'tan zayıf TÜM oranları döner (worst-first).
 *
 * findWeakestRatioPerCategory'den farkı:
 *   - Tek en zayıf değil, sıralı liste → fallback desteği
 *   - COVERAGE_EXCLUDED_RATIOS'daki oranlar atlanır (FIX 5)
 *
 * Algoritma (her kategoride):
 *   1. Kategoriye ait tüm oranları topla
 *   2. COVERAGE_EXCLUDED_RATIOS'da olanlari atla
 *   3. Zayıf mu? → logGap hesapla
 *   4. logGap azalan sırayla sırala
 *
 * @param ratios     Firma rasyo sonuçları (null değerler atlanır)
 * @param benchmarks Sektör benchmark değerleri
 * @returns Kategori → zayıf oran listesi (logGap azalan sıra)
 */
export function findWeakRatiosByCategory(
  ratios:     Partial<RatioResult>,
  benchmarks: SectorBenchmark,
): Partial<Record<RatioCategory, RatioGap[]>> {
  const result: Partial<Record<RatioCategory, RatioGap[]>> = {}
  const categories: RatioCategory[] = ['liquidity', 'profitability', 'leverage', 'activity']

  for (const category of categories) {
    const gaps: RatioGap[] = []

    for (const [field, cat] of Object.entries(RATIO_TO_CATEGORY) as Array<[keyof RatioResult, RatioCategory]>) {
      if (cat !== category) continue
      if (COVERAGE_EXCLUDED_RATIOS.has(field as string)) continue  // FIX 5: DPO dışla

      const spec = RATIO_SPEC[field]
      if (!spec) continue

      const current   = ratios[field] as number | null | undefined
      const benchmark = benchmarks[spec.benchmarkField] as number | undefined

      if (current == null || benchmark == null || benchmark === 0) continue
      if (current <= 0 && spec.direction === 'higher') continue

      const isWeak = spec.direction === 'higher'
        ? current < benchmark
        : current > benchmark

      if (!isWeak) continue

      const safeC  = Math.max(current, 1e-9)
      const safeB  = Math.max(benchmark, 1e-9)
      const logGap = Math.abs(Math.log(safeC / safeB))

      gaps.push({
        ratioField:     field,
        benchmarkField: spec.benchmarkField,
        current,
        benchmark,
        logGap,
        direction:      spec.direction,
        isWeak:         true,
      })
    }

    if (gaps.length > 0) {
      result[category] = gaps.sort((a, b) => b.logGap - a.logGap)  // worst-first
    }
  }

  return result
}

// ─── Core: findWeakestRatioPerCategory ────────────────────────────────────────

/**
 * Her kategori için benchmark'tan en zayıf oranı döner.
 *
 * findWeakRatiosByCategory wrapper'ı — geriye uyumluluk için korunur.
 * COVERAGE_EXCLUDED_RATIOS bu fonksiyona da uygulanır.
 *
 * @param ratios     Firma rasyo sonuçları (null değerler atlanır)
 * @param benchmarks Sektör benchmark değerleri
 * @returns Kategori → en zayıf oran bilgisi (sadece gerçekten zayıf kategoriler)
 */
export function findWeakestRatioPerCategory(
  ratios:     Partial<RatioResult>,
  benchmarks: SectorBenchmark,
): WeakCategoryMap {
  const multiResult = findWeakRatiosByCategory(ratios, benchmarks)
  const result: WeakCategoryMap = {}

  for (const [cat, gaps] of Object.entries(multiResult) as Array<[RatioCategory, RatioGap[]]>) {
    if (gaps.length > 0) result[cat] = gaps[0]
  }

  return result
}
