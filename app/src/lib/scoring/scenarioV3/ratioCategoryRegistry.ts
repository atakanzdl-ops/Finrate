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

// ─── R12.1-FIX2: Sonuç Rasyoları — 3 Grup Coverage ──────────────────────────

/**
 * Sonuç rasyoları için 3 grup coverage (Atakan + Sonnet + Claude Code mutabakat).
 *
 * KÖK SEBEP: cashRatio, roic, equityRatio gibi rasyoların doğrudan
 *   targetRatio.metric eşlemesi yoktur — çoklu hesabın türevi.
 *   getCoverageActionIdsForRatio bu rasyolar için boş döner.
 *
 * ÇÖZÜM: Her sonuç rasyosu bir gruba atanır. Grup listesi mali etki
 *   gücüne göre sıralı; isActionApplicable uygulanamaz adayları elee.
 *
 * MATEMATİKSEL KORUMALAR:
 *   A04 LIQUIDITY_RESULT'ta YOK: cashRatio=X/Y, A04→(X-A)/(Y-A); Y>X ise
 *     (likidite zayıfsa daima) oran DÜŞER.
 *   A01/A02/A03 CAPITAL_RESULT'ta YOK: KV→UV reclass aktif/özkaynak
 *     değiştirmez → equityRatio ve debtToEbitda etkisi SIFIR.
 *   A13 PROFIT_RESULT'ta sonda: kodda devre dışı (customCheck pass:false).
 *   A11 CAPITAL_RESULT'ta sonda: kodda devre dışı.
 *   A21 CAPITAL_RESULT'ta dahil: EBITDA artışı → debtToEbitda direkt düşer.
 *
 * NOT: equityRatio RATIO_SPEC'te benchmark yok → findWeakRatiosByCategory
 *   zaten atlar → CAPITAL_RESULT hiç tetiklenmez (zararsız liste girişi).
 *   debtToEbitda RATIO_SPEC'te VAR → coverage tetiklenir.
 */

export type ResultGroup = 'LIQUIDITY_RESULT' | 'PROFIT_RESULT' | 'CAPITAL_RESULT'

/**
 * Sonuç rasyosu alanı → grup eşlemesi.
 * Girdi rasyoları (grossMargin, debtToEquity, vb.) burada YOK —
 *   onlar RATIO_FIELD_TO_METRIC üzerinden doğrudan kapsanır.
 */
export const RATIO_TO_RESULT_GROUP: Record<string, ResultGroup> = {
  // Likidite sonuç rasyoları
  currentRatio:           'LIQUIDITY_RESULT',
  quickRatio:             'LIQUIDITY_RESULT',
  cashRatio:              'LIQUIDITY_RESULT',
  netWorkingCapitalRatio: 'LIQUIDITY_RESULT',
  cashConversionCycle:    'LIQUIDITY_RESULT',

  // Kârlılık sonuç rasyoları (grossMargin GİRDİ — hariç)
  ebitdaMargin:           'PROFIT_RESULT',
  ebitMargin:             'PROFIT_RESULT',
  netProfitMargin:        'PROFIT_RESULT',
  roa:                    'PROFIT_RESULT',
  roe:                    'PROFIT_RESULT',
  roic:                   'PROFIT_RESULT',
  revenueGrowth:          'PROFIT_RESULT',  // RATIO_SPEC'te var → tetiklenebilir

  // Kaldıraç sonuç rasyoları (D/E, D/A, KV Borç Oranı, Faiz Karş. GİRDİ — hariç)
  equityRatio:            'CAPITAL_RESULT',  // RATIO_SPEC'te yok → tetiklenmez (zararsız)
  debtToEbitda:           'CAPITAL_RESULT',  // RATIO_SPEC'te VAR → tetiklenir
}

/**
 * Her grup için mali etki gücüne göre sıralı aksiyon ID listesi.
 * isActionApplicable sonradan uygulanamaz adayları (devre dışı, precondition fail) elee.
 */
export const RESULT_GROUP_ACTION_IDS: Record<ResultGroup, string[]> = {
  LIQUIDITY_RESULT: [
    'A10_CASH_EQUITY_INJECTION',               // Dış nakit → pay direkt artar
    'A05_RECEIVABLE_COLLECTION',               // Alacak → nakit → dönen artar
    'A06_INVENTORY_MONETIZATION',              // Stok → nakit → CCC iyileşir
    'A08_FIXED_ASSET_DISPOSAL',                // Duran varlık satışı → nakit
    'A09_SALE_LEASEBACK',                      // Sat-geri kirala → nakit
    'A22_SHAREHOLDER_RECEIVABLE_COLLECTION',   // Ortak alacak → nakit
    'A02_TRADE_PAYABLE_TO_LT',                 // KV ticari borç UV → payda azalır
    'A03_ADVANCE_TO_LT',                       // Avans UV → payda azalır
    // A04 KASITLI OLARAK DIŞARIDA — matematik: Y>X iken (X-A)/(Y-A) < X/Y
  ],

  PROFIT_RESULT: [
    'A12_GROSS_MARGIN_IMPROVEMENT',            // COGS düşer → EBITDA/EBIT/net hepsi
    'A20_GROSS_MARGIN_REFORM',                 // Fiyat revizyonu → tüm marjlar
    'A14_FINANCE_COST_REDUCTION',              // Faiz azalır → net marj, ROE
    'A18_NET_SALES_GROWTH',                    // Gelir artışı → marj oranları
    'A19_ADVANCE_TO_REVENUE',                  // Gelir öne çekme → tek seferlik
    'A08_FIXED_ASSET_DISPOSAL',                // Varlık azalır → ROA payda küçülür
    'A09_SALE_LEASEBACK',                      // Duran varlık → ROA/ROIC dolaylı
    'A13_OPEX_OPTIMIZATION',                   // Kodda devre dışı (customCheck:false) — sona
  ],

  CAPITAL_RESULT: [
    'A10_CASH_EQUITY_INJECTION',               // Özkaynak artar → equityRatio güçlü
    'A15_DEBT_TO_EQUITY_SWAP',                 // Borç azalır + özkaynak artar → çift etki
    'A04_CASH_PAYDOWN_ST',                     // Toplam borç azalır → D/EBITDA düşer
    'A21_OPERATING_PROFIT_REFORM',             // EBITDA artar → debtToEbitda direkt
    'A14_FINANCE_COST_REDUCTION',              // EBITDA etkisiz ama finansman yükü azalır
    'A18_NET_SALES_GROWTH',                    // EBITDA büyür → D/EBITDA iyileşir
    'A10B_PROMISSORY_NOTE_EQUITY_INJECTION',   // Senetli sermaye → equityRatio sınırlı
    'A11_RETAIN_EARNINGS',                     // Kodda devre dışı (customCheck:false) — sona
    // A01/A02/A03 KASITLI OLARAK DIŞARIDA — KV→UV reclass equityRatio/debtToEbitda etkisi 0
  ],
}

/**
 * Sonuç rasyosu için sıralı grup aday ID'lerini döner.
 *
 * getCoverageActionIdsForRatio boş döndüğünde çağrılır (girdi rasyosu değil).
 * isActionApplicable sonradan devre dışı/uygulanamaz aksiyonları elee.
 *
 * @param ratioField  RatioResult alan adı (ör. 'cashRatio', 'roic')
 * @returns Grup listesi (sıralı, boş array = girdi rasyosu veya eşleşme yok)
 */
export function getResultGroupCandidates(ratioField: string): string[] {
  const group = RATIO_TO_RESULT_GROUP[ratioField]
  if (!group) return []
  return RESULT_GROUP_ACTION_IDS[group]
}
